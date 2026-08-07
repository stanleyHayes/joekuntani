// Package merch implements the merchandise store: products, their purchasable
// variants, and the orders placed against them.
//
// It reuses payments.PaymentProvider so Paystack configuration lives in one
// place, but keeps its own store, JKM- reference space and lifecycle — a
// merchandise order must never touch ticket inventory.
//
// Stock: an order is created without holding stock, and stock is decremented
// atomically when payment succeeds, guarded by a `stock >= quantity` filter.
// That means two buyers can both reach checkout for the last item and the
// second payment will be refused at fulfilment rather than at the door — but it
// cannot oversell, which is the property that matters. Holding stock at
// checkout would need reservation expiry; that is deliberately not built yet.
package merch

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/payments"
)

var (
	ErrInvalid     = errors.New("invalid merchandise request")
	ErrUnavailable = errors.New("merchandise unavailable")
	ErrNotFound    = errors.New("merchandise not found")
	ErrOutOfStock  = errors.New("insufficient stock")
	ErrConflict    = errors.New("merchandise state conflict")
)

// ReferencePrefix distinguishes merchandise orders from ticket orders (JKT-)
// and donations (JKD-) on the shared provider webhook.
const ReferencePrefix = "JKM-"

const (
	maxLineQuantity = 20
	maxOrderLines   = 20
)

