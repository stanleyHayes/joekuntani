package enquiries

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/services"
)

var (
	ErrInvalid           = errors.New("invalid enquiry")
	ErrRateLimited       = errors.New("enquiry rate limited")
	ErrCaptchaRequired   = errors.New("captcha required")
	ErrUnavailable       = errors.New("enquiry unavailable")
	ErrReferenceConflict = errors.New("enquiry reference conflict")
	referencePattern     = regexp.MustCompile(`^JK-[0-9]{4}-[A-Z0-9]{6}$`)
)

const (
	ConsentTextCurrent    = "I consent to the processing of this enquiry under the privacy notice."
	ConsentVersionCurrent = "2026-08-05"
)

type Store interface {
	// Submit atomically stores the idempotency claim, enquiry and both outbox
	// messages. An existing key returns its original receipt without new rows.
	Submit(context.Context, string, string, Enquiry, []OutboxMessage) (Receipt, error)
}
type ServiceCatalog interface {
	FindByID(context.Context, string) (services.Service, error)
}
type Captcha interface {
	Verify(context.Context, string, string) (bool, error)
}
type RateLimiter interface {
	Allow(context.Context, string) (bool, error)
}
type RiskAssessor interface {
	Assess(context.Context, Submission) Risk
}
type Telemetry interface{ EnquirySubmitted(string) }

type Domain struct {
	store     Store
	catalog   ServiceCatalog
	captcha   Captcha
	limiter   RateLimiter
	risk      RiskAssessor
	telemetry Telemetry
	now       func() time.Time
	id        func() (string, error)
	ipKey     []byte
}

func NewDomain(store Store, catalog ServiceCatalog, captcha Captcha, limiter RateLimiter, risk RiskAssessor, telemetry Telemetry, ipKey []byte) *Domain {
	return &Domain{store: store, catalog: catalog, captcha: captcha, limiter: limiter, risk: risk, telemetry: telemetry, now: time.Now, id: uuid, ipKey: append([]byte(nil), ipKey...)}
}

func (d *Domain) Submit(ctx context.Context, input Submission) (Receipt, error) {
	input.IdempotencyKey = strings.TrimSpace(input.IdempotencyKey)
	if len(input.IdempotencyKey) < 16 || len(input.IdempotencyKey) > 128 || len(d.ipKey) < 32 {
		return Receipt{}, ErrInvalid
	}
	key := d.ipHash(input.ClientIP)
	allowed, err := d.limiter.Allow(ctx, key)
	if err != nil {
		return Receipt{}, ErrUnavailable
	}
	if !allowed {
		return Receipt{}, ErrRateLimited
	}
	if strings.TrimSpace(input.Honeypot) != "" {
		return Receipt{}, ErrInvalid
	}
	requestHash, hashErr := canonicalRequestHash(input)
	if hashErr != nil {
		return Receipt{}, ErrInvalid
	}
	service, err := d.catalog.FindByID(ctx, input.ServiceID)
	if err != nil || !service.Active || service.RetiredAt != nil {
		return Receipt{}, ErrInvalid
	}
	if err = validate(input, service.FormSchema); err != nil {
		return Receipt{}, err
	}
	risk := Risk{}
	if d.risk != nil {
		risk = d.risk.Assess(ctx, input)
	}
	if risk.CaptchaRequired {
		if d.captcha == nil {
			return Receipt{}, ErrUnavailable
		}
		ok, verifyErr := d.captcha.Verify(ctx, input.CaptchaToken, input.ClientIP)
		if verifyErr != nil {
			return Receipt{}, ErrUnavailable
		}
		if !ok {
			return Receipt{}, ErrCaptchaRequired
		}
	}
	id, err := d.id()
	if err != nil {
		return Receipt{}, ErrUnavailable
	}
	now := d.now().UTC()
	enquiry := Enquiry{PublicID: id, ServiceID: service.PublicID, EnquiryType: input.EnquiryType, Source: input.Source, Contact: input.Contact, Details: input.Details, Answers: input.Answers, ProjectBrief: strings.TrimSpace(input.ProjectBrief), Budget: strings.TrimSpace(input.Budget), Timeline: strings.TrimSpace(input.Timeline), Currency: input.Currency, DecisionDeadline: input.DecisionDeadline, AdditionalNotes: strings.TrimSpace(input.AdditionalNotes), MarketingConsent: input.MarketingConsent, ConsentText: ConsentTextCurrent, ConsentVersion: ConsentVersionCurrent, ConsentAt: now, CreatedAt: now, IPHash: key}
	outbox := make([]OutboxMessage, 0, 2)
	for _, kind := range []string{"enquiry.acknowledgement", "enquiry.internal_alert"} {
		messageID, e := d.id()
		if e != nil {
			return Receipt{}, ErrUnavailable
		}
		outbox = append(outbox, OutboxMessage{PublicID: messageID, EnquiryID: id, Kind: kind, NextAttemptAt: now})
	}
	var receipt Receipt
	for attempt := 0; attempt < 5; attempt++ {
		enquiry.Reference, err = reference(d.now())
		if err != nil {
			return Receipt{}, ErrUnavailable
		}
		receipt, err = d.store.Submit(ctx, input.IdempotencyKey, requestHash, enquiry, outbox)
		if !errors.Is(err, ErrReferenceConflict) {
			break
		}
	}
	if err != nil {
		if errors.Is(err, ErrReferenceConflict) {
			return Receipt{}, ErrUnavailable
		}
		return Receipt{}, err
	}
	if d.telemetry != nil && receipt.Stored {
		d.telemetry.EnquirySubmitted(service.Slug)
	}
	return receipt, nil
}

