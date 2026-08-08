package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1" // #nosec G505 -- TOTP HMAC-SHA1 is required by RFC 6238 and is not used as a password hash.
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"errors"
	"fmt"
	"strings"
	"time"
)

func GenerateMFASecret() (string, error) {
	raw := make([]byte, 20)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(raw), nil
}

func VerifyTOTP(secret, code string, now time.Time) (int64, bool) {
	if len(code) != 6 {
		return 0, false
	}
	key, err := decodeMFASecret(secret)
	if err != nil {
		return 0, false
	}
	for offset := int64(-1); offset <= 1; offset++ {
		counter := uint64(now.Unix()/30 + offset)
		if subtle.ConstantTimeCompare([]byte(totpDigits(key, counter)), []byte(code)) == 1 {
			return int64(counter), true
		}
	}
	return 0, false
}

// GenerateTOTP produces the code an authenticator app would show for the secret
// at the given instant. Only the local devmfa tool calls it; the server never
// mints codes, it only verifies the ones a client presents.
func GenerateTOTP(secret string, now time.Time) (string, error) {
	key, err := decodeMFASecret(secret)
	if err != nil {
		return "", err
	}
	return totpDigits(key, uint64(now.Unix()/30)), nil
}

func decodeMFASecret(secret string) ([]byte, error) {
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(strings.ReplaceAll(secret, " ", "")))
	if err != nil {
		return nil, err
	}
	if len(key) < 16 {
		return nil, errors.New("mfa secret must decode to at least 16 bytes")
	}
	return key, nil
}

func totpDigits(key []byte, counter uint64) string {
	message := make([]byte, 8)
	binary.BigEndian.PutUint64(message, counter)
	mac := hmac.New(sha1.New, key)
	_, _ = mac.Write(message)
	digest := mac.Sum(nil)
	position := digest[len(digest)-1] & 0x0f
	value := (uint32(digest[position])&0x7f)<<24 | uint32(digest[position+1])<<16 | uint32(digest[position+2])<<8 | uint32(digest[position+3])
	return fmt.Sprintf("%06d", value%1_000_000)
}
