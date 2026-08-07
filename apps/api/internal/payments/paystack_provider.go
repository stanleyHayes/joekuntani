package payments

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// PaystackProvider talks to the Paystack REST API.
//
// Amounts cross the wire as minor units (kobo, pesewas): the decimal string we
// hold internally is multiplied by 100. Webhooks are signed with HMAC-SHA512 of
// the raw body using the secret key, delivered in `x-paystack-signature`.
type PaystackProvider struct {
	SecretKey string
	BaseURL   string // defaults to https://api.paystack.co
	Client    *http.Client
	Now       func() time.Time
	// SessionTTL bounds how long a returned authorization URL is treated as
	// live. Paystack does not return an expiry, so we impose our own.
	SessionTTL time.Duration
}

const (
	paystackAPIBase     = "https://api.paystack.co"
	paystackSessionTTL  = 30 * time.Minute
	paystackMaxBodyRead = 1 << 20
)

// NewPaystackProvider validates configuration up front so a misconfigured
// deployment fails at boot rather than at the first checkout.
func NewPaystackProvider(secretKey, baseURL string, client *http.Client) (*PaystackProvider, error) {
	secretKey = strings.TrimSpace(secretKey)
	if len(secretKey) < 20 || !strings.HasPrefix(secretKey, "sk_") {
		return nil, ErrInvalid
	}
	if baseURL == "" {
		baseURL = paystackAPIBase
	}
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return nil, ErrInvalid
	}
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	return &PaystackProvider{
		SecretKey:  secretKey,
		BaseURL:    strings.TrimRight(baseURL, "/"),
		Client:     client,
		SessionTTL: paystackSessionTTL,
	}, nil
}

func (p *PaystackProvider) Name() string { return "paystack" }

func (p *PaystackProvider) now() time.Time {
	if p.Now != nil {
		return p.Now().UTC()
	}
	return time.Now().UTC()
}

func (p *PaystackProvider) sessionTTL() time.Duration {
	if p.SessionTTL > 0 {
		return p.SessionTTL
	}
	return paystackSessionTTL
}

