package issuance

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
)

func TestBearersAreDeterministicOpaqueAndPurposeBound(t *testing.T) {
	issuer := &MongoIssuer{key: []byte("0123456789abcdef0123456789abcdef")}
	ticket := issuer.ticketBearer("018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201")
	access := issuer.orderBearer("018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201")
	if ticket == access || !strings.HasPrefix(ticket, "jkt1.") || !strings.HasPrefix(access, "jka1.") {
		t.Fatalf("bearers are not purpose-bound: %q %q", ticket, access)
	}
	if strings.Contains(ticket, "@") || strings.Contains(ticket, "Buyer") || len(ticket) < 80 {
		t.Fatalf("ticket bearer leaks PII or lacks entropy: %q", ticket)
	}
	sum := sha256.Sum256([]byte(ticket))
	if sha256Hex(ticket) != hex.EncodeToString(sum[:]) || issuer.ticketBearer("018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201") != ticket {
		t.Fatal("bearer derivation/hash is unstable")
	}
}

func TestMaskEmail(t *testing.T) {
	if got := MaskEmail("ama@example.com"); got != "a***@example.com" {
		t.Fatalf("masked email=%q", got)
	}
	if got := MaskEmail("invalid"); got != "***" {
		t.Fatalf("invalid mask=%q", got)
	}
}
