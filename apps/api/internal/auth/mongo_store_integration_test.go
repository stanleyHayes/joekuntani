package auth_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha1" // #nosec G505 -- RFC 6238 test vector generation.
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/changes"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const integrationSecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"

func TestMongoAuthTransactionsAndConcurrentMFA(t *testing.T) {
	client, database := authDatabase(t, "transactions")
	_ = client
	box, err := auth.NewSecretBox("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY")
	if err != nil {
		t.Fatal(err)
	}
	store := auth.NewMongoStore(database, box)
	password := "correct horse battery staple"
	adminID, err := store.ProvisionUser(t.Context(), "Test administrator", "admin@example.invalid", password, auth.RoleAdministrator, integrationSecret)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Truncate(time.Second)
	service := auth.NewService(store, func() time.Time { return now }, time.Hour)
	first, err := service.Login(t.Context(), auth.Credentials{Email: "admin@example.invalid", Password: password})
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.Login(t.Context(), auth.Credentials{Email: "admin@example.invalid", Password: password})
	if err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	results := make(chan struct {
		token string
		err   error
	}, 2)
	var wait sync.WaitGroup
	for _, value := range []string{first.Session, second.Session} {
		value := value
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			tokens, err := service.CompleteMFA(context.Background(), value, integrationTOTP(integrationSecret, now))
			results <- struct {
				token string
				err   error
			}{tokens.Session, err}
		}()
	}
	close(start)
	wait.Wait()
	close(results)
	successes := 0
	authenticatedToken := ""
	for result := range results {
		if result.err == nil {
			successes++
			authenticatedToken = result.token
		}
	}
	if successes != 1 {
		t.Fatalf("concurrent MFA successes = %d, want 1", successes)
	}
	principal, _, err := service.Authenticate(t.Context(), authenticatedToken)
	if err != nil || principal.UserID != adminID {
		t.Fatalf("authenticated principal = %#v, %v", principal, err)
	}

	targetID, err := store.ProvisionUser(t.Context(), "Test booking manager", "booking@example.invalid", password, auth.RoleBookingManager, integrationSecret)
	if err != nil {
		t.Fatal(err)
	}
	targetTokens, err := service.Login(t.Context(), auth.Credentials{Email: "booking@example.invalid", Password: password})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.DisableUser(t.Context(), principal, targetID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.Authenticate(t.Context(), targetTokens.Session); err != auth.ErrUnauthorized {
		t.Fatalf("revoked session error = %v", err)
	}
	count, err := database.Collection("audit_logs").CountDocuments(t.Context(), bson.M{"action": bson.M{"$in": bson.A{"user.provision", "auth.login", "auth.mfa", "user.disable"}}})
	if err != nil {
		t.Fatal(err)
	}
	if count < 7 {
		t.Fatalf("audit event count = %d, want at least 7", count)
	}
}

func TestProvisionRollsBackWhenAuditIsRejected(t *testing.T) {
	_, database := authDatabase(t, "auditrollback")
	box, err := auth.NewSecretBox("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY")
	if err != nil {
		t.Fatal(err)
	}
	command := bson.D{{Key: "collMod", Value: "audit_logs"}, {Key: "validator", Value: bson.M{"$expr": bson.M{"$eq": bson.A{1, 0}}}}, {Key: "validationLevel", Value: "strict"}}
	if err := database.RunCommand(t.Context(), command).Err(); err != nil {
		t.Fatal(err)
	}
	_, err = auth.NewMongoStore(database, box).ProvisionUser(t.Context(), "Rollback user", "rollback@example.invalid", "correct horse battery staple", auth.RoleAdministrator, integrationSecret)
	if err == nil {
		t.Fatal("provision succeeded while audit write was rejected")
	}
	count, err := database.Collection("users").CountDocuments(t.Context(), bson.M{"email": "rollback@example.invalid"})
	if err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("user count after failed audit = %d", count)
	}
}

