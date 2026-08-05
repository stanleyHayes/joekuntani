package search

import "testing"

func TestMongoSourcesExposeOnlyMinimalProjection(t *testing.T) {
	t.Parallel()
	for _, kind := range []Kind{KindEnquiry, KindContact, KindCampaign, KindBooking, KindContent} {
		values := sources(kind)
		if len(values) == 0 {
			t.Fatalf("missing source for %s", kind)
		}
		for _, value := range values {
			for _, forbidden := range []string{"email", "phone", "summary", "objective", "body", "fee", "expenses", "requirements"} {
				if _, ok := value.projection[forbidden]; ok {
					t.Fatalf("%s exposes %s", kind, forbidden)
				}
			}
			if value.projection["_id"] != 0 || value.projection["public_id"] != 1 {
				t.Fatalf("unsafe projection for %s: %#v", kind, value.projection)
			}
		}
	}
}
