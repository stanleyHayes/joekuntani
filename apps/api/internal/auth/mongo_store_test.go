package auth

import "testing"

func TestNewSecretBoxAcceptsPaddedAndUnpaddedBase64(t *testing.T) {
	padded := "pYdT1AzvGpHOhdG3YM+ziZwUEqCuJQIuH7GSi4bMHf0="
	unpadded := "pYdT1AzvGpHOhdG3YM+ziZwUEqCuJQIuH7GSi4bMHf0"
	for _, key := range []string{padded, unpadded} {
		box, err := NewSecretBox(key)
		if err != nil {
			t.Fatalf("%q: %v", key, err)
		}
		sealed, err := box.Encrypt("secret")
		if err != nil {
			t.Fatalf("encrypt: %v", err)
		}
		plain, err := box.Decrypt(sealed)
		if err != nil || plain != "secret" {
			t.Fatalf("round-trip failed: %v %q", err, plain)
		}
	}
}
