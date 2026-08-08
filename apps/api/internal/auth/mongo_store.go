package auth

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type SecretBox struct{ aead cipher.AEAD }

func NewSecretBox(encodedKey string) (*SecretBox, error) {
	encodedKey = strings.TrimSpace(encodedKey)
	key, err := base64.RawStdEncoding.DecodeString(encodedKey)
	if err != nil {
		// Accept standard padded base64 from secret generators / dashboards.
		key, err = base64.StdEncoding.DecodeString(encodedKey)
	}
	if err != nil || len(key) != 32 {
		return nil, errors.New("MFA_ENCRYPTION_KEY must be base64 (padded or unpadded) and decode to 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("initialize MFA encryption: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("initialize MFA encryption mode: %w", err)
	}
	return &SecretBox{aead: aead}, nil
}

func (box *SecretBox) Encrypt(value string) (string, error) {
	nonce := make([]byte, box.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := box.aead.Seal(nonce, nonce, []byte(value), nil)
	return base64.RawStdEncoding.EncodeToString(sealed), nil
}
func (box *SecretBox) Decrypt(encoded string) (string, error) {
	value, err := base64.RawStdEncoding.DecodeString(encoded)
	if err != nil || len(value) < box.aead.NonceSize() {
		return "", errors.New("invalid encrypted MFA secret")
	}
	plain, err := box.aead.Open(nil, value[:box.aead.NonceSize()], value[box.aead.NonceSize():], nil)
	if err != nil {
		return "", errors.New("decrypt MFA secret")
	}
	return string(plain), nil
}

type MongoStore struct {
	database *mongo.Database
	secrets  *SecretBox
}

func NewMongoStore(database *mongo.Database, secrets *SecretBox) *MongoStore {
	return &MongoStore{database: database, secrets: secrets}
}

func (store *MongoStore) ProvisionUser(ctx context.Context, name, email, password string, role Role, mfaSecret string) (string, error) {
	name, email = strings.TrimSpace(name), strings.ToLower(strings.TrimSpace(email))
	if name == "" || email == "" || !strings.Contains(email, "@") {
		return "", errors.New("valid staff name and email are required")
	}
	if role != RoleAdministrator && role != RoleBookingManager && role != RoleContentEditor && role != RoleAnalyst {
		return "", errors.New("role must be administrator, booking_manager, content_editor, or analyst")
	}
	if role == RoleAdministrator && strings.TrimSpace(mfaSecret) == "" {
		return "", errors.New("administrator provisioning requires an MFA secret")
	}
	passwordHash, err := HashPassword(password)
	if err != nil {
		return "", err
	}
	encryptedSecret := ""
	if mfaSecret != "" {
		encryptedSecret, err = store.secrets.Encrypt(strings.TrimSpace(mfaSecret))
		if err != nil {
			return "", err
		}
	}
	publicID, now := uuid(), time.Now().UTC()
	session, err := store.database.Client().StartSession()
	if err != nil {
		return "", err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(transaction context.Context) (any, error) {
		_, err := store.database.Collection("users").InsertOne(transaction, bson.M{"public_id": publicID, "name": name, "email": email, "password_hash": passwordHash, "role": role, "mfa_enabled": mfaSecret != "", "mfa_secret_encrypted": encryptedSecret, "last_mfa_counter": int64(0), "status": "active", "last_login_at": nil, "created_at": now, "updated_at": now})
		if err != nil {
			return nil, err
		}
		return nil, store.appendAudit(transaction, AuditEvent{Action: "user.provision", EntityID: publicID, Outcome: "accepted", CreatedAt: now})
	})
	if err != nil {
		return "", fmt.Errorf("provision staff user: %w", err)
	}
	return publicID, nil
}

// ResetProvisionedUser deliberately restores an existing bootstrap account.
// It is kept separate from ProvisionUser so ordinary provisioning can never
// silently take over an active email address.
func (store *MongoStore) ResetProvisionedUser(ctx context.Context, name, email, password string, role Role, mfaSecret string) (string, error) {
	name, email = strings.TrimSpace(name), strings.ToLower(strings.TrimSpace(email))
	if name == "" || email == "" || !strings.Contains(email, "@") {
		return "", errors.New("valid staff name and email are required")
	}
	if role != RoleAdministrator && role != RoleBookingManager && role != RoleContentEditor && role != RoleAnalyst {
		return "", errors.New("role must be administrator, booking_manager, content_editor, or analyst")
	}
	if role == RoleAdministrator && strings.TrimSpace(mfaSecret) == "" {
		return "", errors.New("administrator reset requires an MFA secret")
	}
	passwordHash, err := HashPassword(password)
	if err != nil {
		return "", err
	}
	encryptedSecret := ""
	if mfaSecret != "" {
		encryptedSecret, err = store.secrets.Encrypt(strings.TrimSpace(mfaSecret))
		if err != nil {
			return "", err
		}
	}

	now := time.Now().UTC()
	session, err := store.database.Client().StartSession()
	if err != nil {
		return "", err
	}
	defer session.EndSession(ctx)
	publicID := ""
	_, err = session.WithTransaction(ctx, func(transaction context.Context) (any, error) {
		var existing struct {
			ID       bson.ObjectID `bson:"_id"`
			PublicID string        `bson:"public_id"`
		}
		if err := store.database.Collection("users").FindOne(transaction, bson.M{"email": email}).Decode(&existing); err != nil {
			if errors.Is(err, mongo.ErrNoDocuments) {
				return nil, ErrUserNotFound
			}
			return nil, err
		}
		publicID = existing.PublicID
		result, err := store.database.Collection("users").UpdateOne(transaction, bson.M{"_id": existing.ID}, bson.M{"$set": bson.M{
			"name": name, "password_hash": passwordHash, "role": role,
			"mfa_enabled": mfaSecret != "", "mfa_secret_encrypted": encryptedSecret,
			"last_mfa_counter": int64(0), "status": "active", "updated_at": now,
		}})
		if err != nil {
			return nil, err
		}
		if result.MatchedCount != 1 {
			return nil, ErrUserNotFound
		}
		if _, err = store.database.Collection("auth_sessions").UpdateMany(transaction, bson.M{"user_id": existing.ID, "revoked_at": nil}, bson.M{"$set": bson.M{"revoked_at": now}}); err != nil {
			return nil, err
		}
		return nil, store.appendAudit(transaction, AuditEvent{Action: "user.bootstrap_reset", EntityID: publicID, Outcome: "accepted", CreatedAt: now})
	})
	if err != nil {
		return "", fmt.Errorf("reset staff user: %w", err)
	}
	return publicID, nil
}

type userDocument struct {
	ID             bson.ObjectID `bson:"_id"`
	PublicID       string        `bson:"public_id"`
	Name           string        `bson:"name"`
	Email          string        `bson:"email"`
	PasswordHash   string        `bson:"password_hash"`
	Role           Role          `bson:"role"`
	MFAEnabled     bool          `bson:"mfa_enabled"`
	MFASecret      string        `bson:"mfa_secret_encrypted"`
	Status         string        `bson:"status"`
	UpdatedAt      time.Time     `bson:"updated_at"`
	LastMFACounter int64         `bson:"last_mfa_counter"`
}

func (store *MongoStore) decodeUser(document userDocument) (User, error) {
	secret := ""
	var err error
	if document.MFASecret != "" {
		secret, err = store.secrets.Decrypt(document.MFASecret)
		if err != nil {
			return User{}, err
		}
	}
	return User{ID: document.ID.Hex(), PublicID: document.PublicID, Name: document.Name, Email: document.Email, PasswordHash: document.PasswordHash, Role: document.Role, MFAEnabled: document.MFAEnabled, MFASecret: secret, Status: document.Status, UpdatedAt: document.UpdatedAt, LastMFACounter: document.LastMFACounter}, nil
}
func (store *MongoStore) FindUserByEmail(ctx context.Context, email string) (User, error) {
	var doc userDocument
	err := store.database.Collection("users").FindOne(ctx, bson.M{"email": strings.ToLower(email)}).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return User{}, ErrUserNotFound
	}
	if err != nil {
		return User{}, err
	}
	return store.decodeUser(doc)
}
func (store *MongoStore) FindUserByID(ctx context.Context, id string) (User, error) {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return User{}, ErrUserNotFound
	}
	var doc userDocument
	err = store.database.Collection("users").FindOne(ctx, bson.M{"_id": oid}).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return User{}, ErrUserNotFound
	}
	if err != nil {
		return User{}, err
	}
	return store.decodeUser(doc)
}

