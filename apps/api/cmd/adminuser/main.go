package main

import (
	"context"
	"fmt"
	"os"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
	mongoplatform "github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo"
)

func main() {
	ctx := context.Background()
	client, err := mongoplatform.Connect(ctx, mongoplatform.Config{URI: os.Getenv("MONGODB_URI"), Database: os.Getenv("MONGODB_DATABASE"), Environment: os.Getenv("APP_ENV")})
	if err != nil {
		fail(err)
	}
	defer func() { _ = client.Close(context.Background()) }()
	box, err := auth.NewSecretBox(os.Getenv("MFA_ENCRYPTION_KEY"))
	if err != nil {
		fail(err)
	}
	store := auth.NewMongoStore(client.Database(), box)
	role := auth.Role(os.Getenv("STAFF_ROLE"))
	mfaSecret := ""
	if role == auth.RoleAdministrator {
		// Administrators enroll their own authenticator after password login.
		// Generate the enrollment secret here instead of accepting a shared,
		// long-lived STAFF_MFA_SECRET from an environment file.
		mfaSecret, err = auth.GenerateMFASecret()
		if err != nil {
			fail(err)
		}
	}
	var publicID string
	if os.Getenv("STAFF_RESET_EXISTING") == "yes" {
		publicID, err = store.ResetProvisionedUser(ctx, os.Getenv("STAFF_NAME"), os.Getenv("STAFF_EMAIL"), os.Getenv("STAFF_PASSWORD"), role, mfaSecret)
	} else {
		publicID, err = store.ProvisionUser(ctx, os.Getenv("STAFF_NAME"), os.Getenv("STAFF_EMAIL"), os.Getenv("STAFF_PASSWORD"), role, mfaSecret)
	}
	if err != nil {
		fail(err)
	}
	fmt.Printf("staff user provisioned: %s\n", publicID)
}

func fail(err error) { fmt.Fprintln(os.Stderr, "staff provisioning failed:", err); os.Exit(1) }
