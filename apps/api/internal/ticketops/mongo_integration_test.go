package ticketops

import (
	"context"
	"errors"
	"net/http"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/payments"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type succeededRefundProvider struct{ calls atomic.Int32 }

func (*succeededRefundProvider) Name() string { return "test" }
func (*succeededRefundProvider) CreateCheckout(context.Context, payments.CheckoutRequest) (payments.CheckoutSession, error) {
	return payments.CheckoutSession{}, nil
}
func (*succeededRefundProvider) VerifyWebhook(http.Header, []byte) (payments.VerifiedEvent, error) {
	return payments.VerifiedEvent{}, nil
}
func (*succeededRefundProvider) GetPaymentStatus(context.Context, string) (payments.PaymentStatus, error) {
	return payments.PaymentStatus{}, nil
}
func (p *succeededRefundProvider) Refund(context.Context, payments.RefundRequest) (payments.RefundResult, error) {
	p.calls.Add(1)
	return payments.RefundResult{Reference: "refund-provider-reference", Status: "succeeded"}, nil
}

func TestCancelEventQueuesLegacyObjectIDLinkedPaidOrder(t *testing.T) {
	uri := os.Getenv("MONGODB_INTEGRATION_URI")
	if uri == "" {
		t.Skip("MONGODB_INTEGRATION_URI not configured")
	}
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Disconnect(context.Background()) })
	db := client.Database("jk024_cancel_" + bson.NewObjectID().Hex())
	t.Cleanup(func() { _ = db.Drop(context.Background()) })
	for _, name := range []string{"events", "ticket_orders", "ticket_communications", "audit_logs"} {
		if err = db.CreateCollection(t.Context(), name); err != nil {
			t.Fatal(err)
		}
	}
	eventObjectID := bson.NewObjectID()
	eventPublicID := "00000000-0000-4000-8000-000000000024"
	orderObjectID := bson.NewObjectID()
	if _, err = db.Collection("events").InsertOne(t.Context(), bson.M{"_id": eventObjectID, "public_id": eventPublicID, "status": "published"}); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Collection("ticket_orders").InsertOne(t.Context(), bson.M{"_id": orderObjectID, "public_id": "00000000-0000-4000-8000-000000000025", "reference": "JKT-2026-ABC12345", "event_id": eventObjectID, "status": "paid"}); err != nil {
		t.Fatal(err)
	}
	store := NewMongoStore(db, UUID)
	queued, err := store.CancelEvent(t.Context(), eventPublicID, "Venue unavailable", bson.NewObjectID().Hex(), time.Date(2026, 8, 5, 18, 0, 0, 0, time.UTC))
	if err != nil || queued != 1 {
		t.Fatalf("queued=%d err=%v", queued, err)
	}
	count, err := db.Collection("ticket_communications").CountDocuments(t.Context(), bson.M{"order_id": orderObjectID, "kind": "event.cancelled_refund_guidance", "status": "pending"})
	if err != nil || count != 1 {
		t.Fatalf("communications=%d err=%v", count, err)
	}
}