type sessionDocument struct {
	ID            bson.ObjectID `bson:"_id"`
	PublicID      string        `bson:"public_id"`
	UserID        bson.ObjectID `bson:"user_id"`
	TokenHash     string        `bson:"token_hash"`
	CSRFHash      string        `bson:"csrf_hash"`
	MFAVerified   bool          `bson:"mfa_verified"`
	UserVersion   time.Time     `bson:"user_version"`
	ExpiresAt     time.Time     `bson:"expires_at"`
	LastRotatedAt time.Time     `bson:"last_rotated_at"`
	RevokedAt     *time.Time    `bson:"revoked_at"`
}

func sessionFromDocument(doc sessionDocument) Session {
	return Session{ID: doc.ID.Hex(), UserID: doc.UserID.Hex(), TokenHash: doc.TokenHash, CSRFHash: doc.CSRFHash, MFAVerified: doc.MFAVerified, UserVersion: doc.UserVersion, ExpiresAt: doc.ExpiresAt, LastRotatedAt: doc.LastRotatedAt, RevokedAt: doc.RevokedAt}
}
func (store *MongoStore) SaveSessionWithAudit(ctx context.Context, session Session, audit AuditEvent) error {
	userID, err := bson.ObjectIDFromHex(session.UserID)
	if err != nil {
		return err
	}
	now := session.LastRotatedAt
	mongoSession, err := store.database.Client().StartSession()
	if err != nil {
		return err
	}
	defer mongoSession.EndSession(ctx)
	_, err = mongoSession.WithTransaction(ctx, func(transaction context.Context) (any, error) {
		_, err := store.database.Collection("auth_sessions").InsertOne(transaction, bson.M{"public_id": uuid(), "user_id": userID, "token_hash": session.TokenHash, "csrf_hash": session.CSRFHash, "mfa_verified": session.MFAVerified, "user_version": session.UserVersion, "expires_at": session.ExpiresAt, "last_rotated_at": session.LastRotatedAt, "revoked_at": nil, "created_at": now})
		if err != nil {
			return nil, err
		}
		return nil, store.appendAudit(transaction, audit)
	})
	return err
}
func (store *MongoStore) FindSessionByTokenHash(ctx context.Context, hash string) (Session, error) {
	var doc sessionDocument
	err := store.database.Collection("auth_sessions").FindOne(ctx, bson.M{"token_hash": hash}).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return Session{}, ErrUnauthorized
	}
	if err != nil {
		return Session{}, err
	}
	return sessionFromDocument(doc), nil
}
func (store *MongoStore) CompleteMFA(ctx context.Context, id, expectedTokenHash string, counter int64, tokenHash, csrfHash string, now time.Time, audit AuditEvent) error {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return ErrUnauthorized
	}
	mongoSession, err := store.database.Client().StartSession()
	if err != nil {
		return err
	}
	defer mongoSession.EndSession(ctx)
	_, err = mongoSession.WithTransaction(ctx, func(transaction context.Context) (any, error) {
		var current sessionDocument
		if err := store.database.Collection("auth_sessions").FindOne(transaction, bson.M{"_id": oid, "token_hash": expectedTokenHash, "mfa_verified": false, "revoked_at": nil}).Decode(&current); err != nil {
			return nil, ErrConflict
		}
		userResult, err := store.database.Collection("users").UpdateOne(transaction, bson.M{"_id": current.UserID, "$or": bson.A{bson.M{"last_mfa_counter": bson.M{"$lt": counter}}, bson.M{"last_mfa_counter": bson.M{"$exists": false}}}}, bson.M{"$set": bson.M{"last_mfa_counter": counter}})
		if err != nil {
			return nil, err
		}
		if userResult.MatchedCount != 1 {
			return nil, ErrConflict
		}
		result, err := store.database.Collection("auth_sessions").UpdateOne(transaction, bson.M{"_id": oid, "token_hash": expectedTokenHash, "mfa_verified": false, "revoked_at": nil}, bson.M{"$set": bson.M{"token_hash": tokenHash, "csrf_hash": csrfHash, "mfa_verified": true, "last_rotated_at": now}})
		if err != nil {
			return nil, err
		}
		if result.MatchedCount != 1 {
			return nil, ErrConflict
		}
		return nil, store.appendAudit(transaction, audit)
	})
	return err
}
func (store *MongoStore) RevokeSessionWithAudit(ctx context.Context, id string, now time.Time, audit AuditEvent) error {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return ErrUnauthorized
	}
	mongoSession, err := store.database.Client().StartSession()
	if err != nil {
		return err
	}
	defer mongoSession.EndSession(ctx)
	_, err = mongoSession.WithTransaction(ctx, func(transaction context.Context) (any, error) {
		result, err := store.database.Collection("auth_sessions").UpdateOne(transaction, bson.M{"_id": oid, "revoked_at": nil}, bson.M{"$set": bson.M{"revoked_at": now}})
		if err != nil {
			return nil, err
		}
		if result.MatchedCount != 1 {
			return nil, ErrUnauthorized
		}
		return nil, store.appendAudit(transaction, audit)
	})
	return err
}
func (store *MongoStore) DisableUserAndRevokeSessions(ctx context.Context, id string, now time.Time, audit AuditEvent) error {
	session, err := store.database.Client().StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(transaction context.Context) (any, error) {
		var user struct {
			ID bson.ObjectID `bson:"_id"`
		}
		err := store.database.Collection("users").FindOne(transaction, bson.M{"public_id": id}).Decode(&user)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrUserNotFound
		}
		if err != nil {
			return nil, err
		}
		result, err := store.database.Collection("users").UpdateOne(transaction, bson.M{"_id": user.ID}, bson.M{"$set": bson.M{"status": "disabled", "updated_at": now}})
		if err != nil {
			return nil, err
		}
		if result.MatchedCount != 1 {
			return nil, ErrUserNotFound
		}
		_, err = store.database.Collection("auth_sessions").UpdateMany(transaction, bson.M{"user_id": user.ID, "revoked_at": nil}, bson.M{"$set": bson.M{"revoked_at": now}})
		if err != nil {
			return nil, err
		}
		return nil, store.appendAudit(transaction, audit)
	})
	return err
}
func (store *MongoStore) AppendAudit(ctx context.Context, event AuditEvent) error {
	return store.appendAudit(ctx, event)
}

