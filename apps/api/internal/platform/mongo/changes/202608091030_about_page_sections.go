package changes

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const aboutPageSectionsChangeName = "202608091030_about_page_sections"

const productionAboutPageID = "e7fe90ce-0dbc-4e23-a44d-8dba0a260c7e"
const aboutHeroPortraitID = "70f5fd04-def9-441d-8957-8b596b2ae85b"
const aboutFullPortraitID = "209a53d5-a8bf-4bcf-bf84-cf57572ceafa"

// aboutPageSectionsChange moves the approved production biography out of the
// legacy body field and into the typed blocks introduced by JK-030. It targets
// the known public record rather than every page named "about": demo and test
// records must not accidentally acquire production biography claims.
func aboutPageSectionsChange() Change {
	return Change{
		Name:     aboutPageSectionsChangeName,
		Checksum: Checksum(aboutPageSectionsChangeName + "|v3|seo-and-media-names|" + productionAboutPageID),
		Apply: func(ctx context.Context, database *mongo.Database) error {
			return migrateProductionAboutPage(ctx, database)
		},
		Verify: func(ctx context.Context, database *mongo.Database) error {
			return verifyProductionAboutPageSections(ctx, database)
		},
	}
}

func migrateProductionAboutPage(ctx context.Context, database *mongo.Database) error {
	sections := aboutPageSections()
	result, err := database.Collection("pages").UpdateOne(ctx, bson.M{
		"public_id": productionAboutPageID,
		"$or": bson.A{
			bson.M{"sections": bson.M{"$exists": false}},
			bson.M{"sections": bson.M{"$size": 0}},
		},
	}, bson.M{
		"$set": bson.M{
			"body":       "",
			"sections":   sections,
			"updated_at": time.Now().UTC(),
		},
		"$inc": bson.M{"revision": 1},
	})
	if err != nil {
		return fmt.Errorf("migrate production About page into sections: %w", err)
	}
	if result.MatchedCount == 0 {
		// A missing record is valid in new/local environments. An existing record
		// is also valid when it was already converted through the CMS.
		var existing bson.M
		err = database.Collection("pages").FindOne(ctx, bson.M{"public_id": productionAboutPageID}).Decode(&existing)
		if err != nil && err != mongo.ErrNoDocuments {
			return fmt.Errorf("inspect production About page: %w", err)
		}
	}
	if _, err = database.Collection("pages").UpdateOne(ctx,
		bson.M{"public_id": productionAboutPageID},
		bson.M{
			"$set": bson.M{
				"seo.title":         "Joe Kuntani | Ghanaian Guitar Comedian",
				"seo.description":   "Meet Joe Kuntani, the Ghanaian comedian and musician who blends live guitar, original songs and storytelling across stage, film and digital performance.",
				"seo.canonical_url": "https://www.joekuntani.com/about",
				"updated_at":        time.Now().UTC(),
			},
			"$inc": bson.M{"revision": 1},
		},
	); err != nil {
		return fmt.Errorf("update production About SEO: %w", err)
	}
	mediaNames := []struct {
		id, filename, alt string
	}{
		{
			id: aboutHeroPortraitID, filename: "joe-kuntani-guitar-comedian-close-up.jpg",
			alt: "Joe Kuntani holding an acoustic guitar in a black cowboy hat and bandana.",
		},
		{
			id: aboutFullPortraitID, filename: "joe-kuntani-guitar-comedian-full-portrait.jpg",
			alt: "Full-length portrait of Joe Kuntani carrying an acoustic guitar over his shoulder.",
		},
	}
	for _, media := range mediaNames {
		if _, err = database.Collection("media_assets").UpdateOne(ctx,
			bson.M{"public_id": media.id},
			bson.M{"$set": bson.M{
				"filename":   media.filename,
				"alt_text":   media.alt,
				"updated_at": time.Now().UTC(),
			}},
		); err != nil {
			return fmt.Errorf("rename About media %s: %w", media.id, err)
		}
	}
	return nil
}

func verifyProductionAboutPageSections(ctx context.Context, database *mongo.Database) error {
	var page struct {
		Body     string   `bson:"body"`
		Sections []bson.M `bson:"sections"`
	}
	err := database.Collection("pages").FindOne(ctx, bson.M{"public_id": productionAboutPageID}).Decode(&page)
	if err == mongo.ErrNoDocuments {
		return nil
	}
	if err != nil {
		return err
	}
	if page.Body != "" || len(page.Sections) != len(aboutPageSections()) {
		return fmt.Errorf("production About page still has legacy body or incomplete sections")
	}
	var seoPage struct {
		SEO struct {
			Title        string `bson:"title"`
			Description  string `bson:"description"`
			CanonicalURL string `bson:"canonical_url"`
		} `bson:"seo"`
	}
	if err = database.Collection("pages").FindOne(ctx, bson.M{"public_id": productionAboutPageID}).Decode(&seoPage); err != nil {
		return err
	}
	if seoPage.SEO.Title != "Joe Kuntani | Ghanaian Guitar Comedian" ||
		seoPage.SEO.CanonicalURL != "https://www.joekuntani.com/about" ||
		seoPage.SEO.Description == "" {
		return fmt.Errorf("production About SEO is incomplete")
	}
	expectedMedia := map[string]struct {
		filename, alt string
	}{
		aboutHeroPortraitID: {
			filename: "joe-kuntani-guitar-comedian-close-up.jpg",
			alt:      "Joe Kuntani holding an acoustic guitar in a black cowboy hat and bandana.",
		},
		aboutFullPortraitID: {
			filename: "joe-kuntani-guitar-comedian-full-portrait.jpg",
			alt:      "Full-length portrait of Joe Kuntani carrying an acoustic guitar over his shoulder.",
		},
	}
	for id, expected := range expectedMedia {
		var media struct {
			Filename string `bson:"filename"`
			AltText  string `bson:"alt_text"`
		}
		err = database.Collection("media_assets").FindOne(ctx, bson.M{"public_id": id}).Decode(&media)
		if err == mongo.ErrNoDocuments {
			continue
		}
		if err != nil {
			return err
		}
		if media.Filename != expected.filename || media.AltText != expected.alt {
			return fmt.Errorf("about media %s metadata is incomplete", id)
		}
	}
	return nil
}

