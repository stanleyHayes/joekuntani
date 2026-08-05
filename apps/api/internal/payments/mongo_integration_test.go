package payments

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/issuance"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/changes"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type captureTicketSender struct{ delivery issuance.Delivery }

func (s *captureTicketSender) SendTickets(_ context.Context, delivery issuance.Delivery) error {
	s.delivery = delivery
	return nil
}

func TestMongoSignedWebhookIsIdempotentAndAtomic(t *testing.T) {
	uri := os.Getenv("MONGODB_INTEGRATION_URI")
	if uri == "" {
		t.Skip("MONGODB_INTEGRATION_URI not configured")
	}
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Disconnect(context.Background()) })
	db := client.Database("joe_kuntani_test_jk022")
	_ = db.Drop(t.Context())
	t.Cleanup(func() { _ = db.Drop(context.Background()) })
	if err = changes.ApplyAll(t.Context(), db, changes.Registry()); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	eventID, ticketID, orderID := "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201", "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c202", "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c203"
	price, _ := bson.ParseDecimal128("25.50")
	_, err = db.Collection("events").InsertOne(t.Context(), bson.M{"public_id": eventID, "slug": "payment-integration-event", "title": "Payment Integration Event", "summary": "", "description": "", "venue": bson.M{"name": "Venue", "address": "Address", "city": "Accra", "country_code": "GH"}, "policies": bson.M{"refunds": "Refund policy", "entry": "Entry policy", "age_limit": 0}, "starts_at": now.Add(24 * time.Hour), "ends_at": now.Add(26 * time.Hour), "timezone": "Africa/Accra", "capacity": 2, "ticket_capacity_allocated": 2, "banner_asset_id": "", "banner": bson.M{"featured": false}, "status": "published", "published_at": now, "created_at": now, "updated_at": now})
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Collection("ticket_types").InsertOne(t.Context(), bson.M{"public_id": ticketID, "event_id": eventID, "name": "GA", "description": "", "price": price, "currency": "GHS", "capacity": 2, "sold": 0, "reserved": 1, "min_per_order": 1, "max_per_order": 2, "sales_start": now.Add(-time.Hour), "sales_end": now.Add(time.Hour), "paused": false, "status": "on_sale", "sort_order": 0, "created_at": now, "updated_at": now})
	if err != nil {
		t.Fatal(err)
	}
	key := "0123456789abcdef0123456789abcdef"
	keyHash := sha256.Sum256([]byte(key))
	zero, _ := bson.ParseDecimal128("0.00")
	orderInsert, err := db.Collection("ticket_orders").InsertOne(t.Context(), bson.M{"public_id": orderID, "reference": "JKT-2026-ABC12345", "event_id": eventID, "buyer_name": "Buyer", "buyer_email": "buyer@example.test", "buyer_phone": "", "currency": "GHS", "subtotal": price, "fees": zero, "total": price, "status": "pending", "idempotency_hash": hex.EncodeToString(keyHash[:]), "request_hash": hex.EncodeToString(keyHash[:]), "hold_expires_at": now.Add(10 * time.Minute), "terms_version": "2026-08-05", "terms_accepted_at": now, "created_at": now, "updated_at": now})
	if err != nil {
		t.Fatal(err)
	}
	orderObjectID := orderInsert.InsertedID.(bson.ObjectID)
	_, err = db.Collection("ticket_order_items").InsertOne(t.Context(), bson.M{"public_id": "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c204", "order_id": orderID, "event_id": eventID, "ticket_type_id": ticketID, "quantity": 1, "unit_price": price, "line_total": price, "created_at": now})
	if err != nil {
		t.Fatal(err)
	}
	provider := FakeProvider{Secret: []byte("0123456789abcdef0123456789abcdef"), BaseURL: "https://pay.example.test", Now: func() time.Time { return now }}
	issuer, issueErr := issuance.NewMongoIssuer(db, []byte("ticket-signing-key-0123456789abcdef"))
	if issueErr != nil {
		t.Fatal(issueErr)
	}
	paymentStore := NewMongoStore(db)
	paymentStore.SetIssuer(issuer)
	service, _ := NewService(paymentStore, provider, "https://example.test", nil)
	service.now = func() time.Time { return now }
	if _, err = service.Checkout(t.Context(), "JKT-2026-ABC12345", key); err != nil {
		t.Fatal(err)
	}
	event := VerifiedEvent{ID: "evt-one", Type: "payment.succeeded", OrderReference: "JKT-2026-ABC12345", PaymentReference: "pay-one"}
	body, _ := json.Marshal(event)
	mac := hmac.New(sha256.New, provider.Secret)
	mac.Write(body)
	header := http.Header{"X-Payment-Signature": []string{hex.EncodeToString(mac.Sum(nil))}}
	var applied atomic.Int32
	var wg sync.WaitGroup
	for range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ok, e := service.Webhook(t.Context(), header, body)
			if e != nil && !errors.Is(e, ErrConflict) {
				t.Errorf("webhook: %v", e)
			}
			if ok {
				applied.Add(1)
			}
		}()
	}
	wg.Wait()
	if applied.Load() != 1 {
		t.Fatalf("applied=%d", applied.Load())
	}
	var inventory struct {
		Sold     int `bson:"sold"`
		Reserved int `bson:"reserved"`
	}
	_ = db.Collection("ticket_types").FindOne(t.Context(), bson.M{"public_id": ticketID}).Decode(&inventory)
	if inventory.Sold != 1 || inventory.Reserved != 0 {
		t.Fatalf("inventory=%+v", inventory)
	}
	if n, _ := db.Collection("payment_webhooks").CountDocuments(t.Context(), bson.M{}); n != 1 {
		t.Fatalf("webhooks=%d", n)
	}
	var order struct {
		Status string `bson:"status"`
	}
	_ = db.Collection("ticket_orders").FindOne(t.Context(), bson.M{"public_id": orderID}).Decode(&order)
	if order.Status != "paid" {
		t.Fatalf("status=%s", order.Status)
	}
	if n, _ := db.Collection("issued_tickets").CountDocuments(t.Context(), bson.M{"order_id": orderObjectID}); n != 1 {
		t.Fatalf("issued tickets=%d", n)
	}
	if n, _ := db.Collection("ticket_delivery_outbox").CountDocuments(t.Context(), bson.M{"order_id": orderObjectID}); n != 1 {
		t.Fatalf("ticket deliveries=%d", n)
	}
	var issued struct {
		PublicID string `bson:"public_id"`
		Token    string `bson:"qr_token_hash"`
	}
	if err = db.Collection("issued_tickets").FindOne(t.Context(), bson.M{"order_id": orderObjectID}).Decode(&issued); err != nil || issued.Token != sha256HexForTest(issuer.TicketBearer(issued.PublicID)) {
		t.Fatalf("issued bearer hash mismatch: %#v err=%v", issued, err)
	}
	confirmation, confirmErr := issuer.Confirmation(t.Context(), "JKT-2026-ABC12345", issuer.OrderBearer(orderID), now)
	if confirmErr != nil || confirmation.BuyerEmail != "b***@example.test" || len(confirmation.Tickets) != 1 || confirmation.Tickets[0].QRBearer != issuer.TicketBearer(issued.PublicID) {
		t.Fatalf("secure confirmation=%#v err=%v", confirmation, confirmErr)
	}
	if _, confirmErr = issuer.Confirmation(t.Context(), "JKT-2026-ABC12345", "wrong-access-token", now); !errors.Is(confirmErr, issuance.ErrForbidden) {
		t.Fatalf("wrong confirmation access err=%v", confirmErr)
	}
	if _, confirmErr = issuer.Confirmation(t.Context(), "JKT-2026-ABC12345", issuer.OrderBearer(orderID), now.Add(31*24*time.Hour)); !errors.Is(confirmErr, issuance.ErrForbidden) {
		t.Fatalf("expired confirmation access err=%v", confirmErr)
	}
	sender := &captureTicketSender{}
	worker, workerErr := issuance.NewDeliveryWorker(db, issuer, sender, "https://example.test")
	if workerErr != nil {
		t.Fatal(workerErr)
	}
	if workerErr = worker.RunOnce(t.Context(), 10); workerErr != nil {
		t.Fatal(workerErr)
	}
	if sender.delivery.BuyerEmail != "buyer@example.test" || !strings.HasPrefix(sender.delivery.AccessURL, "https://example.test/tickets/JKT-2026-ABC12345?access=jka1.") || strings.Contains(sender.delivery.AccessURL, "buyer") {
		t.Fatalf("unsafe delivery=%#v", sender.delivery)
	}
	if n, _ := db.Collection("ticket_delivery_outbox").CountDocuments(t.Context(), bson.M{"order_id": orderObjectID, "status": "sent"}); n != 1 {
		t.Fatalf("sent ticket deliveries=%d", n)
	}
}

func sha256HexForTest(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
