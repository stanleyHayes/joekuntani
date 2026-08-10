package content

import (
	"strings"
	"testing"
)

// A repeater produces blank rows as a matter of course — an editor adds a block
// then changes their mind. Storing those would render as gaps on the page.
func TestNormalizeSectionsDropsEmptyBlocks(t *testing.T) {
	got := NormalizeSections([]Section{
		{Type: SectionProse, Heading: "  Kept  ", Body: "  body  ", Tags: []string{" comedy ", "  "}},
		{Type: SectionProse},
		{Type: SectionProse, Heading: "   ", Body: "  "},
		{Type: SectionStats, Items: []Result{{Label: " Shows ", Value: " 40 "}, {}}},
		{Type: SectionGallery, AssetIDs: []string{" a ", "", "  "}},
	})
	if len(got) != 3 {
		t.Fatalf("kept %d blocks, want 3: %#v", len(got), got)
	}
	if got[0].Heading != "Kept" || got[0].Body != "body" {
		t.Fatalf("not trimmed: %#v", got[0])
	}
	if len(got[0].Tags) != 1 || got[0].Tags[0] != "comedy" {
		t.Fatalf("tags not cleaned: %#v", got[0].Tags)
	}
	if len(got[1].Items) != 1 || got[1].Items[0].Label != "Shows" {
		t.Fatalf("items not cleaned: %#v", got[1].Items)
	}
	if len(got[2].AssetIDs) != 1 || got[2].AssetIDs[0] != "a" {
		t.Fatalf("asset ids not cleaned: %#v", got[2].AssetIDs)
	}
}

// An untyped block is the common case from a form that posts before the editor
// picks a type; prose is the sane default rather than a validation failure.
func TestNormalizeSectionsDefaultsToProse(t *testing.T) {
	got := NormalizeSections([]Section{{Heading: "Untyped"}})
	if len(got) != 1 || got[0].Type != SectionProse {
		t.Fatalf("type = %q, want prose", got[0].Type)
	}
}

// A type the server does not know would reach a renderer that cannot draw it.
func TestValidateSectionsRejectsUnknownType(t *testing.T) {
	if err := ValidateSections([]Section{{Type: "carousel", Heading: "x"}}); err == nil {
		t.Fatal("an unknown section type was accepted")
	}
	for _, known := range []SectionType{SectionProse, SectionProseImage, SectionQuote, SectionStats, SectionGallery} {
		if err := ValidateSections([]Section{{Type: known, Heading: "x"}}); err != nil {
			t.Fatalf("%q rejected: %v", known, err)
		}
	}
}

// The bounds have to match the schema validator, or a too-long block fails the
// write with a 500 instead of being refused with a 422.
func TestValidateSectionsEnforcesTheSchemaBounds(t *testing.T) {
	cases := map[string][]Section{
		"too many blocks":  make([]Section, maxSections+1),
		"heading too long": {{Type: SectionProse, Heading: strings.Repeat("x", maxSectionHeading+1)}},
		"body too long":    {{Type: SectionProse, Body: strings.Repeat("x", maxSectionBody+1)}},
		"too many assets":  {{Type: SectionGallery, AssetIDs: make([]string, maxSectionAssets+1)}},
		"too many items":   {{Type: SectionStats, Items: make([]Result, maxSectionItems+1)}},
		"too many tags":    {{Type: SectionProse, Heading: "x", Tags: make([]string, maxSectionTags+1)}},
		"empty block":      {{Type: SectionProse}},
	}
	for name, sections := range cases {
		if err := ValidateSections(sections); err == nil {
			t.Fatalf("%s was accepted", name)
		}
	}
}

// Bodies are Markdown and may contain any language; the bound counts runes and
// bytes the same way the schema does.
func TestValidateSectionsAcceptsMultiByteContent(t *testing.T) {
	sections := NormalizeSections([]Section{
		{Type: SectionProse, Heading: "Répertoire", Body: "Il joue de la guitare — 音楽 🎸"},
	})
	if err := ValidateSections(sections); err != nil {
		t.Fatalf("multi-byte content rejected: %v", err)
	}
}

// Nothing predates blocks with them, so absent must stay valid — otherwise the
// first update to any existing record fails.
func TestValidateSectionsAllowsNone(t *testing.T) {
	if err := ValidateSections(nil); err != nil {
		t.Fatalf("nil sections rejected: %v", err)
	}
	if err := ValidateSections([]Section{}); err != nil {
		t.Fatalf("empty sections rejected: %v", err)
	}
}