type paystackEnvelope struct {
	Status  bool            `json:"status"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

func (p *PaystackProvider) call(ctx context.Context, method, path string, payload any, out any) error {
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return ErrInvalid
		}
		body = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, p.BaseURL+path, body)
	if err != nil {
		return ErrInvalid
	}
	request.Header.Set("Authorization", "Bearer "+p.SecretKey)
	request.Header.Set("Accept", "application/json")
	if payload != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := p.Client.Do(request)
	if err != nil {
		return ErrUnavailable
	}
	defer func() { _ = response.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(response.Body, paystackMaxBodyRead))
	if err != nil {
		return ErrUnavailable
	}
	var envelope paystackEnvelope
	if json.Unmarshal(raw, &envelope) != nil {
		return ErrUnavailable
	}
	if response.StatusCode < 200 || response.StatusCode > 299 || !envelope.Status {
		if response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden {
			return ErrForbidden
		}
		if response.StatusCode == http.StatusBadRequest {
			return ErrInvalid
		}
		return ErrUnavailable
	}
	if out == nil {
		return nil
	}
	if json.Unmarshal(envelope.Data, out) != nil {
		return ErrUnavailable
	}
	return nil
}

// minorUnits converts a decimal amount string ("125.50") into integer minor
// units ("12550"). It refuses anything that is not a plain positive decimal so
// a malformed order total can never become a wrong charge.
func minorUnits(amount string) (int64, error) {
	amount = strings.TrimSpace(amount)
	if amount == "" {
		return 0, ErrInvalid
	}
	whole, fraction, hasFraction := strings.Cut(amount, ".")
	if whole == "" || len(whole) > 15 {
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

type paystackInitializeResponse struct {
	AuthorizationURL string `json:"authorization_url"`
	AccessCode       string `json:"access_code"`
	Reference        string `json:"reference"`
}

func (p *PaystackProvider) CreateCheckout(ctx context.Context, request CheckoutRequest) (CheckoutSession, error) {
	amount, err := minorUnits(request.Amount)
	if err != nil {
		return CheckoutSession{}, ErrInvalid
	}
	currency := strings.ToUpper(strings.TrimSpace(request.Currency))
	if len(currency) != 3 {
		return CheckoutSession{}, ErrInvalid
	}
	email, err := paystackPayerEmail(request)
	if err != nil {
		return CheckoutSession{}, ErrInvalid
	}
	payload := map[string]any{
		"email":        email,
		"amount":       amount,
		"currency":     currency,
		"reference":    request.OrderReference,
		"callback_url": request.ReturnURL,
		"metadata": map[string]any{
			"order_reference": request.OrderReference,
			"idempotency_key": request.IdempotencyKey,
		},
	}
	var data paystackInitializeResponse
	if err := p.call(ctx, http.MethodPost, "/transaction/initialize", payload, &data); err != nil {
		return CheckoutSession{}, err
	}
	parsed, parseErr := url.Parse(data.AuthorizationURL)
	if parseErr != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return CheckoutSession{}, ErrUnavailable
	}
	id := data.Reference
	if id == "" {
		id = data.AccessCode
	}
	if id == "" {
		return CheckoutSession{}, ErrUnavailable
	}
	return CheckoutSession{
		ID:        id,
		URL:       data.AuthorizationURL,
		ExpiresAt: p.now().Add(p.sessionTTL()),
	}, nil
}

// paystackPayerEmail supplies the customer email Paystack requires to
// initialize. It must be the buyer's real address so Paystack can deliver its
// own receipt and so the transaction is attributable in the dashboard.
func paystackPayerEmail(request CheckoutRequest) (string, error) {
	email := strings.TrimSpace(request.PayerEmail)
	at := strings.LastIndex(email, "@")
	if at <= 0 || at == len(email)-1 || len(email) > 254 || strings.ContainsAny(email, " \t\r\n") {
		return "", ErrInvalid
	}
	return email, nil
}

type paystackWebhookEvent struct {
	Event string `json:"event"`
	Data  struct {
		ID              json.Number `json:"id"`
		Reference       string      `json:"reference"`
		Status          string      `json:"status"`
		Message         string      `json:"message"`
		GatewayResponse string      `json:"gateway_response"`
		Transaction     struct {
			Reference string `json:"reference"`
		} `json:"transaction"`
	} `json:"data"`
}

func (p *PaystackProvider) VerifyWebhook(headers http.Header, body []byte) (VerifiedEvent, error) {
	signature := strings.TrimSpace(headers.Get("X-Paystack-Signature"))
	if signature == "" {
		return VerifiedEvent{}, ErrForbidden
	}
	mac := hmac.New(sha512.New, []byte(p.SecretKey))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	if !secureEqual(expected, strings.ToLower(signature)) {
		return VerifiedEvent{}, ErrForbidden
	}
	var payload paystackWebhookEvent
	if json.Unmarshal(body, &payload) != nil {
		return VerifiedEvent{}, ErrInvalid
	}
	orderReference := payload.Data.Reference
	if payload.Data.Transaction.Reference != "" {
		orderReference = payload.Data.Transaction.Reference
	}
	event := VerifiedEvent{
		ID:               paystackEventID(payload),
		OrderReference:   orderReference,
		PaymentReference: payload.Data.Reference,
	}
	switch payload.Event {
	case "charge.success":
		event.Type = "payment.succeeded"
	case "charge.failed", "transaction.failed":
		event.Type = "payment.failed"
		event.FailureCode = firstNonEmpty(payload.Data.GatewayResponse, payload.Data.Message, "failed")
	case "refund.processed":
		event.Type = "refund.succeeded"
	case "refund.failed":
		event.Type = "refund.failed"
		event.FailureCode = firstNonEmpty(payload.Data.Message, "refund_failed")
	default:
		event.Type = payload.Event
	}
	if event.ID == "" || event.OrderReference == "" {
		return VerifiedEvent{}, ErrInvalid
	}
	return event, nil
}

// paystackEventID gives ApplyWebhook a stable dedupe key. Paystack retries the
// same event, so the id must be derived from the payload, not the delivery.
func paystackEventID(payload paystackWebhookEvent) string {
	transactionID := payload.Data.ID.String()
	reference := payload.Data.Reference
	if transactionID == "" && reference == "" {
		return ""
	}
	return fmt.Sprintf("%s:%s:%s", payload.Event, transactionID, reference)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

type paystackVerifyResponse struct {
	Reference string `json:"reference"`
	Status    string `json:"status"`
}

func (p *PaystackProvider) GetPaymentStatus(ctx context.Context, reference string) (PaymentStatus, error) {
	reference = strings.TrimSpace(reference)
	if reference == "" {
		return PaymentStatus{}, ErrInvalid
	}
	var data paystackVerifyResponse
	if err := p.call(ctx, http.MethodGet, "/transaction/verify/"+url.PathEscape(reference), nil, &data); err != nil {
		return PaymentStatus{}, err
	}
	return PaymentStatus{Reference: data.Reference, Status: normalizePaystackStatus(data.Status)}, nil
}

func normalizePaystackStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "success":
		return "succeeded"
	case "failed", "reversed":
		return "failed"
	case "abandoned":
		return "abandoned"
	case "":
		return "pending"
	default:
		return strings.ToLower(status)
	}
}

type paystackRefundResponse struct {
	Status      string `json:"status"`
	Reference   string `json:"reference"`
	Transaction struct {
		Reference string `json:"reference"`
	} `json:"transaction"`
}

func (p *PaystackProvider) Refund(ctx context.Context, request RefundRequest) (RefundResult, error) {
	reference := strings.TrimSpace(request.PaymentReference)
	if reference == "" {
		return RefundResult{}, ErrInvalid
	}
	payload := map[string]any{"transaction": reference}
	if strings.TrimSpace(request.Amount) != "" {
		amount, err := minorUnits(request.Amount)
		if err != nil {
			return RefundResult{}, ErrInvalid
		}
		payload["amount"] = amount
	}
	if currency := strings.ToUpper(strings.TrimSpace(request.Currency)); len(currency) == 3 {
		payload["currency"] = currency
	}
	if reason := strings.TrimSpace(request.Reason); reason != "" {
		payload["merchant_note"] = reason
	}
	var data paystackRefundResponse
	if err := p.call(ctx, http.MethodPost, "/refund", payload, &data); err != nil {
		return RefundResult{}, err
	}
	resultReference := firstNonEmpty(data.Reference, data.Transaction.Reference, reference)
	return RefundResult{Reference: resultReference, Status: normalizePaystackRefundStatus(data.Status)}, nil
}

func normalizePaystackRefundStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "processed", "success":
		return "succeeded"
	case "failed":
		return "failed"
	case "":
		return "pending"
	default:
		return strings.ToLower(status)
	}
}

var _ PaymentProvider = (*PaystackProvider)(nil)
