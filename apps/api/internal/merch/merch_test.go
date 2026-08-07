package merch

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/payments"
)

type stubStore struct {
	variants []Variant
	created  []Order
}

func (s *stubStore) ListProducts(context.Context, bool) ([]Product, error) { return nil, nil }
func (s *stubStore) ProductBySlug(context.Context, string) (Product, error) {
	return Product{}, ErrNotFound
}
func (s *stubStore) VariantsByIDs(context.Context, []string) ([]Variant, error) {
	return s.variants, nil
}
func (s *stubStore) CreateOrder(_ context.Context, order Order, _ time.Time) error {
	s.created = append(s.created, order)
	return nil
}
func (s *stubStore) SaveCheckout(context.Context, string, string, payments.CheckoutSession, time.Time) error {
	return nil
}
func (s *stubStore) ApplyWebhook(context.Context, string, payments.VerifiedEvent, string, time.Time) (bool, error) {
	return true, nil
}
func (s *stubStore) ListOrders(context.Context, int) ([]Order, error) { return nil, nil }
func (s *stubStore) SaveProduct(_ context.Context, p Product, _ time.Time) (Product, error) {
	return p, nil
}
func (s *stubStore) SaveVariant(_ context.Context, v Variant, _ time.Time) (Variant, error) {
	return v, nil
}
func (s *stubStore) DeleteVariant(context.Context, string) error { return nil }

type stubProvider struct{ last payments.CheckoutRequest }

func (p *stubProvider) Name() string { return "stub" }
func (p *stubProvider) CreateCheckout(_ context.Context, r payments.CheckoutRequest) (payments.CheckoutSession, error) {
	p.last = r
	return payments.CheckoutSession{ID: "s1", URL: "https://checkout.paystack.com/x", ExpiresAt: time.Now().Add(time.Hour)}, nil
}
func (p *stubProvider) VerifyWebhook(http.Header, []byte) (payments.VerifiedEvent, error) {
	return payments.VerifiedEvent{}, nil
}
func (p *stubProvider) GetPaymentStatus(context.Context, string) (payments.PaymentStatus, error) {
	return payments.PaymentStatus{}, nil
}
func (p *stubProvider) Refund(context.Context, payments.RefundRequest) (payments.RefundResult, error) {
	return payments.RefundResult{}, nil
}

func newService(t *testing.T, store Store, provider payments.PaymentProvider) *Service {
	t.Helper()
	service, err := NewService(store, provider, "https://joekuntani.com", "GHS")
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	return service
}

func validBuyer() Buyer {
	return Buyer{Name: "A Fan", Email: "fan@example.com", Phone: "0200000000"}
}

func validDelivery() Delivery {
	return Delivery{Address: "1 Stage Road", City: "Accra", CountryCode: "GH"}
}

func TestMinorUnitsAndBack(t *testing.T) {
	cases := map[string]int64{"1": 100, "125.50": 12550, "0.05": 5, "12.5": 1250}
	for input, want := range cases {
		got, err := minorUnits(input)
		if err != nil || got != want {
			t.Errorf("minorUnits(%q) = %d, %v; want %d", input, got, err, want)
		}
	}
	for _, bad := range []string{"", "-5", "1.234", "abc", "0", "1,5"} {
		if _, err := minorUnits(bad); err == nil {
			t.Errorf("minorUnits(%q) should fail", bad)
		}
	}
	if got := majorUnits(12550); got != "125.50" {
		t.Errorf("majorUnits(12550) = %q", got)
	}
	if got := majorUnits(5); got != "0.05" {
		t.Errorf("majorUnits(5) = %q", got)
	}
}

// The cart carries ids and quantities only — never prices. A client that sends
// its own price must not be able to influence what is charged.
func TestCheckoutPricesFromStoredVariantsNotClientInput(t *testing.T) {
	store := &stubStore{variants: []Variant{{
		PublicID: "v1", ProductID: "p1", ProductName: "Tour tee", Label: "Large",
		Price: "150.00", Currency: "GHS", Stock: 10, Active: true,
	}}}
	provider := &stubProvider{}
	service := newService(t, store, provider)

	order, url, err := service.Checkout(context.Background(), CheckoutInput{
		Lines:    []CartLine{{VariantID: "v1", Quantity: 2}},
		Buyer:    validBuyer(),
		Delivery: validDelivery(),
	})
	if err != nil {
		t.Fatalf("Checkout: %v", err)
	}
	if order.Total != "300.00" {
		t.Errorf("total = %q; want 300.00 (2 × 150.00)", order.Total)
	}
	if provider.last.Amount != "300.00" {
		t.Errorf("charged %q; want the server-computed total", provider.last.Amount)
	}
	if url == "" || order.Lines[0].ProductName != "Tour tee" {
		t.Errorf("unexpected order %+v", order)
	}
	if !IsMerchReference(order.Reference) {
		t.Errorf("reference %q must use the merch prefix", order.Reference)
	}
}