type Product struct {
	PublicID    string    `json:"id"`
	Slug        string    `json:"slug"`
	Name        string    `json:"name"`
	Summary     string    `json:"summary"`
	Description string    `json:"description"`
	Category    string    `json:"category"`
	ImageIDs    []string  `json:"image_asset_ids"`
	Active      bool      `json:"active"`
	SortOrder   int32     `json:"sort_order"`
	Variants    []Variant `json:"variants"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Variant struct {
	PublicID  string `json:"id"`
	ProductID string `json:"product_id"`
	// ProductName is denormalised onto the variant when read for checkout so an
	// order line records what was bought even if the product is renamed later.
	ProductName string `json:"product_name,omitempty"`
	SKU         string `json:"sku"`
	Label       string `json:"label"`
	Price       string `json:"price"`
	Currency    string `json:"currency"`
	Stock       int64  `json:"stock"`
	Active      bool   `json:"active"`
	SortOrder   int32  `json:"sort_order"`
}

type OrderLine struct {
	VariantID    string `json:"variant_id"`
	ProductName  string `json:"product_name"`
	VariantLabel string `json:"variant_label"`
	SKU          string `json:"sku"`
	UnitPrice    string `json:"unit_price"`
	Quantity     int    `json:"quantity"`
	LineTotal    string `json:"line_total"`
}

type Buyer struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Phone string `json:"phone"`
}

// Delivery is captured at checkout because merchandise is shipped, unlike
// tickets which are delivered by email.
type Delivery struct {
	Address     string `json:"address"`
	City        string `json:"city"`
	Region      string `json:"region"`
	CountryCode string `json:"country_code"`
	Notes       string `json:"notes"`
}

type Order struct {
	PublicID  string      `json:"id"`
	Reference string      `json:"reference"`
	Lines     []OrderLine `json:"lines"`
	Buyer     Buyer       `json:"buyer"`
	Delivery  Delivery    `json:"delivery"`
	Currency  string      `json:"currency"`
	Total     string      `json:"total"`
	Status    string      `json:"status"`
	CreatedAt time.Time   `json:"created_at"`
	PaidAt    *time.Time  `json:"paid_at,omitempty"`
}

// CartLine is one requested variant and quantity from the public checkout.
type CartLine struct {
	VariantID string
	Quantity  int
}

type CheckoutInput struct {
	Lines    []CartLine
	Buyer    Buyer
	Delivery Delivery
}

type Store interface {
	ListProducts(ctx context.Context, activeOnly bool) ([]Product, error)
	ProductBySlug(ctx context.Context, slug string) (Product, error)
	VariantsByIDs(ctx context.Context, ids []string) ([]Variant, error)
	CreateOrder(ctx context.Context, order Order, now time.Time) error
	SaveCheckout(ctx context.Context, reference, provider string, session payments.CheckoutSession, now time.Time) error
	ApplyWebhook(ctx context.Context, provider string, event payments.VerifiedEvent, bodyHash string, now time.Time) (bool, error)
	ListOrders(ctx context.Context, limit int) ([]Order, error)
	SaveProduct(ctx context.Context, product Product, now time.Time) (Product, error)
	SaveVariant(ctx context.Context, variant Variant, now time.Time) (Variant, error)
	DeleteVariant(ctx context.Context, id string) error
}

type Service struct {
	store      Store
	provider   payments.PaymentProvider
	returnBase string
	currency   string
	now        func() time.Time
}

func NewService(store Store, provider payments.PaymentProvider, returnBase, currency string) (*Service, error) {
	if store == nil || provider == nil {
		return nil, ErrInvalid
	}
	parsed, err := url.Parse(returnBase)
	if err != nil || parsed.Host == "" {
		return nil, ErrInvalid
	}
	host := strings.ToLower(parsed.Hostname())
	loopback := host == "localhost" || host == "127.0.0.1" || host == "::1"
	if parsed.Scheme != "https" && !(parsed.Scheme == "http" && loopback) {
		return nil, ErrInvalid
	}
	currency = strings.ToUpper(strings.TrimSpace(currency))
	if len(currency) != 3 {
		currency = "GHS"
	}
	return &Service{
		store:      store,
		provider:   provider,
		returnBase: strings.TrimRight(returnBase, "/"),
		currency:   currency,
		now:        time.Now,
	}, nil
}

func (s *Service) Currency() string { return s.currency }

// Enabled reports whether a real payment provider is configured, so the shop
// can say so up front rather than failing at the last step.
func (s *Service) Enabled() bool {
	return s.provider != nil && s.provider.Name() != "unconfigured"
}

func (s *Service) Catalogue(ctx context.Context) ([]Product, error) {
	return s.store.ListProducts(ctx, true)
}

func (s *Service) Product(ctx context.Context, slug string) (Product, error) {
	if !validSlug(slug) {
		return Product{}, ErrInvalid
	}
	return s.store.ProductBySlug(ctx, slug)
}

// Checkout prices the cart from stored variants — never from client input — and
// hands back a provider checkout URL.
func (s *Service) Checkout(ctx context.Context, input CheckoutInput) (Order, string, error) {
	lines, err := normalizeCart(input.Lines)
	if err != nil {
		return Order{}, "", err
	}
	buyer, err := normalizeBuyer(input.Buyer)
	if err != nil {
		return Order{}, "", err
	}
	delivery, err := normalizeDelivery(input.Delivery)
	if err != nil {
		return Order{}, "", err
	}

	ids := make([]string, 0, len(lines))
	for _, line := range lines {
		ids = append(ids, line.VariantID)
	}
	variants, err := s.store.VariantsByIDs(ctx, ids)
	if err != nil {
		return Order{}, "", ErrUnavailable
	}
	byID := make(map[string]Variant, len(variants))
	for _, variant := range variants {
		byID[variant.PublicID] = variant
	}

	orderLines := make([]OrderLine, 0, len(lines))
	totalMinor := int64(0)
	for _, line := range lines {
		variant, present := byID[line.VariantID]
		if !present || !variant.Active {
			return Order{}, "", ErrNotFound
		}
		if variant.Currency != s.currency {
			return Order{}, "", ErrInvalid
		}
		if variant.Stock < int64(line.Quantity) {
			return Order{}, "", ErrOutOfStock
		}
		unit, err := minorUnits(variant.Price)
		if err != nil {
			return Order{}, "", ErrInvalid
		}
		lineMinor := unit * int64(line.Quantity)
		totalMinor += lineMinor
		orderLines = append(orderLines, OrderLine{
			VariantID:    variant.PublicID,
			ProductName:  variant.ProductName,
			VariantLabel: variant.Label,
			SKU:          variant.SKU,
			UnitPrice:    variant.Price,
			Quantity:     line.Quantity,
			LineTotal:    majorUnits(lineMinor),
		})
	}
	if totalMinor <= 0 {
		return Order{}, "", ErrInvalid
	}

	now := s.now().UTC()
	reference, err := newReference(now)
	if err != nil {
		return Order{}, "", ErrUnavailable
	}
	publicID, err := NewUUID()
	if err != nil {
		return Order{}, "", ErrUnavailable
	}
	order := Order{
		PublicID:  publicID,
		Reference: reference,
		Lines:     orderLines,
		Buyer:     buyer,
		Delivery:  delivery,
		Currency:  s.currency,
		Total:     majorUnits(totalMinor),
		Status:    "pending",
		CreatedAt: now,
	}
	if err = s.store.CreateOrder(ctx, order, now); err != nil {
		return Order{}, "", ErrUnavailable
	}

	session, err := s.provider.CreateCheckout(ctx, payments.CheckoutRequest{
		IdempotencyKey: order.PublicID,
		OrderReference: order.Reference,
		Currency:       order.Currency,
		Amount:         order.Total,
		PayerEmail:     order.Buyer.Email,
		ReturnURL:      s.returnBase + "/shop/thank-you?reference=" + url.QueryEscape(order.Reference),
	})
	if err != nil {
		return Order{}, "", ErrUnavailable
	}
	parsed, parseErr := url.Parse(session.URL)
	if parseErr != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return Order{}, "", ErrUnavailable
	}
	if err = s.store.SaveCheckout(ctx, order.Reference, s.provider.Name(), session, now); err != nil {
		return Order{}, "", ErrUnavailable
	}
	return order, session.URL, nil
}

func (s *Service) ApplyWebhook(ctx context.Context, provider string, event payments.VerifiedEvent, bodyHash string) (bool, error) {
	if !IsMerchReference(event.OrderReference) {
		return false, ErrInvalid
	}
	return s.store.ApplyWebhook(ctx, provider, event, bodyHash, s.now().UTC())
}

func (s *Service) Orders(ctx context.Context, limit int) ([]Order, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	return s.store.ListOrders(ctx, limit)
}

func (s *Service) AdminProducts(ctx context.Context) ([]Product, error) {
	return s.store.ListProducts(ctx, false)
}

func (s *Service) SaveProduct(ctx context.Context, product Product) (Product, error) {
	product.Name = strings.TrimSpace(product.Name)
	product.Slug = strings.TrimSpace(strings.ToLower(product.Slug))
	if product.Name == "" || !validSlug(product.Slug) {
		return Product{}, ErrInvalid
	}
	if product.PublicID == "" {
		id, err := NewUUID()
		if err != nil {
			return Product{}, ErrUnavailable
		}
		product.PublicID = id
	}
	if product.ImageIDs == nil {
		product.ImageIDs = []string{}
	}
	return s.store.SaveProduct(ctx, product, s.now().UTC())
}

func (s *Service) SaveVariant(ctx context.Context, variant Variant) (Variant, error) {
	variant.Label = strings.TrimSpace(variant.Label)
	variant.SKU = strings.TrimSpace(variant.SKU)
	if variant.Label == "" || variant.ProductID == "" {
		return Variant{}, ErrInvalid
	}
	if _, err := minorUnits(variant.Price); err != nil {
		return Variant{}, ErrInvalid
	}
	if variant.Stock < 0 {
		return Variant{}, ErrInvalid
	}
	currency := strings.ToUpper(strings.TrimSpace(variant.Currency))
	if len(currency) != 3 {
		currency = s.currency
	}
	variant.Currency = currency
	if variant.PublicID == "" {
		id, err := NewUUID()
		if err != nil {
			return Variant{}, ErrUnavailable
		}
		variant.PublicID = id
	}
	return s.store.SaveVariant(ctx, variant, s.now().UTC())
}

func (s *Service) DeleteVariant(ctx context.Context, id string) error {
	if id == "" {
		return ErrInvalid
	}
	return s.store.DeleteVariant(ctx, id)
}

// IsMerchReference reports whether a provider reference belongs to a
// merchandise order.
func IsMerchReference(reference string) bool {
	return len(reference) == 17 && strings.HasPrefix(reference, ReferencePrefix)
}

func normalizeCart(lines []CartLine) ([]CartLine, error) {
	if len(lines) == 0 || len(lines) > maxOrderLines {
		return nil, ErrInvalid
	}
	seen := make(map[string]bool, len(lines))
	result := make([]CartLine, 0, len(lines))
	for _, line := range lines {
		id := strings.TrimSpace(line.VariantID)
		if id == "" || seen[id] {
			return nil, ErrInvalid
		}
		if line.Quantity < 1 || line.Quantity > maxLineQuantity {
			return nil, ErrInvalid
		}
		seen[id] = true
		result = append(result, CartLine{VariantID: id, Quantity: line.Quantity})
	}
	return result, nil
}

func normalizeBuyer(buyer Buyer) (Buyer, error) {
	buyer.Name = clip(strings.TrimSpace(buyer.Name), 120)
	buyer.Email = strings.TrimSpace(buyer.Email)
	buyer.Phone = clip(strings.TrimSpace(buyer.Phone), 40)
	if buyer.Name == "" || !validEmail(buyer.Email) {
		return Buyer{}, ErrInvalid
	}
	return buyer, nil
}

func normalizeDelivery(delivery Delivery) (Delivery, error) {
	delivery.Address = clip(strings.TrimSpace(delivery.Address), 300)
	delivery.City = clip(strings.TrimSpace(delivery.City), 120)
	delivery.Region = clip(strings.TrimSpace(delivery.Region), 120)
	delivery.Notes = clip(strings.TrimSpace(delivery.Notes), 500)
	code := strings.ToUpper(strings.TrimSpace(delivery.CountryCode))
	if len(code) != 2 {
		return Delivery{}, ErrInvalid
	}
	delivery.CountryCode = code
	if delivery.Address == "" || delivery.City == "" {
		return Delivery{}, ErrInvalid
	}
	return delivery, nil
}

// minorUnits mirrors the payment provider's conversion so the price stored, the
// price shown and the amount charged cannot drift apart.
func minorUnits(amount string) (int64, error) {
	amount = strings.TrimSpace(amount)
	if amount == "" {
		return 0, ErrInvalid
	}
	whole, fraction, hasFraction := strings.Cut(amount, ".")
	if whole == "" || len(whole) > 12 {
		return 0, ErrInvalid
	}
	if hasFraction {
		if len(fraction) > 2 {
			return 0, ErrInvalid
		}
		fraction += strings.Repeat("0", 2-len(fraction))
	} else {
		fraction = "00"
	}
	for _, part := range []string{whole, fraction} {
		for _, character := range part {
			if character < '0' || character > '9' {
				return 0, ErrInvalid
			}
		}
	}
	units, err := strconv.ParseInt(whole+fraction, 10, 64)
	if err != nil || units <= 0 {
		return 0, ErrInvalid
	}
	return units, nil
}

func majorUnits(minor int64) string {
	return fmt.Sprintf("%d.%02d", minor/100, minor%100)
}

func validSlug(value string) bool {
	if len(value) < 2 || len(value) > 80 {
		return false
	}
	for index, character := range value {
		switch {
		case character >= 'a' && character <= 'z', character >= '0' && character <= '9':
		case character == '-' && index != 0 && index != len(value)-1:
		default:
			return false
		}
	}
	return true
}

func validEmail(email string) bool {
	at := strings.LastIndex(email, "@")
	return at > 0 && at != len(email)-1 && len(email) <= 254 &&
		!strings.ContainsAny(email, " \t\r\n")
}

func clip(value string, max int) string {
	if len(value) <= max {
		return value
	}
	return value[:max]
}

func newReference(now time.Time) (string, error) {
	buffer := make([]byte, 5)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return fmt.Sprintf("%s%04d-%s", ReferencePrefix, now.Year(), hex.EncodeToString(buffer)[:8]), nil
}

// NewUUID is exported so the store can mint ids for embedded records.
func NewUUID() (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	buffer[6] = (buffer[6] & 0x0f) | 0x40
	buffer[8] = (buffer[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", buffer[:4], buffer[4:6], buffer[6:8], buffer[8:10], buffer[10:]), nil
}
