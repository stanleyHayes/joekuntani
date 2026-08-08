package enquiries

import "testing"

// Channels only ever applies to a brand enquiry, so an event enquiry always
// arrives with it nil. Nil encodes to BSON null, the schema validator demands
// an array, and the whole submission was rejected — the enquirer got a 503 and
// nothing reached storage, the outbox, or the console.
func TestEnquiryDocumentWritesEmptyChannelsForEventEnquiries(t *testing.T) {
	document := enquiryDocument(Enquiry{EnquiryType: "event"})
	details, ok := document["details"].(Details)
	if !ok {
		t.Fatalf("details = %T", document["details"])
	}
	if details.Channels == nil {
		t.Fatal("channels is nil and will encode to BSON null")
	}
	if len(details.Channels) != 0 {
		t.Fatalf("channels = %#v, want empty", details.Channels)
	}
}

func TestEnquiryDocumentWritesEmptyAnswersWhenNoneAsked(t *testing.T) {
	document := enquiryDocument(Enquiry{})
	answers, ok := document["answers"].(map[string]any)
	if !ok {
		t.Fatalf("answers = %T", document["answers"])
	}
	if answers == nil || len(answers) != 0 {
		t.Fatalf("answers = %#v, want an empty object", answers)
	}
}

func TestEnquiryDocumentPreservesSuppliedValues(t *testing.T) {
	document := enquiryDocument(Enquiry{
		Details: Details{Channels: []string{"radio", "social"}},
		Answers: map[string]any{"event_format": "Festival"},
	})
	if got := document["details"].(Details).Channels; len(got) != 2 || got[0] != "radio" {
		t.Fatalf("channels = %#v", got)
	}
	if got := document["answers"].(map[string]any); got["event_format"] != "Festival" {
		t.Fatalf("answers = %#v", got)
	}
}
