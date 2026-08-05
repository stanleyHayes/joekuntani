package enquiries

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"
)

type HTTPHandler struct {
	domain       *Domain
	trustedProxy func(net.IP) bool
}

func NewHTTPHandler(domain *Domain, trustedProxy func(net.IP) bool) *HTTPHandler {
	return &HTTPHandler{domain: domain, trustedProxy: trustedProxy}
}
func ChallengeHandler(provider, siteKey string, enabled bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			problem(w, http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(map[string]any{"enabled": enabled, "provider": provider, "site_key": siteKey})
	})
}
func (h *HTTPHandler) SubmitHandler() http.Handler { return http.HandlerFunc(h.submit) }
func (h *HTTPHandler) submit(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		problem(w, http.StatusUnsupportedMediaType)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 96<<10)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input Submission
	if decoder.Decode(&input) != nil || decoder.Decode(&struct{}{}) == nil {
		problem(w, http.StatusBadRequest)
		return
	}
	input.IdempotencyKey = r.Header.Get("Idempotency-Key")
	input.ClientIP = h.clientIP(r)
	receipt, err := h.domain.Submit(r.Context(), input)
	if err != nil {
		switch {
		case errors.Is(err, ErrRateLimited):
			w.Header().Set("Retry-After", "60")
			problem(w, http.StatusTooManyRequests)
		case errors.Is(err, ErrCaptchaRequired), errors.Is(err, ErrInvalid):
			problem(w, http.StatusUnprocessableEntity)
		default:
			problem(w, http.StatusServiceUnavailable)
		}
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(receipt)
}
func (h *HTTPHandler) clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer := net.ParseIP(host)
	if peer != nil && h.trustedProxy != nil && h.trustedProxy(peer) {
		parts := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
		if len(parts) > 0 {
			candidate := strings.TrimSpace(parts[0])
			if net.ParseIP(candidate) != nil {
				return candidate
			}
		}
	}
	return host
}
func problem(w http.ResponseWriter, status int) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "title": "Unable to submit enquiry", "status": status})
}
