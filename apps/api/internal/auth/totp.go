package auth

import (
	"crypto/hmac"
	"crypto/sha1" // #nosec G505 -- TOTP HMAC-SHA1 is required by RFC 6238 and is not used as a password hash.
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"strings"
	"time"
)

func VerifyTOTP(secret, code string, now time.Time) (int64, bool) {
	if len(code) != 6 {
		return 0, false
	}
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(strings.ReplaceAll(secret, " ", "")))
	if err != nil || len(key) < 16 {
		return 0, false
	}
	for offset := int64(-1); offset <= 1; offset++ {
		counter := uint64(now.Unix()/30 + offset)
		message := make([]byte, 8)
		binary.BigEndian.PutUint64(message, counter)
		mac := hmac.New(sha1.New, key)
		_, _ = mac.Write(message)
		digest := mac.Sum(nil)
		position := digest[len(digest)-1] & 0x0f
		value := (uint32(digest[position])&0x7f)<<24 | uint32(digest[position+1])<<16 | uint32(digest[position+2])<<8 | uint32(digest[position+3])
		expected := fmt.Sprintf("%06d", value%1_000_000)
		if subtle.ConstantTimeCompare([]byte(expected), []byte(code)) == 1 {
			return int64(counter), true
		}
	}
	return 0, false
}