func (store *MongoStore) ListUsers(ctx context.Context) ([]StaffRecord, error) {
	cursor, err := store.database.Collection("users").Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	out := make([]StaffRecord, 0)
	for cursor.Next(ctx) {
		var doc userDocument
		if err := cursor.Decode(&doc); err != nil {
			return nil, err
		}
		out = append(out, StaffRecord{
			ID: doc.PublicID, Name: doc.Name, Email: doc.Email, Role: doc.Role,
			Status: doc.Status, MFAEnabled: doc.MFAEnabled, UpdatedAt: doc.UpdatedAt,
		})
	}
	return out, cursor.Err()
}

func (store *MongoStore) ProvisionStaff(ctx context.Context, name, email, password string, role Role, mfaSecret string) (string, error) {
	return store.ProvisionUser(ctx, name, email, password, role, mfaSecret)
}

// ProvisionInvitedStaff writes the staff record and its invitation together, so
// an account can never exist without the only means of activating it.
func (store *MongoStore) ProvisionInvitedStaff(ctx context.Context, name, email string, role Role, mfaSecret, tokenHash string, expiresAt time.Time, audit AuditEvent) (string, error) {
	name, email = strings.TrimSpace(name), strings.ToLower(strings.TrimSpace(email))
	if name == "" || email == "" || !strings.Contains(email, "@") {
		return "", errors.New("valid staff name and email are required")
	}
	if !role.provisionable() {
		return "", errors.New("role must be administrator, booking_manager, content_editor, or analyst")
	}
	if role == RoleAdministrator && strings.TrimSpace(mfaSecret) == "" {
		return "", errors.New("administrator provisioning requires an MFA secret")
	}
	if len(strings.TrimSpace(tokenHash)) == 0 {
		return "", errors.New("invitation token hash is required")
	}
	encryptedSecret := ""
	if mfaSecret != "" {
		secret, err := store.secrets.Encrypt(strings.TrimSpace(mfaSecret))
		if err != nil {
			return "", err
		}
		encryptedSecret = secret
	}
	publicID, now := uuid(), time.Now().UTC()
	session, err := store.database.Client().StartSession()
	if err != nil {
		return "", err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(transaction context.Context) (any, error) {
		// Re-inviting an address that never accepted must reissue, not collide.
		//
		// Inviting always wrote a `users` row, and email is uniquely indexed, so
		// once an invitation lapsed the address was locked out of the platform
		// for good: the only route that mints an invitation is the same one that
		// inserts the row, and there is no reissue path. A 72-hour window made
		// that rare; a 15-minute one makes it the ordinary case.
		//
		// An account that has already been accepted is a different matter. It is
		// still a conflict, because reissuing there would hand whoever can post
		// an invite a way to reset a live administrator's credentials.
		var existing struct {
			ID     bson.ObjectID `bson:"_id"`
			Public string        `bson:"public_id"`
			Status string        `bson:"status"`
		}
		findErr := store.database.Collection("users").FindOne(transaction, bson.M{"email": email}).Decode(&existing)
		if findErr != nil && !errors.Is(findErr, mongo.ErrNoDocuments) {
			return nil, findErr
		}

		var userID bson.ObjectID
		if findErr == nil {
			if existing.Status != "invited" {
				return nil, ErrConflict
			}
			publicID = existing.Public
			userID = existing.ID
			if _, err := store.database.Collection("users").UpdateOne(transaction,
				bson.M{"_id": existing.ID, "status": "invited"},
				bson.M{"$set": bson.M{"name": name, "role": role, "mfa_enabled": mfaSecret != "", "mfa_secret_encrypted": encryptedSecret, "updated_at": now}}); err != nil {
				return nil, err
			}
			// The superseded link must stop working the moment a new one is
			// issued, otherwise an invite is effectively multi-use.
			if _, err := store.database.Collection("staff_invitations").DeleteMany(transaction,
				bson.M{"user_id": existing.ID, "accepted_at": nil}); err != nil {
				return nil, err
			}
		} else {
			// An empty password hash never verifies — VerifyPassword rejects it on
			// shape — so the account is unusable until acceptance writes a real one.
			result, err := store.database.Collection("users").InsertOne(transaction, bson.M{"public_id": publicID, "name": name, "email": email, "password_hash": "", "role": role, "mfa_enabled": mfaSecret != "", "mfa_secret_encrypted": encryptedSecret, "last_mfa_counter": int64(0), "status": "invited", "last_login_at": nil, "created_at": now, "updated_at": now})
			if err != nil {
				return nil, err
			}
			id, ok := result.InsertedID.(bson.ObjectID)
			if !ok {
				return nil, errors.New("unexpected inserted user id")
			}
			userID = id
		}

		if _, err = store.database.Collection("staff_invitations").InsertOne(transaction, bson.M{"user_id": userID, "public_id": publicID, "name": name, "email": email, "role": role, "token_hash": tokenHash, "expires_at": expiresAt, "accepted_at": nil, "created_at": now}); err != nil {
			return nil, err
		}
		return nil, store.appendAudit(transaction, audit)
	})
	if err != nil {
		return "", fmt.Errorf("invite staff user: %w", err)
	}
	return publicID, nil
}

