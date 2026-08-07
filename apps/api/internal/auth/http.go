package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

const SessionCookie = "jk_admin_session"
const CSRFCookie = "jk_admin_csrf"

type HTTPHandler struct {
	service        *Service
	secure         bool
	limiter        *rateLimiter
	allowedOrigin  string
	trustedProxies []*net.IPNet
}

type HTTPConfig struct {
	SecureCookies, Production bool
	AllowedOrigin             string
	TrustedProxyCIDRs         []string
	RateLimitCapacity         int
}

func NewHTTPHandler(service *Service, config HTTPConfig) (*HTTPHandler, error) {
	origin, err := normalizeOrigin(config.AllowedOrigin)
	if err != nil {
		return nil, err
	}
	if config.Production && (!config.SecureCookies || !strings.HasPrefix(origin, "https://")) {
		return nil, errors.New("production auth requires secure cookies and an HTTPS allowed origin")
	}
	trusted := make([]*net.IPNet, 0, len(config.TrustedProxyCIDRs))
	for _, value := range config.TrustedProxyCIDRs {
		_, network, err := net.ParseCIDR(strings.TrimSpace(value))
		if err != nil {
			return nil, fmt.Errorf("invalid trusted proxy CIDR %q: %w", value, err)
		}
		trusted = append(trusted, network)
	}
	capacity := config.RateLimitCapacity
	if capacity <= 0 {
		capacity = 10_000
	}
	return &HTTPHandler{service: service, secure: config.SecureCookies, allowedOrigin: origin, trustedProxies: trusted, limiter: newRateLimiter(5, time.Minute, capacity)}, nil
}

func (handler *HTTPHandler) Routes() http.Handler {
	router := chi.NewRouter()
	router.With(handler.sameOrigin).Post("/login", handler.rateLimit(handler.login))
	router.With(handler.sameOrigin).Post("/mfa/verify", handler.rateLimit(handler.completeMFA))
	router.With(handler.sameOrigin).Get("/mfa/setup", handler.rateLimit(handler.mfaSetup))
	router.Group(func(protected chi.Router) {
		protected.Use(handler.authenticate)
		protected.Get("/me", handler.me)
		protected.Get("/permissions", handler.permissions)
		protected.With(handler.csrf).Post("/logout", handler.logout)
		protected.With(handler.csrf).Patch("/me/profile", handler.updateProfile)
		protected.With(handler.csrf).Post("/me/password", handler.changePassword)
		protected.Get("/me/preferences", handler.getPreferences)
		protected.With(handler.csrf).Put("/me/preferences", handler.savePreferences)
		protected.With(handler.require(PermissionUsersManage)).Get("/users", handler.listUsers)
		protected.With(handler.csrf, handler.require(PermissionUsersManage)).Post("/users", handler.provisionUser)
		protected.With(handler.csrf, handler.require(PermissionUsersManage)).Post("/users/{userID}/disable", handler.disableUser)
		protected.With(handler.csrf, handler.require(PermissionUsersManage)).Patch("/users/{userID}/role", handler.updateRole)
	})
	return router
}

// Protect applies the same session, MFA, role and optional CSRF checks used by
// the authentication routes to another domain handler. Domain services must
// still enforce field-level authorization.
func (handler *HTTPHandler) Protect(permission Permission, stateChanging bool, next http.Handler) http.Handler {
	protected := handler.require(permission)(next)
	if stateChanging {
		protected = handler.csrf(protected)
	}
	return handler.authenticate(protected)
}

func PrincipalFromContext(ctx context.Context) (Principal, bool) {
	principal, ok := ctx.Value(principalKey{}).(Principal)
	return principal, ok
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}
type mfaRequest struct {
	Code string `json:"code"`
}

func decodeJSON(response http.ResponseWriter, request *http.Request, target any) bool {
	request.Body = http.MaxBytesReader(response, request.Body, 16<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		problem(response, http.StatusBadRequest, "Invalid request")
		return false
	}
	return true
}

