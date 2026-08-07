package newsletter

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

var (
	ErrInvalid  = errors.New("invalid newsletter signup")
	ErrConflict = errors.New("already subscribed")
	ErrNotFound = errors.New("subscriber not found")
)

type Subscriber struct {
	ID             string     `json:"id"`
	Email          string     `json:"email"`
	Name           string     `json:"name,omitempty"`
	Source         string     `json:"source"`
	Status         string     `json:"status"`
	ConsentVersion string     `json:"consent_version"`
	ConsentAt      time.Time  `json:"consent_at"`
	CreatedAt      time.Time  `json:"created_at"`
	UnsubscribedAt *time.Time `json:"unsubscribed_at,omitempty"`
}

type Signup struct {
	Email          string `json:"email"`
	Name           string `json:"name"`
	Source         string `json:"source"`
	ConsentVersion string `json:"consent_version"`
	Consent        bool   `json:"consent"`
}

type Store struct {
	db *mongo.Database
}

func NewStore(db *mongo.Database) *Store { return &Store{db: db} }

func (store *Store) Subscribe(ctx context.Context, input Signup) (Subscriber, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	name := strings.TrimSpace(input.Name)
	source := strings.TrimSpace(input.Source)
	consentVersion := strings.TrimSpace(input.ConsentVersion)
	if email == "" || !strings.Contains(email, "@") || !input.Consent || consentVersion == "" {
		return Subscriber{}, ErrInvalid
	}
	if source == "" {
		source = "website"
	}
	if len(name) > 120 || len(source) > 80 || len(consentVersion) > 40 {
		return Subscriber{}, ErrInvalid
	}
	now := time.Now().UTC()
	publicID := newID()
	filter := bson.M{"email": email}
	update := bson.M{
		"$set": bson.M{
			"email":           email,
			"name":            name,
			"source":          source,
			"status":          "active",
			"consent_version": consentVersion,
			"consent_at":      now,
			"unsubscribed_at": nil,
			"updated_at":      now,
		},
		"$setOnInsert": bson.M{"public_id": publicID, "created_at": now},
	}
	opts := options.UpdateOne().SetUpsert(true)
	result, err := store.db.Collection("newsletter_subscribers").UpdateOne(ctx, filter, update, opts)
	if err != nil {
		return Subscriber{}, err
	}
	if result.MatchedCount == 1 && result.ModifiedCount == 0 && result.UpsertedCount == 0 {
		// Already active with same data — treat as ok idempotent subscribe.
	}
	var doc subscriberDoc
	if err := store.db.Collection("newsletter_subscribers").FindOne(ctx, filter).Decode(&doc); err != nil {
		return Subscriber{}, err
	}
	return doc.toSubscriber(), nil
}

func (store *Store) List(ctx context.Context) ([]Subscriber, error) {
	cursor, err := store.db.Collection("newsletter_subscribers").Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}).SetLimit(500))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	out := make([]Subscriber, 0)
	for cursor.Next(ctx) {
		var doc subscriberDoc
		if err := cursor.Decode(&doc); err != nil {
			return nil, err
		}
		out = append(out, doc.toSubscriber())
	}
	return out, cursor.Err()
}

func (store *Store) Unsubscribe(ctx context.Context, id string) error {
	now := time.Now().UTC()
	result, err := store.db.Collection("newsletter_subscribers").UpdateOne(
		ctx,
		bson.M{"public_id": id},
		bson.M{"$set": bson.M{"status": "unsubscribed", "unsubscribed_at": now, "updated_at": now}},
	)
	if err != nil {
		return err
	}
	if result.MatchedCount != 1 {
		return ErrNotFound
	}
	return nil
}

type subscriberDoc struct {
	PublicID       string     `bson:"public_id"`
	Email          string     `bson:"email"`
	Name           string     `bson:"name"`
	Source         string     `bson:"source"`
	Status         string     `bson:"status"`
	ConsentVersion string     `bson:"consent_version"`
	ConsentAt      time.Time  `bson:"consent_at"`
	CreatedAt      time.Time  `bson:"created_at"`
	UnsubscribedAt *time.Time `bson:"unsubscribed_at"`
}

func (doc subscriberDoc) toSubscriber() Subscriber {
	return Subscriber{
		ID: doc.PublicID, Email: doc.Email, Name: doc.Name, Source: doc.Source, Status: doc.Status,
		ConsentVersion: doc.ConsentVersion, ConsentAt: doc.ConsentAt, CreatedAt: doc.CreatedAt, UnsubscribedAt: doc.UnsubscribedAt,
	}
}

func newID() string {
	data := make([]byte, 16)
	_, _ = rand.Read(data)
	data[6] = (data[6] & 0x0f) | 0x40
	data[8] = (data[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", data[0:4], data[4:6], data[6:8], data[8:10], data[10:16])
}

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler { return &Handler{store: store} }

func (handler *Handler) PublicRoutes() http.Handler {
	router := chi.NewRouter()
	router.Post("/", handler.subscribe)
	return router
}

func (handler *Handler) AdminRoutes() http.Handler {
	router := chi.NewRouter()
	router.Get("/", handler.list)
	router.Post("/{id}/unsubscribe", handler.unsubscribe)
	return router
}

func (handler *Handler) subscribe(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input Signup
	if err := decoder.Decode(&input); err != nil {
		problem(w, http.StatusBadRequest, "Invalid request")
		return
	}
	subscriber, err := handler.store.Subscribe(r.Context(), input)
	if err != nil {
		if errors.Is(err, ErrInvalid) {
			problem(w, http.StatusUnprocessableEntity, "Invalid newsletter signup")
			return
		}
		problem(w, http.StatusServiceUnavailable, "Newsletter unavailable")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(subscriber)
}

func (handler *Handler) list(w http.ResponseWriter, r *http.Request) {
	items, err := handler.store.List(r.Context())
	if err != nil {
		problem(w, http.StatusServiceUnavailable, "Newsletter unavailable")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"subscribers": items})
}

func (handler *Handler) unsubscribe(w http.ResponseWriter, r *http.Request) {
	if err := handler.store.Unsubscribe(r.Context(), chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, ErrNotFound) {
			problem(w, http.StatusNotFound, "Subscriber not found")
			return
		}
		problem(w, http.StatusServiceUnavailable, "Newsletter unavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func problem(w http.ResponseWriter, status int, title string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "title": title, "status": status})
}