func (store *MongoStore) FindInvitation(ctx context.Context, tokenHash string) (Invitation, error) {
	var record struct {
		UserID    bson.ObjectID `bson:"user_id"`
		Name      string        `bson:"name"`
		Email     string        `bson:"email"`
		Role      Role          `bson:"role"`
		ExpiresAt time.Time     `bson:"expires_at"`
	}
	filter := bson.M{"token_hash": tokenHash, "accepted_at": nil}
	if err := store.database.Collection("staff_invitations").FindOne(ctx, filter).Decode(&record); err != nil {
		return Invitation{}, ErrInvitationInvalid
	}
	return Invitation{UserID: record.UserID.Hex(), Name: record.Name, Email: record.Email, Role: record.Role, ExpiresAt: record.ExpiresAt}, nil
}

// AcceptInvitation spends the invitation and activates the account atomically.
// The filter carries `accepted_at: nil` and the expiry, so two concurrent
// submissions of the same link cannot both write a password.
func (store *MongoStore) AcceptInvitation(ctx context.Context, tokenHash, passwordHash string, now time.Time, audit AuditEvent) error {
	session, err := store.database.Client().StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(transaction context.Context) (any, error) {
		var record struct {
			UserID bson.ObjectID `bson:"user_id"`
		}
		filter := bson.M{"token_hash": tokenHash, "accepted_at": nil, "expires_at": bson.M{"$gt": now}}
		update := bson.M{"$set": bson.M{"accepted_at": now}}
		if err := store.database.Collection("staff_invitations").FindOneAndUpdate(transaction, filter, update).Decode(&record); err != nil {
			return nil, ErrInvitationInvalid
		}
		result, err := store.database.Collection("users").UpdateOne(transaction,
			bson.M{"_id": record.UserID, "status": "invited"},
			bson.M{"$set": bson.M{"password_hash": passwordHash, "status": "active", "updated_at": now}})
		if err != nil {
			return nil, err
		}
		if result.MatchedCount != 1 {
			return nil, ErrInvitationInvalid
		}
		return nil, store.appendAudit(transaction, audit)
	})
	return err
}