func aboutPageSections() bson.A {
	emptyItems := bson.A{}
	emptyAssets := bson.A{}
	return bson.A{
		bson.M{
			"type": "prose", "heading": "The man behind the guitar",
			"body": `Joe Kuntani, born Robert Sarpong, is a Ghanaian comedian, musician, actor, filmmaker, creative director and entertainer. His ability to combine live guitar music with comedy has created a distinctive identity in Ghana's entertainment industry.

Known for his guitar, sharp sense of humour and storytelling, Joe turns ordinary situations into memorable comedy. He uses the guitar not only as a musical instrument, but as a tool for satire, social commentary and entertainment.

His artistic journey brings together comedy, music, acting, filmmaking, motion graphics and digital content creation. Rather than simply standing on stage and telling jokes, he lets the guitar become part of the joke.`,
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type": "prose", "heading": "A unique comedy style",
			"body": `What makes Joe different is his ability to transform everyday Ghanaian experiences into comedy. Relationships, marriage, family life, social expectations, money, work, friendship, culture and ordinary human behaviour can all become material for his performances.

His guitar becomes a storytelling partner: a simple chord progression can introduce a joke, a familiar Ghanaian melody can become a punchline, and a serious-looking song can suddenly turn into comedy.`,
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type":      "quote",
			"body":      "He doesn't just tell comedy — he plays it.",
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type": "prose", "heading": "Music and guitar",
			"body": `Joe's musical identity is strongly connected to the Ghanaian guitar tradition, particularly the spirit of highlife and palm-wine guitar music. He combines guitar playing, singing and comedy to create performances that connect with audiences in a uniquely Ghanaian way while remaining accessible internationally.

His music is available on digital platforms under the name Joe Kuntani. His catalogue includes works such as “Ene Wo Ne”, “Don Jazzy”, “8888” and “Wa No Asem”.`,
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type": "prose", "heading": "Beyond comedy",
			"body": `Joe is not limited to performing comedy. He has also worked as an actor, motion graphic designer, film director and editor, reflecting his wider involvement in Ghana's creative and digital media industry.

That combination of skills lets him understand entertainment from several perspectives — from performance and storytelling to visual production and digital content.`,
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type": "prose", "heading": "Ghana, France and the world",
			"body": `One significant part of Joe's creative journey is his connection with France and the Francophone cultural space. His professional creative profile lists France alongside Ghana among his countries of activity.

That connection is reflected in his association with Alliance Française Kumasi, an institution dedicated to French language, Francophone culture and cultural exchange. In 2024, he was announced as a comedian performing at Fête de la Musique, a celebration of live music and cultural exchange in Kumasi.

Joe takes something deeply Ghanaian — guitar, highlife, humour and everyday life — and carries it to a wider audience. His material can be specific in language and situation while still speaking to universal experiences of love, family, ambition, disappointment and human behaviour.`,
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type": "prose", "heading": "A digital creative entrepreneur",
			"body": `Social media is an important part of Joe's artistic career. Through short-form comedy, music, skits and creative storytelling, he continues to find new ways to connect with audiences online.

His work shows an understanding of modern entertainment: how to make people laugh, tell a story and leave an impression in a short space of time. His experience across performance, film production, editing, motion graphics and digital content gives him the foundation to move between stage, screen, music and visual concepts.`,
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type": "quote", "heading": "His vision",
			"body":      "Comedy can be musical, creative, intelligent and culturally meaningful. In Joe's hands, the guitar becomes a character, a storyteller and sometimes the voice of an entire situation.",
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type": "prose", "heading": "Numero Uno",
			"body": `With his guitar, comedy and unmistakable personality, Joe continues to build a brand around originality. He refuses to be placed into one box:

**Comedian. Guitarist. Musician. Actor. Filmmaker. Creative director. Digital creator. Storyteller.**

Above all, he is building a name around something uniquely his own: **the guitar comedian**.

From Kumasi to the international creative space, Robert Sarpong — popularly known as Joe Kuntani — continues to prove that a guitar can do more than make music. It can make people laugh.

*Ghana · France · Africa · The world*`,
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
	}
}