func (handler *HTTPHandler) login(response http.ResponseWriter, request *http.Request) {
	var input loginRequest
	if !decodeJSON(response, request, &input) {
		return
	}
	tokens, err := handler.service.Login(request.Context(), Credentials(input))
	if err != nil {
		if errors.Is(err, ErrSecurityUnavailable) {
			problem(response, http.StatusServiceUnavailable, "Authentication unavailable")
			return
		}
		problem(response, http.StatusUnauthorized, "Authentication failed")
		return
	}
	handler.cookies(response, tokens)
	jsonResponse(response, http.StatusOK, map[string]any{"mfa_required": tokens.MFARequired})
}

func (handler *HTTPHandler) mfaSetup(response http.ResponseWriter, request *http.Request) {
	cookie, err := request.Cookie(SessionCookie)
	if err != nil {
		problem(response, http.StatusUnauthorized, "Authentication failed")
		return
	}
	setup, err := handler.service.PendingMFASetup(request.Context(), cookie.Value)
	if err != nil {
		if errors.Is(err, ErrConflict) {
			problem(response, http.StatusConflict, "MFA already verified")
			return
		}
		problem(response, http.StatusUnauthorized, "Authentication failed")
		return
	}
	jsonResponse(response, http.StatusOK, map[string]any{
		"email":          setup.Email,
		"secret":         setup.Secret,
		"otpauth_uri":    setup.OTPAuthURI,
		"issuer":         "Joe Kuntani",
		"digits":         6,
		"period_seconds": 30,
	})
}

func (handler *HTTPHandler) completeMFA(response http.ResponseWriter, request *http.Request) {
	var input mfaRequest
	if !decodeJSON(response, request, &input) {
		return
	}
	cookie, err := request.Cookie(SessionCookie)
	if err != nil {
		problem(response, http.StatusUnauthorized, "Authentication failed")
		return
	}
	tokens, err := handler.service.CompleteMFA(request.Context(), cookie.Value, input.Code)
	if err != nil {
		if errors.Is(err, ErrSecurityUnavailable) {
			problem(response, http.StatusServiceUnavailable, "Authentication unavailable")
			return
		}
		problem(response, http.StatusUnauthorized, "Authentication failed")
		return
	}
	handler.cookies(response, tokens)
	jsonResponse(response, http.StatusOK, map[string]bool{"authenticated": true})
}

type principalKey struct{}
type sessionKey struct{}

func (handler *HTTPHandler) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		cookie, err := request.Cookie(SessionCookie)
		if err != nil {
			problem(response, http.StatusUnauthorized, "Authentication required")
			return
		}
		principal, session, err := handler.service.Authenticate(request.Context(), cookie.Value)
		if err != nil {
			problem(response, http.StatusUnauthorized, "Authentication required")
			return
		}
		ctx := context.WithValue(request.Context(), principalKey{}, principal)
		ctx = context.WithValue(ctx, sessionKey{}, session)
		next.ServeHTTP(response, request.WithContext(ctx))
	})
}

func (handler *HTTPHandler) csrf(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		session := request.Context().Value(sessionKey{}).(Session)
		header := request.Header.Get("X-CSRF-Token")
		cookie, err := request.Cookie(CSRFCookie)
		if err != nil || header == "" || cookie.Value != header || handler.service.ValidateCSRF(session, header) != nil {
			problem(response, http.StatusForbidden, "Request verification failed")
			return
		}
		next.ServeHTTP(response, request)
	})
}
func (handler *HTTPHandler) sameOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		source := request.Header.Get("Origin")
		if source == "" {
			source = request.Header.Get("Referer")
		}
		origin, err := normalizeOrigin(source)
		if err != nil || origin != handler.allowedOrigin {
			problem(response, http.StatusForbidden, "Request origin rejected")
			return
		}
		next.ServeHTTP(response, request)
	})
}
func (handler *HTTPHandler) require(permission Permission) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
			principal := request.Context().Value(principalKey{}).(Principal)
			if handler.service.Authorize(principal, permission) != nil {
				problem(response, http.StatusForbidden, "Access denied")
				return
			}
			next.ServeHTTP(response, request)
		})
	}
}

func (handler *HTTPHandler) me(response http.ResponseWriter, request *http.Request) {
	principal := request.Context().Value(principalKey{}).(Principal)
	body, err := handler.service.CurrentPrincipal(request.Context(), principal)
	if err != nil {
		problem(response, http.StatusUnauthorized, "Authentication required")
		return
	}
	jsonResponse(response, http.StatusOK, body)
}

