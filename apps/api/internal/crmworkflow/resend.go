package crmworkflow

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

type ResendSender struct {
	db                            *mongo.Database
	client                        *http.Client
	endpoint, key, from, adminURL string
}

// adminOriginUsable reports whether a notification email may link to this
// admin URL. TLS is required everywhere a link could leave the machine; plain
// http is tolerated only on loopback, so a local API can still send staff
// notifications instead of refusing to start. The Resend endpoint itself is
// held to https unconditionally — that call always crosses the network.
func adminOriginUsable(admin *url.URL) bool {
	if admin.Host == "" {
		return false
	}
	if admin.Scheme == "https" {
		return true
	}
	if admin.Scheme != "http" {
		return false
	}
	switch admin.Hostname() {
	case "localhost", "127.0.0.1", "::1":
		return true
	}
	return false
}

func NewResendSender(db *mongo.Database, client *http.Client, endpoint, key, from, adminURL string) (*ResendSender, error) {
	api, err := url.Parse(endpoint)
	admin, adminErr := url.Parse(adminURL)
	if db == nil || client == nil || err != nil || adminErr != nil || api.Scheme != "https" || api.Host == "" || !adminOriginUsable(admin) || len(key) < 16 || !strings.Contains(from, "@") {
		return nil, ErrInvalid
	}
	return &ResendSender{db, client, endpoint, key, from, strings.TrimRight(adminURL, "/")}, nil
}
func (s *ResendSender) Send(ctx context.Context, n InternalNotification) error {
	actor, err := bson.ObjectIDFromHex(n.AssigneeID)
	if err != nil {
		return ErrNotFound
	}
	var staff struct {
		Email  string `bson:"email"`
		Status string `bson:"status"`
	}
	if err = s.db.Collection("users").FindOne(ctx, bson.M{"_id": actor, "status": "active"}).Decode(&staff); err != nil {
		return mapped(err)
	}
	subject := "CRM follow-up assigned"
	if n.Kind == "task.overdue" {
		subject = "CRM task is overdue"
	} else if n.Kind == "enquiry.stage_changed" {
		subject = "CRM lead stage changed"
	}
	link := fmt.Sprintf("%s/crm?enquiry=%s", s.adminURL, url.QueryEscape(n.EnquiryID))
	payload, err := json.Marshal(map[string]any{"from": s.from, "to": []string{staff.Email}, "subject": subject, "html": fmt.Sprintf("<p>%s</p><p><a href=\"%s\">Open the protected CRM record</a></p>", subject, link)})
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, s.endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+s.key)
	request.Header.Set("Idempotency-Key", n.PublicID)
	request.Header.Set("Content-Type", "application/json")
	response, err := s.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("resend status %d", response.StatusCode)
	}
	return nil
}
