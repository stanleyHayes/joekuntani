package content

import "strings"

// SectionType decides how a block is rendered. The set is deliberately small
// and derived from the copy that already exists rather than invented: the live
// About page is eleven prose blocks, some of which want an image beside them,
// one of which is a standalone claim, and one of which is a list of figures.
//
// A type the server does not know is rejected rather than stored, so a renderer
// never has to guess what an unrecognised block means.
type SectionType string

const (
	// SectionProse is the default: a heading and a body of Markdown.
	SectionProse SectionType = "prose"
	// SectionProseImage sets the same content beside a single image.
	SectionProseImage SectionType = "prose_image"
	// SectionQuote is a standalone claim, set large. Body is the quote.
	SectionQuote SectionType = "quote"
	// SectionStats is a row of label/value figures, no body.
	SectionStats SectionType = "stats"
	// SectionGallery is a set of images with an optional caption.
	SectionGallery SectionType = "gallery"
)

func validSectionType(value SectionType) bool {
	switch value {
	case SectionProse, SectionProseImage, SectionQuote, SectionStats, SectionGallery:
		return true
	}
	return false
}

// Section is one editable block of a page.
//
// Pages used to be a single Markdown body, which meant every block on a long
// page rendered identically — the live About page runs to eleven headings and
// nearly 7,000 characters in one undifferentiated column. Blocks let each part
// carry its own presentation while staying editable, reorderable and typed.
type Section struct {
	Type     SectionType `json:"type" bson:"type"`
	Heading  string      `json:"heading,omitempty" bson:"heading,omitempty"`
	Body     string      `json:"body,omitempty" bson:"body,omitempty"`
	AssetIDs []string    `json:"asset_ids" bson:"asset_ids"`
	Items    []Result    `json:"items" bson:"items"`
	// Flip mirrors a prose_image block so consecutive ones alternate sides
	// instead of marching down one edge of the page.
	Flip bool `json:"flip" bson:"flip"`
}

const (
	maxSections       = 40
	maxSectionHeading = 160
	maxSectionBody    = 20000
	maxSectionAssets  = 12
	maxSectionItems   = 12
)

// NormalizeSections trims each block and drops the empty ones.
//
// A repeater UI produces blank rows as a matter of course — an editor adds a
// block, then changes their mind. Persisting those would litter the page with
// empty sections that render as gaps, so a block with no heading, body, image
// or item is discarded rather than stored.
func NormalizeSections(sections []Section) []Section {
	kept := make([]Section, 0, len(sections))
	for _, section := range sections {
		section.Heading = strings.TrimSpace(section.Heading)
		section.Body = strings.TrimSpace(section.Body)
		section.AssetIDs = cleanStrings(section.AssetIDs)
		section.Items = cleanItems(section.Items)
		if section.Type == "" {
			section.Type = SectionProse
		}
		if section.Heading == "" && section.Body == "" &&
			len(section.AssetIDs) == 0 && len(section.Items) == 0 {
			continue
		}
		kept = append(kept, section)
	}
	return kept
}

// ValidateSections enforces the same bounds the schema validator does, so a bad
// block is refused with a 422 rather than failing the write with a 500.
func ValidateSections(sections []Section) error {
	if len(sections) > maxSections {
		return ErrInvalid
	}
	for _, section := range sections {
		if !validSectionType(section.Type) {
			return ErrInvalid
		}
		if !within(section.Heading, maxSectionHeading, false) ||
			!within(section.Body, maxSectionBody, false) {
			return ErrInvalid
		}
		if len(section.AssetIDs) > maxSectionAssets || len(section.Items) > maxSectionItems {
			return ErrInvalid
		}
		for _, id := range section.AssetIDs {
			if !within(id, 64, true) {
				return ErrInvalid
			}
		}
		for _, item := range section.Items {
			if !within(item.Label, 120, true) || !within(item.Value, 120, false) {
				return ErrInvalid
			}
		}
		// A block that renders nothing is a gap on the page, not content.
		if section.Heading == "" && section.Body == "" &&
			len(section.AssetIDs) == 0 && len(section.Items) == 0 {
			return ErrInvalid
		}
	}
	return nil
}

func cleanStrings(values []string) []string {
	kept := make([]string, 0, len(values))
	for _, value := range values {
		if value = strings.TrimSpace(value); value != "" {
			kept = append(kept, value)
		}
	}
	return kept
}

func cleanItems(items []Result) []Result {
	kept := make([]Result, 0, len(items))
	for _, item := range items {
		item.Label = strings.TrimSpace(item.Label)
		item.Value = strings.TrimSpace(item.Value)
		if item.Label != "" || item.Value != "" {
			kept = append(kept, item)
		}
	}
	return kept
}