func (store *MongoStore) UpdateProfile(ctx context.Context, id, name string, now time.Time, audit AuditEvent) error {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return ErrUserNotFound
	}
	session, err := store.database.Client().StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(transaction context.Context) (any, error) {
		result, err := store.database.Collection("users").UpdateOne(transaction, bson.M{"_id": oid}, bson.M{"$set": bson.M{"name": name, "updated_at": now}})
		if err != nil {
			return nil, err
		}
		if result.MatchedCount != 1 {
			return nil, ErrUserNotFound
		}
		_, err = store.database.Collection("auth_sessions").UpdateMany(transaction, bson.M{"user_id": oid, "revoked_at": nil}, bson.M{"$set": bson.M{"user_version": now}})
		if err != nil {
			return nil, err
		}
		return nil, store.appendAudit(transaction, audit)
	})
	return err
}

func (store *MongoStore) ChangePassword(ctx context.Context, id, sessionID, hash string, now time.Time, audit AuditEvent) error {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return ErrUserNotFound
	}
	sessionOID, err := bson.ObjectIDFromHex(sessionID)
	if err != nil {
		return ErrUnauthorized
	}
	session, err := store.database.Client().StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(transaction context.Context) (any, error) {
		result, err := store.database.Collection("users").UpdateOne(transaction, bson.M{"_id": oid}, bson.M{"$set": bson.M{"password_hash": hash, "updated_at": now}})
		if err != nil {
			return nil, err
		}
		if result.MatchedCount != 1 {
			return nil, ErrUserNotFound
		}
		_, err = store.database.Collection("auth_sessions").UpdateMany(transaction, bson.M{"user_id": oid, "_id": bson.M{"$ne": sessionOID}, "revoked_at": nil}, bson.M{"$set": bson.M{"revoked_at": now}})
		if err != nil {
			return nil, err
		}
		_, err = store.database.Collection("auth_sessions").UpdateOne(transaction, bson.M{"_id": sessionOID, "user_id": oid, "revoked_at": nil}, bson.M{"$set": bson.M{"user_version": now}})
		if err != nil {
			return nil, err
		}
		return nil, store.appendAudit(transaction, audit)
	})
	return err
}

