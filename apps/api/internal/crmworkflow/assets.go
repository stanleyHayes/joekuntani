package crmworkflow

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

type AssetSigner struct {
	db      *mongo.Database
	key     []byte
	baseURL string
	now     func() time.Time
}

func NewAssetSigner(db *mongo.Database, key []byte, baseURL string, now func() time.Time) (*AssetSigner, error) {
	u, err := url.Parse(baseURL)
	localHTTP := u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1")
	if db == nil || len(key) < 32 || err != nil || (u.Scheme != "https" && !localHTTP) || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, ErrInvalid
	}
	if now == nil {
		now = time.Now
	}
	return &AssetSigner{db, append([]byte(nil), key...), strings.TrimRight(baseURL, "/"), now}, nil
}
func (s *AssetSigner) asset(ctx context.Context, id string) (string, string, error) {
	var v struct {
		PublicURL string `bson:"public_url"`
		MIME      string `bson:"mime_type"`
	}
	err := s.db.Collection("media_assets").FindOne(ctx, bson.M{"public_id": id, "status": "ready"}).Decode(&v)
	if err != nil {
		return "", "", mapped(err)
	}
	return v.PublicURL, v.MIME, nil
}
func (s *AssetSigner) IsProtectedReadyDocument(ctx context.Context, id string) (bool, error) {
	_, mime, err := s.asset(ctx, id)
	if errorsIsNotFound(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return mime == "application/pdf" || mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document", nil
}
func errorsIsNotFound(err error) bool { return err == ErrNotFound }
func (s *AssetSigner) signature(asset string, expires int64) string {
	mac := hmac.New(sha256.New, s.key)
	_, _ = fmt.Fprintf(mac, "%s\n%d", asset, expires)
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
func (s *AssetSigner) PrivateDownload(_ context.Context, id string, ttl time.Duration) (string, time.Time, error) {
	if ttl <= 0 || ttl > 10*time.Minute {
		return "", time.Time{}, ErrInvalid
	}
	exp := s.now().UTC().Add(ttl)
	q := url.Values{"asset": {id}, "expires": {strconv.FormatInt(exp.Unix(), 10)}}
	q.Set("signature", s.signature(id, exp.Unix()))
	return s.baseURL + "/api/admin/crm/proposal-download?" + q.Encode(), exp, nil
}
func (s *AssetSigner) Resolve(ctx context.Context, asset, expires, signature string) (string, error) {
	unix, err := strconv.ParseInt(expires, 10, 64)
	if err != nil || s.now().UTC().Unix() > unix || !hmac.Equal([]byte(signature), []byte(s.signature(asset, unix))) {
		return "", ErrForbidden
	}
	raw, mime, err := s.asset(ctx, asset)
	if err != nil {
		return "", err
	}
	if mime != "application/pdf" && mime != "application/vnd.openxmlformats-officedocument.wordprocessingml.document" {
		return "", ErrForbidden
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil {
		return "", ErrForbidden
	}
	return raw, nil
}
