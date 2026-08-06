package ticketanalytics

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/checkin"
)

type checkinRaceStore struct {
	mu     sync.Mutex
	status map[string]string
}

func (s *checkinRaceStore) CountCheckedIn(context.Context, string) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	count := int64(0)
	for _, status := range s.status {
		if status == "checked_in" {
			count++
		}
	}
	return count, nil
}

func (s *checkinRaceStore) Scan(_ context.Context, _ checkin.Actor, input checkin.ScanInput, at time.Time) (checkin.ScanResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	status, ok := s.status[input.Token]
	if !ok {
		return checkin.ScanResult{Result: checkin.ResultInvalid}, nil
	}
	if status == "checked_in" {
		return checkin.ScanResult{Result: checkin.ResultAlreadyCheckedIn, CheckedInCount: 1}, checkin.ErrConflict
	}
	s.status[input.Token] = "checked_in"
	return checkin.ScanResult{Result: checkin.ResultAdmitted, CheckedInAt: &at, CheckedInCount: 1}, nil
}

func TestCheckinConcurrencySuiteAdmitsOnce(t *testing.T) {
	t.Parallel()
	store := &checkinRaceStore{status: map[string]string{"bearer-token-123456": "valid"}}
	service := checkin.NewService(store)
	actor := checkin.Actor{InternalID: "507f1f77bcf86cd799439011"}
	var wg sync.WaitGroup
	results := make([]checkin.Result, 8)
	errs := make([]error, 8)
	wg.Add(8)
	for i := 0; i < 8; i++ {
		go func(idx int) {
			defer wg.Done()
			out, err := service.Scan(context.Background(), actor, checkin.ScanInput{
				EventID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201",
				Token:   "bearer-token-123456",
			})
			results[idx] = out.Result
			errs[idx] = err
		}(i)
	}
	wg.Wait()
	admitted := 0
	for i := 0; i < 8; i++ {
		if results[i] == checkin.ResultAdmitted && errs[i] == nil {
			admitted++
		}
	}
	if admitted != 1 {
		t.Fatalf("admitted=%d results=%v errs=%v", admitted, results, errs)
	}
}

func TestFinancialRoleMatrix(t *testing.T) {
	t.Parallel()
	if canReadFinancial(auth.RoleAnalyst) || !canRead(auth.RoleAnalyst) {
		t.Fatal("analyst should read ops metrics without financial sales")
	}
	if !canReadFinancial(auth.RoleAdministrator) {
		t.Fatal("administrator should read financial ticket analytics")
	}
}
