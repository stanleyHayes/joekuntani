package enquiries

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/services"
)

const serviceID = "11111111-1111-4111-8111-111111111111"

type memoryStore struct {
	mu        sync.Mutex
	receipts  map[string]Receipt
	hashes    map[string]string
	enquiries []Enquiry
	outbox    []OutboxMessage
}

func (s *memoryStore) Submit(_ context.Context, key, requestHash string, e Enquiry, out []OutboxMessage) (Receipt, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r, ok := s.receipts[key]; ok {
		if s.hashes[key] != requestHash {
			return Receipt{}, ErrInvalid
		}
		r.Stored = false
		return r, nil
	}
	r := Receipt{Reference: e.Reference, Stored: true}
	s.receipts[key] = r
	if s.hashes == nil {
		s.hashes = map[string]string{}
	}
	s.hashes[key] = requestHash
	s.enquiries = append(s.enquiries, e)
	s.outbox = append(s.outbox, out...)
	return r, nil
}

type catalog struct{ item services.Service }

func (c catalog) FindByID(context.Context, string) (services.Service, error) { return c.item, nil }

type limiter struct {
	allow bool
	err   error
}

func (l limiter) Allow(context.Context, string) (bool, error) { return l.allow, l.err }

type captcha struct {
	ok  bool
	err error
}

func (c captcha) Verify(context.Context, string, string) (bool, error) { return c.ok, c.err }

type risk bool

func (r risk) Assess(context.Context, Submission) Risk { return Risk{CaptchaRequired: bool(r)} }

func fixture() Submission {
	return Submission{ServiceID: serviceID, EnquiryType: "brand", Source: "search", Contact: Contact{Name: "Ada Person", Email: "ada@example.com", Role: "Director", Country: "GH"}, Details: Details{CampaignObjective: "Launch safely", TargetAudience: "Ghanaian adults", Channels: []string{"Web"}, RequestedDeliverables: "Campaign content", UsageRights: "Digital campaign", Exclusivity: "None", LaunchDates: "2026 Q4"}, Answers: map[string]any{"goal": "Launch safely", "channels": []any{"Web", "Live"}}, ProjectBrief: "A sufficiently detailed approved project brief.", Budget: "Discuss", Currency: "GHS", DecisionDeadline: "2026-08-06", Timeline: "This quarter", Consent: true, ConsentText: ConsentTextCurrent, ConsentVersion: ConsentVersionCurrent, IdempotencyKey: "idem-1234567890123456", ClientIP: "203.0.113.7"}
}
func domain(store *memoryStore, lim RateLimiter, cap Captcha, r RiskAssessor) *Domain {
	d := NewDomain(store, catalog{services.Service{PublicID: serviceID, Slug: "strategy", Active: true, FormSchema: services.FormSchema{Version: 1, Questions: []services.Question{{Key: "goal", Label: "Goal", Type: services.QuestionTextarea, Required: true}, {Key: "channels", Label: "Channels", Type: services.QuestionMultiSelect, Required: true, Options: []string{"Web", "Live"}}}}}}, cap, lim, r, nil, []byte("0123456789abcdef0123456789abcdef"))
	d.now = func() time.Time { return time.Date(2026, 8, 5, 16, 0, 0, 0, time.UTC) }
	return d
}

func TestSubmitAtomicallyDeduplicatesConcurrentRequests(t *testing.T) {
	store := &memoryStore{receipts: map[string]Receipt{}}
	d := domain(store, limiter{allow: true}, captcha{ok: true}, risk(false))
	start := make(chan struct{})
	results := make(chan Receipt, 2)
	errs := make(chan error, 2)
	for range 2 {
		go func() { <-start; r, e := d.Submit(context.Background(), fixture()); results <- r; errs <- e }()
	}
	close(start)
	r1, r2 := <-results, <-results
	if e1, e2 := <-errs, <-errs; e1 != nil || e2 != nil {
		t.Fatalf("errors %v %v", e1, e2)
	}
	if r1.Reference != r2.Reference || len(store.enquiries) != 1 || len(store.outbox) != 2 {
		t.Fatalf("non-atomic idempotency: %#v %#v enquiries=%d outbox=%d", r1, r2, len(store.enquiries), len(store.outbox))
	}
	if store.enquiries[0].IPHash == fixture().ClientIP || len(store.enquiries[0].IPHash) != 64 {
		t.Fatal("raw IP stored or invalid hash")
	}
}

func TestValidationSpamCaptchaAndRateLimitFailClosed(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*Submission)
		lim    RateLimiter
		cap    Captcha
		r      RiskAssessor
		want   error
	}{{"unknown answer", func(s *Submission) { s.Answers["admin"] = true }, limiter{allow: true}, captcha{ok: true}, risk(false), ErrInvalid}, {"honeypot", func(s *Submission) { s.Honeypot = "bot" }, limiter{allow: true}, captcha{ok: true}, risk(false), ErrInvalid}, {"rate", func(*Submission) {}, limiter{allow: false}, captcha{ok: true}, risk(false), ErrRateLimited}, {"captcha invalid", func(*Submission) {}, limiter{allow: true}, captcha{ok: false}, risk(true), ErrCaptchaRequired}, {"captcha outage", func(*Submission) {}, limiter{allow: true}, captcha{err: errors.New("down")}, risk(true), ErrUnavailable}}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := fixture()
			tt.mutate(&input)
			_, err := domain(&memoryStore{receipts: map[string]Receipt{}}, tt.lim, tt.cap, tt.r).Submit(context.Background(), input)
			if !errors.Is(err, tt.want) {
				t.Fatalf("got %v want %v", err, tt.want)
			}
		})
	}
}

func TestRetiredServiceAndTamperedDynamicAnswerAreRejected(t *testing.T) {
	store := &memoryStore{receipts: map[string]Receipt{}}
	d := domain(store, limiter{allow: true}, captcha{ok: true}, risk(false))
	retired := d.catalog.(catalog).item
	now := time.Now()
	retired.RetiredAt = &now
	d.catalog = catalog{retired}
	if _, err := d.Submit(context.Background(), fixture()); !errors.Is(err, ErrInvalid) {
		t.Fatalf("retired accepted: %v", err)
	}
	d = domain(store, limiter{allow: true}, captcha{ok: true}, risk(false))
	input := fixture()
	input.Answers["channels"] = []any{"Injected"}
	if _, err := d.Submit(context.Background(), input); !errors.Is(err, ErrInvalid) {
		t.Fatalf("tampered option accepted: %v", err)
	}
}
