package issuance

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type DeadLetterView struct {
	ID             string    `json:"id" bson:"public_id"`
	OrderReference string    `json:"order_reference" bson:"order_reference"`
	Kind           string    `json:"kind" bson:"kind"`
	Attempts       int       `json:"attempts" bson:"attempts"`
	ErrorCode      string    `json:"error_code" bson:"last_error_code"`
	DeadLetteredAt time.Time `json:"dead_lettered_at" bson:"dead_lettered_at"`
}

type AdminHandler struct {
	db    *mongo.Database
	audit auth.Store
	now   func() time.Time
}

func NewAdminHandler(db *mongo.Database, audit auth.Store) *AdminHandler {
	return &AdminHandler{db: db, audit: audit, now: time.Now}
}

func (h *AdminHandler) DeadLetters(response http.ResponseWriter, request *http.Request) {
	principal, ok := auth.PrincipalFromContext(request.Context())
	if !ok || principal.Role != auth.RoleAdministrator {
		h.problem(response, http.StatusForbidden, "Delivery visibility denied")
		return
	}
	cursor, err := h.db.Collection("ticket_delivery_outbox").Find(request.Context(), bson.M{"status": "dead_letter"}, options.Find().SetSort(bson.D{{Key: "dead_lettered_at", Value: -1}}).SetLimit(100))
	if err != nil {
		h.problem(response, http.StatusServiceUnavailable, "Delivery visibility unavailable")
		return
	}
	var deliveries []DeadLetterView
	if err = cursor.All(request.Context(), &deliveries); err != nil {
		h.problem(response, http.StatusServiceUnavailable, "Delivery visibility unavailable")
		return
	}
	if deliveries == nil {
		deliveries = []DeadLetterView{}
	}
	if err = h.audit.AppendAudit(request.Context(), auth.AuditEvent{ActorID: principal.InternalUserID, Action: "ticket.delivery.dead_letters.read", EntityID: "ticket_delivery_outbox", Outcome: "accepted", CreatedAt: h.now().UTC()}); err != nil {
		h.problem(response, http.StatusServiceUnavailable, "Delivery visibility unavailable")
		return
	}
	response.Header().Set("Content-Type", "application/json")
	response.Header().Set("Cache-Control", "private, no-store")
	_ = json.NewEncoder(response).Encode(map[string]any{"items": deliveries})
}

func (*AdminHandler) problem(response http.ResponseWriter, status int, title string) {
	response.Header().Set("Content-Type", "application/problem+json")
	response.Header().Set("Cache-Control", "no-store")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(map[string]any{"type": "about:blank", "title": title, "status": status})
}