func (handler *HTTPHandler) permissions(response http.ResponseWriter, request *http.Request) {
	jsonResponse(response, http.StatusOK, map[string]any{
		"permissions": PermissionCatalog(),
		"roles":       RoleCatalog(),
	})
}

func (handler *HTTPHandler) listUsers(response http.ResponseWriter, request *http.Request) {
	principal := request.Context().Value(principalKey{}).(Principal)
	users, err := handler.service.ListStaff(request.Context(), principal)
	if err != nil {
		problem(response, http.StatusForbidden, "Access denied")
		return
	}
	jsonResponse(response, http.StatusOK, map[string]any{"users": users})
}

func (handler *HTTPHandler) provisionUser(response http.ResponseWriter, request *http.Request) {
	var input ProvisionInput
	if !decodeJSON(response, request, &input) {
		return
	}
	principal := request.Context().Value(principalKey{}).(Principal)
	id, err := handler.service.ProvisionStaff(request.Context(), principal, input)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, ErrForbidden) {
			status = http.StatusForbidden
		} else if errors.Is(err, ErrConflict) {
			status = http.StatusConflict
		}
		problem(response, status, "Unable to provision staff user")
		return
	}
	jsonResponse(response, http.StatusCreated, map[string]any{"id": id})
}

func (handler *HTTPHandler) updateProfile(response http.ResponseWriter, request *http.Request) {
	var input struct {
		Name string `json:"name"`
	}
	if !decodeJSON(response, request, &input) {
		return
	}
	principal := request.Context().Value(principalKey{}).(Principal)
	if err := handler.service.UpdateOwnProfile(request.Context(), principal, input.Name); err != nil {
		problem(response, http.StatusBadRequest, "Unable to update profile")
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (handler *HTTPHandler) changePassword(response http.ResponseWriter, request *http.Request) {
	var input struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if !decodeJSON(response, request, &input) {
		return
	}
	principal := request.Context().Value(principalKey{}).(Principal)
	session := request.Context().Value(sessionKey{}).(Session)
	if err := handler.service.ChangeOwnPassword(request.Context(), principal, session, input.CurrentPassword, input.NewPassword); err != nil {
		problem(response, http.StatusBadRequest, "Unable to change password")
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (handler *HTTPHandler) getPreferences(response http.ResponseWriter, request *http.Request) {
	principal := request.Context().Value(principalKey{}).(Principal)
	prefs, err := handler.service.GetOwnPreferences(request.Context(), principal)
	if err != nil {
		problem(response, http.StatusInternalServerError, "Unable to load preferences")
		return
	}
	jsonResponse(response, http.StatusOK, prefs)
}

func (handler *HTTPHandler) savePreferences(response http.ResponseWriter, request *http.Request) {
	var input Preferences
	if !decodeJSON(response, request, &input) {
		return
	}
	principal := request.Context().Value(principalKey{}).(Principal)
	if err := handler.service.SaveOwnPreferences(request.Context(), principal, input); err != nil {
		problem(response, http.StatusBadRequest, "Unable to save preferences")
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (handler *HTTPHandler) updateRole(response http.ResponseWriter, request *http.Request) {
	var input struct {
		Role Role `json:"role"`
	}
	if !decodeJSON(response, request, &input) {
		return
	}
	principal := request.Context().Value(principalKey{}).(Principal)
	if err := handler.service.UpdateStaffRole(request.Context(), principal, chi.URLParam(request, "userID"), input.Role); err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, ErrForbidden) {
			status = http.StatusForbidden
		} else if errors.Is(err, ErrUserNotFound) {
			status = http.StatusNotFound
		}
		problem(response, status, "Unable to update role")
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (handler *HTTPHandler) logout(response http.ResponseWriter, request *http.Request) {
	session := request.Context().Value(sessionKey{}).(Session)
	if err := handler.service.Logout(request.Context(), session); err != nil {
		problem(response, http.StatusInternalServerError, "Unable to sign out")
		return
	}
	handler.clearCookies(response)
	response.WriteHeader(http.StatusNoContent)
}
func (handler *HTTPHandler) disableUser(response http.ResponseWriter, request *http.Request) {
	principal := request.Context().Value(principalKey{}).(Principal)
	if err := handler.service.DisableUser(request.Context(), principal, chi.URLParam(request, "userID")); err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, ErrUserNotFound) {
			status = http.StatusNotFound
		}
		problem(response, status, "Unable to disable user")
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (handler *HTTPHandler) cookies(response http.ResponseWriter, tokens Tokens) {
	http.SetCookie(response, &http.Cookie{Name: SessionCookie, Value: tokens.Session, Path: "/", HttpOnly: true, Secure: handler.secure, SameSite: http.SameSiteStrictMode, MaxAge: 12 * 60 * 60})
	http.SetCookie(response, &http.Cookie{Name: CSRFCookie, Value: tokens.CSRF, Path: "/", HttpOnly: false, Secure: handler.secure, SameSite: http.SameSiteStrictMode, MaxAge: 12 * 60 * 60})
}
func (handler *HTTPHandler) clearCookies(response http.ResponseWriter) {
	for _, name := range []string{SessionCookie, CSRFCookie} {
		http.SetCookie(response, &http.Cookie{Name: name, Value: "", Path: "/", HttpOnly: name == SessionCookie, Secure: handler.secure, SameSite: http.SameSiteStrictMode, MaxAge: -1})
	}
}
func jsonResponse(response http.ResponseWriter, status int, body any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(body)
}
func problem(response http.ResponseWriter, status int, title string) {
	response.Header().Set("Content-Type", "application/problem+json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(map[string]any{"type": "about:blank", "title": title, "status": status})
}

type rateLimiter struct {
	mu       sync.Mutex
	entries  map[string]rateEntry
	limit    int
	window   time.Duration
	capacity int
}
type rateEntry struct {
	attempts []time.Time
	lastSeen time.Time
}

func newRateLimiter(limit int, window time.Duration, capacity int) *rateLimiter {
	return &rateLimiter{entries: map[string]rateEntry{}, limit: limit, window: window, capacity: capacity}
}
func (handler *HTTPHandler) rateLimit(next http.HandlerFunc) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		host := handler.clientIP(request)
		if !handler.limiter.allow(strings.TrimSpace(host), time.Now()) {
			response.Header().Set("Retry-After", "60")
			problem(response, http.StatusTooManyRequests, "Too many attempts")
			return
		}
		next(response, request)
	}
}
func (limiter *rateLimiter) allow(key string, now time.Time) bool {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	entry, exists := limiter.entries[key]
	if !exists && len(limiter.entries) >= limiter.capacity {
		limiter.evictOldest()
	}
	cutoff := now.Add(-limiter.window)
	recent := entry.attempts[:0]
	for _, attempt := range entry.attempts {
		if attempt.After(cutoff) {
			recent = append(recent, attempt)
		}
	}
	if len(recent) >= limiter.limit {
		limiter.entries[key] = rateEntry{attempts: recent, lastSeen: now}
		return false
	}
	limiter.entries[key] = rateEntry{attempts: append(recent, now), lastSeen: now}
	return true
}
func (limiter *rateLimiter) evictOldest() {
	keys := make([]string, 0, len(limiter.entries))
	for key := range limiter.entries {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	oldest := keys[0]
	for _, key := range keys[1:] {
		if limiter.entries[key].lastSeen.Before(limiter.entries[oldest].lastSeen) {
			oldest = key
		}
	}
	delete(limiter.entries, oldest)
}
func (handler *HTTPHandler) clientIP(request *http.Request) string {
	host, _, err := net.SplitHostPort(request.RemoteAddr)
	if err != nil {
		host = request.RemoteAddr
	}
	remote := net.ParseIP(strings.TrimSpace(host))
	trusted := false
	for _, network := range handler.trustedProxies {
		if remote != nil && network.Contains(remote) {
			trusted = true
			break
		}
	}
	if trusted {
		forwarded := strings.TrimSpace(strings.Split(request.Header.Get("X-Forwarded-For"), ",")[0])
		if ip := net.ParseIP(forwarded); ip != nil {
			return ip.String()
		}
	}
	if remote != nil {
		return remote.String()
	}
	return "invalid-remote"
}
func normalizeOrigin(value string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.User != nil {
		return "", errors.New("valid HTTP(S) origin is required")
	}
	return strings.ToLower(parsed.Scheme + "://" + parsed.Host), nil
}
