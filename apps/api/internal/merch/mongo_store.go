package merch

import (
	"context"
	"errors"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/payments"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const (
	productCollection = "merch_products"
	variantCollection = "merch_variants"
	orderCollection   = "merch_orders"
)

type MongoStore struct{ db *mongo.Database }

func NewMongoStore(db *mongo.Database) *MongoStore { return &MongoStore{db: db} }

type productDocument struct {
	PublicID    string    `bson:"public_id"`
	Slug        string    `bson:"slug"`
	Name        string    `bson:"name"`
	Summary     string    `bson:"summary"`
	Description string    `bson:"description"`
	Category    string    `bson:"category"`
	ImageIDs    []string  `bson:"image_asset_ids"`
	Active      bool      `bson:"active"`
	SortOrder   int32     `bson:"sort_order"`
	CreatedAt   time.Time `bson:"created_at"`
	UpdatedAt   time.Time `bson:"updated_at"`
}

type variantDocument struct {
	PublicID  string          `bson:"public_id"`
	ProductID string          `bson:"product_id"`
	SKU       string          `bson:"sku"`
	Label     string          `bson:"label"`
	Price     bson.Decimal128 `bson:"price"`
	Currency  string          `bson:"currency"`
	Stock     int64           `bson:"stock"`
	Active    bool            `bson:"active"`
	SortOrder int32           `bson:"sort_order"`
	CreatedAt time.Time       `bson:"created_at"`
	UpdatedAt time.Time       `bson:"updated_at"`
}

func (s *MongoStore) ListProducts(ctx context.Context, activeOnly bool) ([]Product, error) {
	filter := bson.M{}
	if activeOnly {
		filter["active"] = true
	}
	cursor, err := s.db.Collection(productCollection).Find(ctx, filter,
		options.Find().SetSort(bson.D{{Key: "sort_order", Value: 1}, {Key: "name", Value: 1}}))
	if err != nil {
		return nil, ErrUnavailable
	}
	defer func() { _ = cursor.Close(ctx) }()

	products := make([]Product, 0)
	ids := make([]string, 0)
	for cursor.Next(ctx) {
		var document productDocument
		if err = cursor.Decode(&document); err != nil {
			return nil, ErrUnavailable
		}
		products = append(products, fromProduct(document))
		ids = append(ids, document.PublicID)
	}
	if err = cursor.Err(); err != nil {
		return nil, ErrUnavailable
	}
	if len(products) == 0 {
		return products, nil
	}

	variants, err := s.variantsForProducts(ctx, ids, activeOnly)
	if err != nil {
		return nil, err
	}
	for index := range products {
		products[index].Variants = variants[products[index].PublicID]
	}
	return products, nil
}

func (s *MongoStore) ProductBySlug(ctx context.Context, slug string) (Product, error) {
	var document productDocument
	err := s.db.Collection(productCollection).FindOne(ctx, bson.M{"slug": slug, "active": true}).Decode(&document)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return Product{}, ErrNotFound
	}
	if err != nil {
		return Product{}, ErrUnavailable
	}
	product := fromProduct(document)
	variants, err := s.variantsForProducts(ctx, []string{document.PublicID}, true)
	if err != nil {
		return Product{}, err
	}
	product.Variants = variants[document.PublicID]
	return product, nil
}

func (s *MongoStore) variantsForProducts(ctx context.Context, productIDs []string, activeOnly bool) (map[string][]Variant, error) {
	filter := bson.M{"product_id": bson.M{"$in": productIDs}}
	if activeOnly {
		filter["active"] = true
	}
	cursor, err := s.db.Collection(variantCollection).Find(ctx, filter,
		options.Find().SetSort(bson.D{{Key: "sort_order", Value: 1}, {Key: "label", Value: 1}}))
	if err != nil {
		return nil, ErrUnavailable
	}
	defer func() { _ = cursor.Close(ctx) }()

	grouped := make(map[string][]Variant, len(productIDs))
	for cursor.Next(ctx) {
		var document variantDocument
		if err = cursor.Decode(&document); err != nil {
			return nil, ErrUnavailable
		}
		grouped[document.ProductID] = append(grouped[document.ProductID], fromVariant(document))
	}
	if err = cursor.Err(); err != nil {
		return nil, ErrUnavailable
	}
	return grouped, nil
}

