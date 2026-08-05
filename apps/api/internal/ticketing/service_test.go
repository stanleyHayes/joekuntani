package ticketing

import (
	"context"
	"errors"
	"testing"
	"time"
)

type fakeStore struct {
	receipt    Receipt
	err        error
	created    int
	expired    int
	reconciled LatePaymentResult
}

func (f *fakeStore) Create(context.Context, string, string, CreateInput, time.Time, time.Duration, func() (string, error)) (Receipt, error) {
	f.created++
	return f.receipt, f.err
}
func (f *fakeStore) ExpireDue(context.Context, time.Time, int) (int, error) { return f.expired, f.err }
func (f *fakeStore) ReconcileLatePayment(context.Context, string, time.Time, time.Duration, bool) (LatePaymentResult, error) {
	return f.reconciled, f.err
}

type fakeTelemetry struct{ calls int }

func (t *fakeTelemetry) TicketCheckoutStarted(string, string, int) { t.calls++ }
func validInput() CreateInput {
	return CreateInput{EventID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c111", BuyerName: "Test Buyer", BuyerEmail: "buyer@example.invalid", TermsAccepted: true, TermsVersion: TermsVersionCurrent, IdempotencyKey: "0123456789abcdef", Items: []Selection{{TicketTypeID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c112", Quantity: 2}}}
}
func TestCreateValidationAndTelemetry(t *testing.T) {
	store := &fakeStore{receipt: Receipt{Reference: "JKT-2026-ABCDEFGH", Stored: true}}
	telemetry := &fakeTelemetry{}
	service, _ := NewService(store, 10*time.Minute, telemetry)
	if _, err := service.Create(t.Context(), validInput()); err != nil {
		t.Fatal(err)
	}
	if store.created != 1 || telemetry.calls != 1 {
		t.Fatalf("created=%d telemetry=%d", store.created, telemetry.calls)
	}
	bad := validInput()
	bad.Items = append(bad.Items, bad.Items[0])
	if _, err := service.Create(t.Context(), bad); !errors.Is(err, ErrInvalid) {
		t.Fatalf("duplicate item err=%v", err)
	}
}
func TestMoneyUsesExactMinorUnits(t *testing.T) {
	tests := map[string]int64{"0": 0, "1": 100, "1.2": 120, "999999999.99": 99999999999}
	for value, want := range tests {
		got, err := parseMinor(value)
		if err != nil || got != want {
			t.Fatalf("parseMinor(%q)=%d,%v want %d", value, got, err, want)
		}
		if formatMinor(got) == "" {
			t.Fatal("empty money")
		}
	}
	for _, bad := range []string{"-1", "1.001", "01", "NaN"} {
		if _, err := parseMinor(bad); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
}
func TestLatePaymentRequiresTrustedCaller(t *testing.T) {
	service, _ := NewService(&fakeStore{reconciled: LatePaymentRestored}, 10*time.Minute, nil)
	if _, err := service.ReconcileLatePayment(t.Context(), "JKT-2026-ABCDEFGH", false); !errors.Is(err, ErrForbidden) {
		t.Fatalf("err=%v", err)
	}
	got, err := service.ReconcileLatePayment(t.Context(), "JKT-2026-ABCDEFGH", true)
	if err != nil || got != LatePaymentRestored {
		t.Fatalf("got=%q err=%v", got, err)
	}
}
