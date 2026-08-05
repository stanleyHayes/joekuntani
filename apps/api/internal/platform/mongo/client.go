package mongoplatform

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Client struct {
	client   *mongo.Client
	database *mongo.Database
}

func Connect(parent context.Context, config Config) (*Client, error) {
	if err := config.Validate(); err != nil {
		return nil, fmt.Errorf("validate MongoDB config: %w", err)
	}

	contextWithTimeout, cancel := context.WithTimeout(parent, config.timeout())
	defer cancel()

	client, err := mongo.Connect(options.Client().ApplyURI(config.URI).SetAppName("joe-kuntani-api-" + config.Environment))
	if err != nil {
		return nil, fmt.Errorf("connect to MongoDB: %w", err)
	}
	if err := client.Ping(contextWithTimeout, nil); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, fmt.Errorf("ping MongoDB: %w", err)
	}

	return &Client{client: client, database: client.Database(config.Database)}, nil
}

func (client *Client) Database() *mongo.Database {
	return client.database
}

func (client *Client) Close(ctx context.Context) error {
	if client == nil || client.client == nil {
		return nil
	}
	return client.client.Disconnect(ctx)
}