// VariantsByIDs enriches each variant with its product name so an order line
// records what was bought independently of later product edits.
func (s *MongoStore) VariantsByIDs(ctx context.Context, ids []string) ([]Variant, error) {
	cursor, err := s.db.Collection(variantCollection).Find(ctx, bson.M{"public_id": bson.M{"$in": ids}})
	if err != nil {
		return nil, ErrUnavailable
	}
	defer func() { _ = cursor.Close(ctx) }()

	variants := make([]Variant, 0, len(ids))
	productIDs := make([]string, 0, len(ids))
	for cursor.Next(ctx) {
		var document variantDocument
		if err = cursor.Decode(&document); err != nil {
			return nil, ErrUnavailable
		}
		variants = append(variants, fromVariant(document))
		productIDs = append(productIDs, document.ProductID)
	}
	if err = cursor.Err(); err != nil {
		return nil, ErrUnavailable
	}

	names, err := s.productNames(ctx, productIDs)
	if err != nil {
		return nil, err
	}
	for index := range variants {
		variants[index].ProductName = names[variants[index].ProductID]
	}
	return variants, nil
}

func (s *MongoStore) productNames(ctx context.Context, ids []string) (map[string]string, error) {
	if len(ids) == 0 {
		return map[string]string{}, nil
	}
	cursor, err := s.db.Collection(productCollection).Find(ctx,
		bson.M{"public_id": bson.M{"$in": ids}},
		options.Find().SetProjection(bson.M{"public_id": 1, "name": 1}))
	if err != nil {
		return nil, ErrUnavailable
	}
	defer func() { _ = cursor.Close(ctx) }()

	names := make(map[string]string, len(ids))
	for cursor.Next(ctx) {
		var row struct {
			PublicID string `bson:"public_id"`
			Name     string `bson:"name"`
		}
		if err = cursor.Decode(&row); err != nil {
			return nil, ErrUnavailable
		}
		names[row.PublicID] = row.Name
	}
	return names, cursor.Err()
}

func (s *MongoStore) CreateOrder(ctx context.Context, order Order, now time.Time) error {
	total, err := bson.ParseDecimal128(order.Total)
	if err != nil {
		return ErrInvalid
	}
	lines := make(bson.A, 0, len(order.Lines))
	for _, line := range order.Lines {
		unit, parseErr := bson.ParseDecimal128(line.UnitPrice)
		if parseErr != nil {
			return ErrInvalid
		}
		lineTotal, parseErr := bson.ParseDecimal128(line.LineTotal)
		if parseErr != nil {
			return ErrInvalid
		}
		lines = append(lines, bson.M{
			"variant_id":    line.VariantID,
			"product_name":  line.ProductName,
			"variant_label": line.VariantLabel,
			"sku":           line.SKU,
			"unit_price":    unit,
			"quantity":      int32(line.Quantity),
			"line_total":    lineTotal,
		})
	}
	_, err = s.db.Collection(orderCollection).InsertOne(ctx, bson.M{
		"public_id": order.PublicID,
		"reference": order.Reference,
		"lines":     lines,
		"buyer": bson.M{
			"name": order.Buyer.Name, "email": order.Buyer.Email, "phone": order.Buyer.Phone,
		},
		"delivery": bson.M{
			"address": order.Delivery.Address, "city": order.Delivery.City,
			"region": order.Delivery.Region, "country_code": order.Delivery.CountryCode,
			"notes": order.Delivery.Notes,
		},
		"currency":   order.Currency,
		"total":      total,
		"status":     order.Status,
		"created_at": now,
		"updated_at": now,
	})
	if err != nil {
		return ErrUnavailable
	}
	return nil
}

