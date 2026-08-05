package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	mongoplatform "github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/changes"
)

func main() {
	if err := run(context.Background()); err != nil {
		slog.Error("MongoDB controlled changes failed", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	config := mongoplatform.Config{
		URI: os.Getenv("MONGODB_URI"), Database: os.Getenv("MONGODB_DATABASE"),
		Environment: os.Getenv("APP_ENV"), ConnectTimeout: 15 * time.Second,
	}
	client, err := mongoplatform.Connect(ctx, config)
	if err != nil {
		return err
	}
	defer func() {
		closeContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if closeErr := client.Close(closeContext); closeErr != nil {
			slog.Error("close MongoDB client", "error", closeErr)
		}
	}()

	if err := changes.ApplyAll(ctx, client.Database(), changes.Registry()); err != nil {
		return err
	}
	fmt.Println("MongoDB controlled changes applied and verified.")
	return nil
}