func TestRefundPayloadBindingCumulativeStatesAndConcurrentOverRefund(t *testing.T) {
	uri := os.Getenv("MONGODB_INTEGRATION_URI")
	if uri == "" {
		t.Skip("MONGODB_INTEGRATION_URI not configured")
	}
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Disconnect(context.Background()) })
	db := client.Database("jk024_refund_" + bson.NewObjectID().Hex())
	t.Cleanup(func() { _ = db.Drop(context.Background()) })
	for _, name := range []string{"ticket_orders", "ticket_refunds", "issued_tickets", "audit_logs"} {
		if err = db.CreateCollection(t.Context(), name); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = db.Collection("ticket_refunds").Indexes().CreateOne(t.Context(), mongo.IndexModel{Keys: bson.D{{Key: "idempotency_hash", Value: 1}}, Options: options.Index().SetUnique(true)}); err != nil {
		t.Fatal(err)
	}
	provider := &succeededRefundProvider{}
	service := NewService(NewMongoStore(db, UUID), provider, nil)
	actor := bson.NewObjectID().Hex()
	insertOrder := func(publicID, reference string) bson.ObjectID {
		t.Helper()
		id := bson.NewObjectID()
		total, _ := bson.ParseDecimal128("100.00")
		if _, insertErr := db.Collection("ticket_orders").InsertOne(t.Context(), bson.M{"_id": id, "public_id": publicID, "reference": reference, "status": "paid", "currency": "GHS", "total": total, "payment_reference": "payment-" + publicID, "updated_at": time.Now().UTC()}); insertErr != nil {
			t.Fatal(insertErr)
		}
		if _, insertErr := db.Collection("issued_tickets").InsertOne(t.Context(), bson.M{"public_id": publicID, "order_id": id, "status": "active"}); insertErr != nil {
			t.Fatal(insertErr)
		}
		return id
	}
	orderID := "00000000-0000-4000-8000-000000000031"
	orderObjectID := insertOrder(orderID, "JKT-2026-REFUND01")
	partial := RefundInput{OrderID: orderID, Amount: "25.00", Reason: "Customer request", IdempotencyKey: "partial-refund-key-0001"}
	if refund, refundErr := service.Refund(t.Context(), actor, partial); refundErr != nil || refund.Status != "succeeded" {
		t.Fatalf("partial refund=%#v err=%v", refund, refundErr)
	}
	var order struct {
		Status string `bson:"status"`
	}
	if err = db.Collection("ticket_orders").FindOne(t.Context(), bson.M{"_id": orderObjectID}).Decode(&order); err != nil || order.Status != "partially_refunded" {
		t.Fatalf("partial order status=%q err=%v", order.Status, err)
	}
	if _, refundErr := service.Refund(t.Context(), actor, partial); refundErr != nil || provider.calls.Load() != 1 {
		t.Fatalf("replay err=%v provider calls=%d", refundErr, provider.calls.Load())
	}
	mismatch := partial
	mismatch.Amount = "26.00"
	if _, refundErr := service.Refund(t.Context(), actor, mismatch); !errors.Is(refundErr, ErrConflict) {
		t.Fatalf("payload mismatch err=%v", refundErr)
	}
	full := RefundInput{OrderID: orderID, Amount: "75.00", Reason: "Complete approved refund", IdempotencyKey: "full-refund-key-000002"}
	if _, refundErr := service.Refund(t.Context(), actor, full); refundErr != nil {
		t.Fatal(refundErr)
	}
	var ticket struct {
		Status string `bson:"status"`
	}
	if err = db.Collection("ticket_orders").FindOne(t.Context(), bson.M{"_id": orderObjectID}).Decode(&order); err != nil || order.Status != "refunded" {
		t.Fatalf("full order status=%q err=%v", order.Status, err)
	}
	if err = db.Collection("issued_tickets").FindOne(t.Context(), bson.M{"order_id": orderObjectID}).Decode(&ticket); err != nil || ticket.Status != "refunded" {
		t.Fatalf("ticket status=%q err=%v", ticket.Status, err)
	}

	concurrentOrder := "00000000-0000-4000-8000-000000000032"
	insertOrder(concurrentOrder, "JKT-2026-REFUND02")
	start := make(chan struct{})
	results := make(chan error, 2)
	var group sync.WaitGroup
	for i, key := range []string{"concurrent-key-000001", "concurrent-key-000002"} {
		group.Add(1)
		go func(i int, key string) {
			defer group.Done()
			<-start
			_, refundErr := service.Refund(t.Context(), actor, RefundInput{OrderID: concurrentOrder, Amount: "75.00", Reason: "Concurrent request", IdempotencyKey: key})
			results <- refundErr
		}(i, key)
	}
	close(start)
	group.Wait()
	close(results)
	succeeded, conflicted := 0, 0
	for result := range results {
		if result == nil {
			succeeded++
		} else if errors.Is(result, ErrConflict) {
			conflicted++
		} else {
			t.Fatalf("unexpected concurrent result=%v", result)
		}
	}
	if succeeded != 1 || conflicted != 1 {
		t.Fatalf("concurrent succeeded=%d conflicted=%d", succeeded, conflicted)
	}
}