func (store *MongoStore) UpdateRole(ctx context.Context, publicID string, role Role, now time.Time, audit AuditEvent) error {
	session, err := store.database.Client().StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(transaction context.Context) (any, error) {
		var user struct {
			ID bson.ObjectID `bson:"_id"`
		}
		err := store.database.Collection("users").FindOne(transaction, bson.M{"public_id": publicID}).Decode(&user)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrUserNotFound
		}
		if err != nil {
			return nil, err
		}
		result, err := store.database.Collection("users").UpdateOne(transaction, bson.M{"_id": user.ID}, bson.M{"$set": bson.M{"role": role, "updated_at": now}})
		if err != nil {
			return nil, err
		}
		if result.MatchedCount != 1 {
			return nil, ErrUserNotFound
		}
		_, err = store.database.Collection("auth_sessions").UpdateMany(transaction, bson.M{"user_id": user.ID, "revoked_at": nil}, bson.M{"$set": bson.M{"revoked_at": now}})
		if err != nil {
			return nil, err
		}
		return nil, store.appendAudit(transaction, audit)
	})
	return err
}

func (store *MongoStore) GetPreferences(ctx context.Context, publicID string) (Preferences, error) {
	var doc struct {
		EmailProductUpdates bool   `bson:"email_product_updates"`
		EmailSecurityAlerts bool   `bson:"email_security_alerts"`
		DenseUI             bool   `bson:"dense_ui"`
		Timezone            string `bson:"timezone"`
	}
	err := store.database.Collection("staff_preferences").FindOne(ctx, bson.M{"user_public_id": publicID}).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return DefaultPreferences(), nil
	}
	if err != nil {
		return Preferences{}, err
	}
	prefs := Preferences{
		EmailProductUpdates: doc.EmailProductUpdates,
		EmailSecurityAlerts: doc.EmailSecurityAlerts,
		DenseUI:             doc.DenseUI,
		Timezone:            doc.Timezone,
	}
	if prefs.Timezone == "" {
		prefs.Timezone = "Africa/Accra"
	}
	return prefs, nil
}