func validate(input Submission, schema services.FormSchema) error {
	input.Contact.Name = strings.TrimSpace(input.Contact.Name)
	input.Contact.Email = strings.TrimSpace(input.Contact.Email)
	if len(input.Contact.Name) < 2 || len(input.Contact.Name) > 120 || len(input.Contact.Email) > 254 || len(input.Contact.Phone) > 40 || len(input.Contact.Organization) > 160 || len(strings.TrimSpace(input.Contact.Role)) < 2 || len(input.Contact.Role) > 120 || !validAlpha2(input.Contact.Country) || len(input.ProjectBrief) > 8000 || len(input.Budget) < 1 || len(input.Budget) > 120 || len(input.Timeline) > 120 || !supportedCurrency(input.Currency) || !validDecisionDate(input.DecisionDeadline) || len(input.AdditionalNotes) > 8000 || !input.Consent || input.ConsentText != ConsentTextCurrent || input.ConsentVersion != ConsentVersionCurrent {
		return ErrInvalid
	}
	if !map[string]bool{"event": true, "brand": true}[input.EnquiryType] || !map[string]bool{"search": true, "social": true, "referral": true, "press": true, "other": true}[input.Source] || !validDetails(input.EnquiryType, input.Details) {
		return ErrInvalid
	}
	address, err := mail.ParseAddress(input.Contact.Email)
	if err != nil || !strings.EqualFold(address.Address, input.Contact.Email) {
		return ErrInvalid
	}
	allowed := map[string]services.Question{}
	for _, q := range schema.Questions {
		allowed[q.Key] = q
	}
	if len(input.Answers) > len(allowed) {
		return ErrInvalid
	}
	for key, value := range input.Answers {
		q, ok := allowed[key]
		if !ok || !validAnswer(q, value) {
			return ErrInvalid
		}
	}
	for _, q := range schema.Questions {
		if q.Required {
			value, ok := input.Answers[q.Key]
			if !ok || !validAnswer(q, value) {
				return ErrInvalid
			}
		}
	}
	return nil
}

func canonicalRequestHash(input Submission) (string, error) {
	input.IdempotencyKey = ""
	input.ClientIP = ""
	input.CaptchaToken = ""
	input.Honeypot = ""
	encoded, err := json.Marshal(input)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:]), nil
}
func supportedCurrency(value string) bool {
	return map[string]bool{"GHS": true, "USD": true, "EUR": true, "GBP": true}[value]
}
func validAlpha2(value string) bool {
	return len(value) == 2 && value[0] >= 'A' && value[0] <= 'Z' && value[1] >= 'A' && value[1] <= 'Z'
}
func validDecisionDate(value string) bool {
	parsed, err := time.Parse("2006-01-02", value)
	return err == nil && !parsed.Before(time.Now().UTC().Truncate(24*time.Hour))
}
func validDetails(kind string, d Details) bool {
	if kind == "event" {
		_, err := time.Parse(time.RFC3339, d.EventAt)
		return boundedText(d.EventType, 1, 120) && err == nil && boundedText(d.Venue, 1, 300) && boundedText(d.City, 1, 120) && validAlpha2(d.Country) && d.AudienceSize > 0 && d.AudienceSize <= 1000000 && boundedText(d.PerformanceDuration, 1, 120) && len(d.ProductionNeeds) <= 4000
	}
	return boundedText(d.CampaignObjective, 1, 1000) && boundedText(d.TargetAudience, 1, 1000) && len(d.Channels) > 0 && len(d.Channels) <= 20 && boundedText(d.RequestedDeliverables, 1, 2000) && boundedText(d.UsageRights, 1, 1000) && boundedText(d.Exclusivity, 1, 1000) && boundedText(d.LaunchDates, 1, 500)
}
func boundedText(v string, min, max int) bool {
	n := len(strings.TrimSpace(v))
	return n >= min && n <= max
}

func validAnswer(q services.Question, value any) bool {
	switch q.Type {
	case services.QuestionCheckbox:
		_, ok := value.(bool)
		return ok
	case services.QuestionNumber:
		number, ok := value.(float64)
		return ok && !math.IsNaN(number) && !math.IsInf(number, 0)
	case services.QuestionMultiSelect:
		values, ok := value.([]any)
		if !ok || len(values) == 0 || len(values) > len(q.Options) {
			return false
		}
		seen := map[string]bool{}
		for _, v := range values {
			s, ok := v.(string)
			if !ok || !contains(q.Options, s) || seen[s] {
				return false
			}
			seen[s] = true
		}
		return true
	default:
		s, ok := value.(string)
		if !ok || len(strings.TrimSpace(s)) == 0 || len(s) > 2000 {
			return false
		}
		if q.Type == services.QuestionSelect {
			return contains(q.Options, s)
		}
		if q.Type == services.QuestionDate {
			_, err := time.Parse("2006-01-02", s)
			return err == nil
		}
		return true
	}
}
func contains(values []string, want string) bool {
	for _, v := range values {
		if v == want {
			return true
		}
	}
	return false
}
func (d *Domain) ipHash(ip string) string {
	mac := hmac.New(sha256.New, d.ipKey)
	_, _ = mac.Write([]byte(strings.TrimSpace(ip)))
	return hex.EncodeToString(mac.Sum(nil))
}
func reference(now time.Time) (string, error) {
	var b [5]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	var code [6]byte
	var n uint64
	for _, v := range b {
		n = n<<8 | uint64(v)
	}
	for i := range code {
		code[i] = alphabet[n%uint64(len(alphabet))]
		n /= uint64(len(alphabet))
	}
	result := fmt.Sprintf("JK-%04d-%s", now.UTC().Year(), code[:])
	if !referencePattern.MatchString(result) {
		return "", ErrUnavailable
	}
	return result, nil
}
func uuid() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}
