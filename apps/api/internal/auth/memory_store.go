package auth

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type MemoryStore struct {
	mu          sync.Mutex
	Users       map[string]User
	Sessions    map[string]Session
	Preferences map[string]Preferences
	Audits      []AuditEvent
	AuditError  error
}

func NewMemoryStore(users ...User) *MemoryStore {
	store := &MemoryStore{Users: map[string]User{}, Sessions: map[string]Session{}, Preferences: map[string]Preferences{}}
	for _, user := range users {
		store.Users[user.ID] = user
	}
	return store
}
func (store *MemoryStore) FindUserByEmail(_ context.Context, email string) (User, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	for _, user := range store.Users {
		if user.Email == email {
			return user, nil
		}
	}
	return User{}, ErrUserNotFound
}
func (store *MemoryStore) FindUserByID(_ context.Context, id string) (User, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	user, ok := store.Users[id]
	if !ok {
		return User{}, ErrUserNotFound
	}
	return user, nil
}
func (store *MemoryStore) SaveSessionWithAudit(_ context.Context, session Session, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.AuditError != nil {
		return store.AuditError
	}
	store.Sessions[session.ID] = session
	store.Audits = append(store.Audits, audit)
	return nil
}
func (store *MemoryStore) FindSessionByTokenHash(_ context.Context, hash string) (Session, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	for _, session := range store.Sessions {
		if session.TokenHash == hash {
			return session, nil
		}
	}
	return Session{}, ErrUnauthorized
}
func (store *MemoryStore) CompleteMFA(_ context.Context, id, expectedTokenHash string, counter int64, tokenHash, csrfHash string, now time.Time, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	session, ok := store.Sessions[id]
	if !ok || session.RevokedAt != nil || session.MFAVerified || session.TokenHash != expectedTokenHash {
		return ErrConflict
	}
	user, ok := store.Users[session.UserID]
	if !ok || counter <= user.LastMFACounter {
		return ErrConflict
	}
	if store.AuditError != nil {
		return store.AuditError
	}
	user.LastMFACounter = counter
	store.Users[session.UserID] = user
	session.TokenHash = tokenHash
	session.CSRFHash = csrfHash
	session.MFAVerified = true
	session.LastRotatedAt = now
	store.Sessions[id] = session
	store.Audits = append(store.Audits, audit)
	return nil
}
func (store *MemoryStore) RevokeSessionWithAudit(_ context.Context, id string, now time.Time, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	session, ok := store.Sessions[id]
	if !ok {
		return ErrUnauthorized
	}
	if store.AuditError != nil {
		return store.AuditError
	}
	session.RevokedAt = &now
	store.Sessions[id] = session
	store.Audits = append(store.Audits, audit)
	return nil
}
func (store *MemoryStore) DisableUserAndRevokeSessions(_ context.Context, id string, now time.Time, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	var user User
	internalID := ""
	for key, candidate := range store.Users {
		if candidate.PublicID == id {
			user = candidate
			internalID = key
			break
		}
	}
	if internalID == "" {
		return ErrUserNotFound
	}
	if store.AuditError != nil {
		return store.AuditError
	}
	user.Status = "disabled"
	user.UpdatedAt = now
	store.Users[internalID] = user
	for key, session := range store.Sessions {
		if session.UserID == internalID && session.RevokedAt == nil {
			session.RevokedAt = &now
			store.Sessions[key] = session
		}
	}
	store.Audits = append(store.Audits, audit)
	return nil
}
func (store *MemoryStore) AppendAudit(_ context.Context, event AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.AuditError != nil {
		return store.AuditError
	}
	store.Audits = append(store.Audits, event)
	return nil
}

func (store *MemoryStore) ListUsers(_ context.Context) ([]StaffRecord, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	out := make([]StaffRecord, 0, len(store.Users))
	for _, user := range store.Users {
		out = append(out, StaffRecord{
			ID: user.PublicID, Name: user.Name, Email: user.Email, Role: user.Role,
			Status: user.Status, MFAEnabled: user.MFAEnabled, UpdatedAt: user.UpdatedAt,
		})
	}
	return out, nil
}

func (store *MemoryStore) ProvisionStaff(_ context.Context, name, email, password string, role Role, mfaSecret string) (string, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	for _, user := range store.Users {
		if user.Email == email {
			return "", ErrConflict
		}
	}
	hash, err := HashPassword(password)
	if err != nil {
		return "", err
	}
	publicID := fmt.Sprintf("018f47f6-9f5d-7d3a-8d4e-%012d", len(store.Users)+1)
	id := fmt.Sprintf("user-%d", len(store.Users)+1)
	now := time.Now().UTC()
	store.Users[id] = User{
		ID: id, PublicID: publicID, Name: name, Email: email, PasswordHash: hash,
		Role: role, MFAEnabled: mfaSecret != "", MFASecret: mfaSecret, Status: "active", UpdatedAt: now,
	}
	return publicID, nil
}

func (store *MemoryStore) UpdateProfile(_ context.Context, id, name string, now time.Time, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	user, ok := store.Users[id]
	if !ok {
		return ErrUserNotFound
	}
	user.Name = name
	user.UpdatedAt = now
	store.Users[id] = user
	for key, session := range store.Sessions {
		if session.UserID == id && session.RevokedAt == nil {
			session.UserVersion = now
			store.Sessions[key] = session
		}
	}
	store.Audits = append(store.Audits, audit)
	return nil
}

func (store *MemoryStore) ChangePassword(_ context.Context, id, sessionID, hash string, now time.Time, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	user, ok := store.Users[id]
	if !ok {
		return ErrUserNotFound
	}
	user.PasswordHash = hash
	user.UpdatedAt = now
	store.Users[id] = user
	for key, session := range store.Sessions {
		if session.UserID != id {
			continue
		}
		if session.ID == sessionID && session.RevokedAt == nil {
			session.UserVersion = now
			store.Sessions[key] = session
			continue
		}
		if session.RevokedAt == nil {
			session.RevokedAt = &now
			store.Sessions[key] = session
		}
	}
	store.Audits = append(store.Audits, audit)
	return nil
}

func (store *MemoryStore) UpdateRole(_ context.Context, publicID string, role Role, now time.Time, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	for key, user := range store.Users {
		if user.PublicID != publicID {
			continue
		}
		user.Role = role
		user.UpdatedAt = now
		store.Users[key] = user
		for sessionKey, session := range store.Sessions {
			if session.UserID == key && session.RevokedAt == nil {
				session.RevokedAt = &now
				store.Sessions[sessionKey] = session
			}
		}
		store.Audits = append(store.Audits, audit)
		return nil
	}
	return ErrUserNotFound
}

func (store *MemoryStore) GetPreferences(_ context.Context, publicID string) (Preferences, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if prefs, ok := store.Preferences[publicID]; ok {
		return prefs, nil
	}
	return DefaultPreferences(), nil
}

func (store *MemoryStore) SavePreferences(_ context.Context, publicID string, prefs Preferences, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.Preferences[publicID] = prefs
	store.Audits = append(store.Audits, audit)
	return nil
}