func (store *MongoStore) SavePreferences(ctx context.Context, publicID string, prefs Preferences, audit AuditEvent) error {
	now := time.Now().UTC()
	session, err := store.database.Client().StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(transaction context.Context) (any, error) {
		_, err := store.database.Collection("staff_preferences").UpdateOne(
			transaction,
			bson.M{"user_public_id": publicID},
			bson.M{
				"$set": bson.M{
					"user_public_id":        publicID,
					"email_product_updates": prefs.EmailProductUpdates,
					"email_security_alerts": prefs.EmailSecurityAlerts,
					"dense_ui":              prefs.DenseUI,
					"timezone":              prefs.Timezone,
					"updated_at":            now,
				},
				"$setOnInsert": bson.M{"public_id": uuid(), "created_at": now},
			},
			options.UpdateOne().SetUpsert(true),
		)
		if err != nil {
			return nil, err
		}
		return nil, store.appendAudit(transaction, audit)
	})
	return err
}

func (store *MongoStore) appendAudit(ctx context.Context, event AuditEvent) error {
	actor := any(nil)
	if event.ActorID != "" {
		if oid, err := bson.ObjectIDFromHex(event.ActorID); err == nil {
			actor = oid
		}
	}
	_, err := store.database.Collection("audit_logs").InsertOne(ctx, bson.M{"public_id": uuid(), "actor_id": actor, "action": event.Action, "entity_type": "auth", "entity_id": event.EntityID, "metadata": bson.M{"outcome": event.Outcome}, "created_at": event.CreatedAt})
	return err
}
func uuid() string {
	data := make([]byte, 16)
	if _, err := rand.Read(data); err != nil {
		panic("secure random unavailable")
	}
	data[6] = (data[6] & 0x0f) | 0x40
	data[8] = (data[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", data[0:4], data[4:6], data[6:8], data[8:10], data[10:16])
}