func (s *MongoStore) SaveCheckout(ctx context.Context, reference, provider string, session payments.CheckoutSession, now time.Time) error {
	result, err := s.db.Collection(orderCollection).UpdateOne(ctx,
		bson.M{"reference": reference, "status": "pending"},
		bson.M{"$set": bson.M{
			"provider":            provider,
			"checkout_session_id": session.ID,
			"checkout_url":        session.URL,
			"checkout_expires_at": session.ExpiresAt,
			"updated_at":          now,
		}})
	if err != nil {
		return ErrUnavailable
	}
	if result.MatchedCount == 0 {
		return ErrNotFound
	}
	return nil
}

// ApplyWebhook records the provider event and, on success, decrements stock.
//
// The decrement is guarded by `stock >= quantity` so concurrent orders for the
// last unit cannot oversell: the loser's update matches nothing and the order is
// flagged for manual resolution rather than silently fulfilled.
func (s *MongoStore) ApplyWebhook(ctx context.Context, provider string, event payments.VerifiedEvent, bodyHash string, now time.Time) (bool, error) {
	status := ""
	switch event.Type {
	case "payment.succeeded":
		status = "paid"
	case "payment.failed":
		status = "failed"
	case "refund.succeeded":
		status = "refunded"
	default:
		return false, nil
	}

	set := bson.M{
		"status": status, "provider": provider,
		"updated_at": now, "last_webhook_hash": bodyHash,
	}
	if status == "paid" {
		set["paid_at"] = now
	}
	result, err := s.db.Collection(orderCollection).UpdateOne(ctx,
		bson.M{"reference": event.OrderReference, "applied_events": bson.M{"$ne": event.ID}},
		bson.M{"$set": set, "$addToSet": bson.M{"applied_events": event.ID}})
	if err != nil {
		return false, ErrUnavailable
	}
	if result.MatchedCount == 0 || result.ModifiedCount == 0 {
		return false, nil
	}
	if status != "paid" {
		return true, nil
	}

	var order struct {
		Lines []struct {
			VariantID string `bson:"variant_id"`
			Quantity  int32  `bson:"quantity"`
		} `bson:"lines"`
	}
	if err = s.db.Collection(orderCollection).FindOne(ctx, bson.M{"reference": event.OrderReference}).Decode(&order); err != nil {
		return true, nil
	}
	shortfall := false
	for _, line := range order.Lines {
		update, decErr := s.db.Collection(variantCollection).UpdateOne(ctx,
			bson.M{"public_id": line.VariantID, "stock": bson.M{"$gte": line.Quantity}},
			bson.M{"$inc": bson.M{"stock": -line.Quantity}, "$set": bson.M{"updated_at": now}})
		if decErr != nil || update.ModifiedCount == 0 {
			shortfall = true
		}
	}
	if shortfall {
		_, _ = s.db.Collection(orderCollection).UpdateOne(ctx,
			bson.M{"reference": event.OrderReference},
			bson.M{"$set": bson.M{"fulfilment_status": "stock_shortfall", "updated_at": now}})
	}
	return true, nil
}

