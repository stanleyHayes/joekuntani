package content

import "testing"

// The stored video link is validated as a UUID, so an empty string is not a
// permitted value — it is a schema violation, and the write comes back as a
// 500 an editor can do nothing with. Every video and press record without a
// video attached used to hit this on every save.
func TestVideoAssetIDIsOmittedWhenAbsent(t *testing.T) {
	for _, kind := range []Kind{Video, Press} {
		document := toBSON(Item{Kind: kind}, false)
		if _, present := document["video_asset_id"]; present {
			t.Fatalf("%s wrote video_asset_id with no video attached: %v", kind, document["video_asset_id"])
		}
	}
}

func TestVideoAssetIDIsWrittenWhenPresent(t *testing.T) {
	const assetID = "7a1c9f2e-1111-4222-8333-444455556666"
	for _, kind := range []Kind{Video, Press} {
		document := toBSON(Item{Kind: kind, VideoAssetID: assetID}, false)
		if document["video_asset_id"] != assetID {
			t.Fatalf("%s dropped its video link: %v", kind, document["video_asset_id"])
		}
	}
}

// Only these two kinds carry a video, so the field must never appear on the
// others — the collection validators do not allow it there.
func TestVideoAssetIDNeverLeaksToOtherKinds(t *testing.T) {
	const assetID = "7a1c9f2e-1111-4222-8333-444455556666"
	for _, kind := range []Kind{Page, Portfolio, Testimonial} {
		document := toBSON(Item{Kind: kind, VideoAssetID: assetID}, false)
		if _, present := document["video_asset_id"]; present {
			t.Fatalf("%s wrote a video link it cannot store", kind)
		}
	}
}
