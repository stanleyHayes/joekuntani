package auth

import (
	"context"
	"sync"
	"time"
)

type MemoryStore struct {
	mu         sync.Mutex
	Users      map[string]User
	Sessions   map[string]Session
	Audits     []AuditEvent
	AuditError error
}

func NewMemoryStore(users ...User) *MemoryStore {
	store := &MemoryStore{Users: map[string]User{}, Sessions: map[string]Session{}}
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