func (s *MongoStore) ListOrders(ctx context.Context, limit int) ([]Order, error) {
	cursor, err := s.db.Collection(orderCollection).Find(ctx, bson.M{},
		options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}).SetLimit(int64(limit)))
	if err != nil {
		return nil, ErrUnavailable
	}
	defer func() { _ = cursor.Close(ctx) }()

	orders := make([]Order, 0, limit)
	for cursor.Next(ctx) {
		var document struct {
			PublicID  string          `bson:"public_id"`
			Reference string          `bson:"reference"`
			Currency  string          `bson:"currency"`
			Total     bson.Decimal128 `bson:"total"`
			Status    string          `bson:"status"`
			CreatedAt time.Time       `bson:"created_at"`
			PaidAt    *time.Time      `bson:"paid_at"`
			Buyer     Buyer           `bson:"buyer"`
			Delivery  Delivery        `bson:"delivery"`
			Lines     []struct {
				VariantID    string          `bson:"variant_id"`
				ProductName  string          `bson:"product_name"`
				VariantLabel string          `bson:"variant_label"`
				SKU          string          `bson:"sku"`
				UnitPrice    bson.Decimal128 `bson:"unit_price"`
				Quantity     int32           `bson:"quantity"`
				LineTotal    bson.Decimal128 `bson:"line_total"`
			} `bson:"lines"`
		}
		if err = cursor.Decode(&document); err != nil {
			return nil, ErrUnavailable
		}
		lines := make([]OrderLine, 0, len(document.Lines))
		for _, line := range document.Lines {
			lines = append(lines, OrderLine{
				VariantID: line.VariantID, ProductName: line.ProductName,
				VariantLabel: line.VariantLabel, SKU: line.SKU,
				UnitPrice: line.UnitPrice.String(), Quantity: int(line.Quantity),
				LineTotal: line.LineTotal.String(),
			})
		}
		orders = append(orders, Order{
			PublicID: document.PublicID, Reference: document.Reference,
			Lines: lines, Buyer: document.Buyer, Delivery: document.Delivery,
			Currency: document.Currency, Total: document.Total.String(),
			Status: document.Status, CreatedAt: document.CreatedAt, PaidAt: document.PaidAt,
		})
	}
	return orders, cursor.Err()
}

func (s *MongoStore) SaveProduct(ctx context.Context, product Product, now time.Time) (Product, error) {
	set := bson.M{
		"slug": product.Slug, "name": product.Name, "summary": product.Summary,
		"description": product.Description, "category": product.Category,
		"image_asset_ids": product.ImageIDs, "active": product.Active,
		"sort_order": product.SortOrder, "updated_at": now,
	}
	_, err := s.db.Collection(productCollection).UpdateOne(ctx,
		bson.M{"public_id": product.PublicID},
		bson.M{"$set": set, "$setOnInsert": bson.M{"public_id": product.PublicID, "created_at": now}},
		options.UpdateOne().SetUpsert(true))
	if err != nil {
		return Product{}, ErrConflict
	}
	product.UpdatedAt = now
	return product, nil
}

func (s *MongoStore) SaveVariant(ctx context.Context, variant Variant, now time.Time) (Variant, error) {
	price, err := bson.ParseDecimal128(variant.Price)
	if err != nil {
		return Variant{}, ErrInvalid
	}
	set := bson.M{
		"product_id": variant.ProductID, "sku": variant.SKU, "label": variant.Label,
		"price": price, "currency": variant.Currency, "stock": variant.Stock,
		"active": variant.Active, "sort_order": variant.SortOrder, "updated_at": now,
	}
	_, err = s.db.Collection(variantCollection).UpdateOne(ctx,
		bson.M{"public_id": variant.PublicID},
		bson.M{"$set": set, "$setOnInsert": bson.M{"public_id": variant.PublicID, "created_at": now}},
		options.UpdateOne().SetUpsert(true))
	if err != nil {
		return Variant{}, ErrConflict
	}
	return variant, nil
}

func (s *MongoStore) DeleteVariant(ctx context.Context, id string) error {
	result, err := s.db.Collection(variantCollection).DeleteOne(ctx, bson.M{"public_id": id})
	if err != nil {
		return ErrUnavailable
	}
	if result.DeletedCount == 0 {
		return ErrNotFound
	}
	return nil
}

func fromProduct(document productDocument) Product {
	images := document.ImageIDs
	if images == nil {
		images = []string{}
	}
	return Product{
		PublicID: document.PublicID, Slug: document.Slug, Name: document.Name,
		Summary: document.Summary, Description: document.Description,
		Category: document.Category, ImageIDs: images, Active: document.Active,
		SortOrder: document.SortOrder, Variants: []Variant{},
		CreatedAt: document.CreatedAt, UpdatedAt: document.UpdatedAt,
	}
}

func fromVariant(document variantDocument) Variant {
	return Variant{
		PublicID: document.PublicID, ProductID: document.ProductID, SKU: document.SKU,
		Label: document.Label, Price: document.Price.String(), Currency: document.Currency,
		Stock: document.Stock, Active: document.Active, SortOrder: document.SortOrder,
	}
}
