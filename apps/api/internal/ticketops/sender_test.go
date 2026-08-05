package ticketops

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCancellationSenderEscapesContentAndUsesDeliveryIdempotency(t *testing.T) {
	var body, key string
	server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		data, _ := io.ReadAll(request.Body)
		body, key = string(data), request.Header.Get("Idempotency-Key")
		response.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()
	sender, err := NewResendCommunicationSender(server.Client(), server.URL, "0123456789abcdef", "tickets@example.test")
	if err != nil {
		t.Fatal(err)
	}
	err = sender.SendCancellation(context.Background(), Communication{ID: "delivery-id", OrderReference: "JKT-2026-ABC12345", BuyerEmail: "buyer@example.test", Reason: `<script>alert("x")</script>`})
	if err != nil || key != "delivery-id" || strings.Contains(body, "<script>") || !strings.Contains(body, "refund updates") {
		t.Fatalf("err=%v key=%q body=%q", err, key, body)
	}
}
