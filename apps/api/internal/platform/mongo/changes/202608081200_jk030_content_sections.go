package changes

import (
	"context"
	"strings"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const contentSectionsChangeName = "202608081200_jk030_content_sections"

// contentSectionsChange lets an editorial record be composed of typed blocks
// rather than one Markdown body.
//
// The live About page is nearly 7,000 characters under eleven headings in a
// single field, so every part of it renders identically and no part can be
// given its own presentation. Blocks fix that while staying editable.
//
// The content validators are closed (`additionalProperties: false`), so the
// field has to be declared before anything can write it. `sections` is NOT
// added to `required`: every existing record predates it, and demanding it
// would fail validation on the first update to any of them. An absent array
// and an empty one both mean "this record still uses its body".
func contentSectionsChange() Change {
	collections := exactContentSectionCollections()
	evolvesCollections := []string{"pages", "portfolio_items", "videos", "press_items", "testimonials"}
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name: contentSectionsChangeName,
		// Supersedes the revision change: this rewrites the same validators, and
		// without the declaration that change's verify re-checks a shape this one
		// has legitimately replaced, and every startup fails.
		Checksum:           Checksum(canonical + "|supersedes=" + contentRevisionChangeName + "|evolves=" + strings.Join(evolvesCollections, ",")),
		Supersedes:         []string{contentRevisionChangeName},
		EvolvesCollections: evolvesCollections,
		Apply: func(ctx context.Context, database *mongo.Database) error {
			return schema.Apply(ctx, database, collections)
		},
		Verify: func(ctx context.Context, database *mongo.Database) error {
			return schema.Verify(ctx, database, collections)
		},
	}
}

// exactContentSectionCollections is the current content shape plus `sections`.
//
// It derives from revisionContentCollections — the most recent change to define
// these validators — rather than from the original exactContentCollections.
// Deriving from the older one silently dropped `revision`, which the revision
// change had added, and `additionalProperties: false` then rejected every
// existing record on its next update. Always extend the latest shape, not the
// first one.
func exactContentSectionCollections() []schema.Collection {
	sectionItem := bson.M{
		"bsonType":             "object",
		"additionalProperties": false,
		"required":             bson.A{"label", "value"},
		"properties": bson.M{
			"label": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 120},
			"value": bson.M{"bsonType": "string", "maxLength": 120},
		},
	}
	section := bson.M{
		"bsonType":             "object",
		"additionalProperties": false,
		"required":             bson.A{"type"},
		"properties": bson.M{
			// Kept in step with content.SectionType. An unknown type is refused
			// here as well as in the domain, so a renderer never meets a block
			// it cannot draw.
			"type":      bson.M{"bsonType": "string", "enum": bson.A{"prose", "prose_image", "quote", "stats", "gallery"}},
			"heading":   bson.M{"bsonType": "string", "maxLength": 160},
			"body":      bson.M{"bsonType": "string", "maxLength": 20000},
			"asset_ids": bson.M{"bsonType": "array", "maxItems": 12, "items": schema.PublicIDField()},
			"items":     bson.M{"bsonType": "array", "maxItems": 12, "items": sectionItem},
			"flip":      schema.Field("bool"),
		},
	}
	sections := bson.M{"bsonType": "array", "maxItems": 40, "items": section}

	collections := revisionContentCollections()
	for index := range collections {
		validator, ok := collections[index].Validator["$jsonSchema"].(bson.M)
		if !ok {
			continue
		}
		properties, ok := validator["properties"].(bson.M)
		if !ok {
			continue
		}
		properties["sections"] = sections
	}
	return collections
}
