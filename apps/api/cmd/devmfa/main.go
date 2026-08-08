// Command devmfa prints the current TOTP code for a staff account so local
// browser automation can clear the MFA step. Administrators must have MFA
// enabled in every environment, so there is no bypass to switch on — a local
// runner needs a real code, and this reads the same encrypted secret the API
// verifies against. It never writes, and it refuses to run outside development.
package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
	mongoplatform "github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func main() {
	environment := strings.TrimSpace(os.Getenv("APP_ENV"))
	if !map[string]bool{"": true, "local": true, "development": true, "dev": true, "test": true}[environment] {
		fail(fmt.Errorf("devmfa refuses to run with APP_ENV=%q", environment))
	}
	email := strings.ToLower(strings.TrimSpace(os.Getenv("STAFF_EMAIL")))
	if len(os.Args) > 1 {
		email = strings.ToLower(strings.TrimSpace(os.Args[1]))
	}
	if email == "" {
		fail(errors.New("pass an email as the first argument or set STAFF_EMAIL"))
	}

	ctx := context.Background()
	client, err := mongoplatform.Connect(ctx, mongoplatform.Config{URI: os.Getenv("MONGODB_URI"), Database: os.Getenv("MONGODB_DATABASE"), Environment: environment})
	if err != nil {
		fail(err)
	}
	defer func() { _ = client.Close(context.Background()) }()

	box, err := auth.NewSecretBox(os.Getenv("MFA_ENCRYPTION_KEY"))
	if err != nil {
		fail(err)
	}

	var document struct {
		MFAEnabled bool   `bson:"mfa_enabled"`
		MFASecret  string `bson:"mfa_secret_encrypted"`
	}
	if err = client.Database().Collection("users").FindOne(ctx, bson.M{"email": email}).Decode(&document); err != nil {
		fail(fmt.Errorf("find %s: %w", email, err))
	}
	if !document.MFAEnabled || document.MFASecret == "" {
		fail(fmt.Errorf("%s has no MFA secret enrolled; provision it with cmd/adminuser first", email))
	}
	secret, err := box.Decrypt(document.MFASecret)
	if err != nil {
		fail(err)
	}
	code, err := auth.GenerateTOTP(secret, time.Now())
	if err != nil {
		fail(err)
	}
	fmt.Println(code)
}

func fail(err error) { fmt.Fprintln(os.Stderr, "devmfa failed:", err); os.Exit(1) }