func TestCheckoutRefusesMoreThanStock(t *testing.T) {
	store := &stubStore{variants: []Variant{{
		PublicID: "v1", ProductID: "p1", Label: "Large",
		Price: "150.00", Currency: "GHS", Stock: 1, Active: true,
	}}}
	service := newService(t, store, &stubProvider{})

	_, _, err := service.Checkout(context.Background(), CheckoutInput{
		Lines:    []CartLine{{VariantID: "v1", Quantity: 2}},
		Buyer:    validBuyer(),
		Delivery: validDelivery(),
	})
	if !errors.Is(err, ErrOutOfStock) {
		t.Fatalf("expected ErrOutOfStock, got %v", err)
	}
	if len(store.created) != 0 {
		t.Error("no order should be created when stock is insufficient")
	}
}

func TestCheckoutRefusesInactiveOrUnknownVariant(t *testing.T) {
	store := &stubStore{variants: []Variant{{
		PublicID: "v1", Label: "Large", Price: "10.00", Currency: "GHS", Stock: 5, Active: false,
	}}}
	service := newService(t, store, &stubProvider{})

	for name, id := range map[string]string{"inactive": "v1", "unknown": "nope"} {
		t.Run(name, func(t *testing.T) {
			_, _, err := service.Checkout(context.Background(), CheckoutInput{
				Lines:    []CartLine{{VariantID: id, Quantity: 1}},
				Buyer:    validBuyer(),
				Delivery: validDelivery(),
			})
			if !errors.Is(err, ErrNotFound) {
				t.Fatalf("expected ErrNotFound, got %v", err)
			}
		})
	}
}

func TestCheckoutValidatesBuyerAndDelivery(t *testing.T) {
	store := &stubStore{variants: []Variant{{
		PublicID: "v1", Label: "L", Price: "10.00", Currency: "GHS", Stock: 5, Active: true,
	}}}
	service := newService(t, store, &stubProvider{})
	line := []CartLine{{VariantID: "v1", Quantity: 1}}

	cases := map[string]CheckoutInput{
		"no email":      {Lines: line, Buyer: Buyer{Name: "A"}, Delivery: validDelivery()},
		"bad email":     {Lines: line, Buyer: Buyer{Name: "A", Email: "nope"}, Delivery: validDelivery()},
		"no name":       {Lines: line, Buyer: Buyer{Email: "a@b.com"}, Delivery: validDelivery()},
		"no address":    {Lines: line, Buyer: validBuyer(), Delivery: Delivery{City: "Accra", CountryCode: "GH"}},
		"no city":       {Lines: line, Buyer: validBuyer(), Delivery: Delivery{Address: "1 Road", CountryCode: "GH"}},
		"bad country":   {Lines: line, Buyer: validBuyer(), Delivery: Delivery{Address: "1 Road", City: "Accra", CountryCode: "GHA"}},
		"empty cart":    {Lines: nil, Buyer: validBuyer(), Delivery: validDelivery()},
		"zero quantity": {Lines: []CartLine{{VariantID: "v1", Quantity: 0}}, Buyer: validBuyer(), Delivery: validDelivery()},
	}
	for name, input := range cases {
		t.Run(name, func(t *testing.T) {
			if _, _, err := service.Checkout(context.Background(), input); !errors.Is(err, ErrInvalid) {
				t.Fatalf("expected ErrInvalid, got %v", err)
			}
		})
	}
}

func TestCheckoutRejectsDuplicateCartLines(t *testing.T) {
	store := &stubStore{variants: []Variant{{
		PublicID: "v1", Label: "L", Price: "10.00", Currency: "GHS", Stock: 50, Active: true,
	}}}
	service := newService(t, store, &stubProvider{})

	_, _, err := service.Checkout(context.Background(), CheckoutInput{
		Lines:    []CartLine{{VariantID: "v1", Quantity: 1}, {VariantID: "v1", Quantity: 1}},
		Buyer:    validBuyer(),
		Delivery: validDelivery(),
	})
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("duplicate lines must be rejected so quantity cannot be smuggled, got %v", err)
	}
}

func TestReferencePrefixesDoNotCollide(t *testing.T) {
	if !IsMerchReference("JKM-2026-abcdef12") {
		t.Error("merch reference must be recognised")
	}
	for _, other := range []string{"JKT-2026-abcdef12", "JKD-2026-abcdef12", "JKM-2026"} {
		if IsMerchReference(other) {
			t.Errorf("%q must not be treated as merchandise", other)
		}
	}
}

func TestApplyWebhookRejectsForeignReferences(t *testing.T) {
	service := newService(t, &stubStore{}, &stubProvider{})
	_, err := service.ApplyWebhook(context.Background(), "stub", payments.VerifiedEvent{
		ID: "e1", Type: "payment.succeeded", OrderReference: "JKT-2026-abcdef12",
	}, "hash")
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("ticket references must not reach the merch store, got %v", err)
	}
}