func TestDisableAndRevocationRollBackWhenAuditIsRejected(t *testing.T) {
	_, database := authDatabase(t, "disablerollback")
	box, err := auth.NewSecretBox("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY")
	if err != nil {
		t.Fatal(err)
	}
	store := auth.NewMongoStore(database, box)
	password := "correct horse battery staple"
	publicID, err := store.ProvisionUser(t.Context(), "Rollback target", "target@example.invalid", password, auth.RoleContentEditor, "")
	if err != nil {
		t.Fatal(err)
	}
	service := auth.NewService(store, time.Now, time.Hour)
	tokens, err := service.Login(t.Context(), auth.Credentials{Email: "target@example.invalid", Password: password})
	if err != nil {
		t.Fatal(err)
	}
	command := bson.D{{Key: "collMod", Value: "audit_logs"}, {Key: "validator", Value: bson.M{"$expr": bson.M{"$eq": bson.A{1, 0}}}}, {Key: "validationLevel", Value: "strict"}}
	if err := database.RunCommand(t.Context(), command).Err(); err != nil {
		t.Fatal(err)
	}
	err = store.DisableUserAndRevokeSessions(t.Context(), publicID, time.Now().UTC(), auth.AuditEvent{Action: "user.disable", EntityID: publicID, Outcome: "accepted", CreatedAt: time.Now().UTC()})
	if err == nil {
		t.Fatal("disable succeeded while audit write was rejected")
	}
	if _, _, err := service.Authenticate(t.Context(), tokens.Session); err != nil {
		t.Fatalf("session revoked despite audit rollback: %v", err)
	}
}

func authDatabase(t *testing.T, suffix string) (*mongo.Client, *mongo.Database) {
	t.Helper()
	uri := os.Getenv("MONGODB_INTEGRATION_URI")
	if uri == "" {
		t.Skip("MONGODB_INTEGRATION_URI is not configured")
	}
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Disconnect(context.Background()) })
	if setName := os.Getenv("MONGODB_INTEGRATION_INIT_REPLICA_SET"); setName != "" {
		host := os.Getenv("MONGODB_INTEGRATION_REPLICA_HOST")
		if host == "" {
			t.Fatal("MONGODB_INTEGRATION_REPLICA_HOST is required when initializing a replica set")
		}
		command := bson.D{{Key: "replSetInitiate", Value: bson.M{"_id": setName, "members": bson.A{bson.M{"_id": 0, "host": host}}}}}
		err := client.Database("admin").RunCommand(t.Context(), command).Err()
		if err != nil && !strings.Contains(err.Error(), "already initialized") {
			t.Fatal(err)
		}
		deadline := time.Now().Add(15 * time.Second)
		for {
			var status struct {
				IsWritablePrimary bool `bson:"isWritablePrimary"`
			}
			_ = client.Database("admin").RunCommand(t.Context(), bson.D{{Key: "hello", Value: 1}}).Decode(&status)
			if status.IsWritablePrimary {
				break
			}
			if time.Now().After(deadline) {
				t.Fatal("replica set did not elect a primary")
			}
			time.Sleep(100 * time.Millisecond)
		}
	}
	var hello struct {
		SetName string `bson:"setName"`
	}
	if err := client.Database("admin").RunCommand(t.Context(), bson.D{{Key: "hello", Value: 1}}).Decode(&hello); err != nil {
		t.Fatal(err)
	}
	if hello.SetName == "" {
		t.Skip("MongoDB integration URI is not a replica set; transaction proof requires one")
	}
	database := client.Database("joe_kuntani_test_jk003_" + suffix)
	if err := database.Drop(t.Context()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Drop(context.Background()) })
	if err := changes.ApplyAll(t.Context(), database, changes.Registry()); err != nil {
		t.Fatal(err)
	}
	return client, database
}

func integrationTOTP(secret string, now time.Time) string {
	key, _ := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	message := make([]byte, 8)
	binary.BigEndian.PutUint64(message, uint64(now.Unix()/30))
	mac := hmac.New(sha1.New, key)
	_, _ = mac.Write(message)
	digest := mac.Sum(nil)
	offset := digest[len(digest)-1] & 0xf
	value := (uint32(digest[offset])&0x7f)<<24 | uint32(digest[offset+1])<<16 | uint32(digest[offset+2])<<8 | uint32(digest[offset+3])
	return fmt.Sprintf("%06d", value%1_000_000)
}
