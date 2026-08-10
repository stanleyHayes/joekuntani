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
		Checksum: Checksum(aboutPageSectionsChangeName + "|v5|complete-sectioned-biography|" + productionAboutPageID),
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
			"type": "prose", "heading": "The guitar comedian",
			"tags": bson.A{"biography", "Ghana", "guitar comedian"},
			"body": `Joe Kuntani, born Robert Sarpong, is a Ghanaian comedian, musician, actor, filmmaker, creative director and entertainer whose unique ability to combine live guitar music with comedy has created a distinctive identity in Ghana's entertainment industry.

Known for his guitar, sharp sense of humour, storytelling and ability to turn ordinary situations into memorable comedy, Joe Kuntani has developed a style that is difficult to imitate. He is widely recognized for presenting comedy through music, using the guitar not only as a musical instrument but also as a powerful tool for storytelling, satire, social commentary and entertainment.`,
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type": "prose", "heading": "The man behind the guitar",
			"tags": bson.A{"Robert Sarpong", "Kumasi", "creative career"},
			"body": `Joe Kuntani's real name is Robert Sarpong, a creative from Kumasi, Ghana. His artistic journey brings together several disciplines: comedy, music, acting, filmmaking, motion graphics and digital content creation.

His versatility has allowed him to move beyond conventional stand-up comedy. Rather than simply standing on stage and telling jokes, Joe Kuntani often lets the guitar become part of the joke.

This combination has helped establish his identity as a guitar comedian and a performer who can entertain audiences through both music and humour.

Public creative-industry profiles identify Robert Sarpong professionally as Joe Kuntani and describe him as a music comedian, with Ghana and France listed among his countries of activity.`,
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type": "prose", "heading": "A unique comedy style",
			"tags": bson.A{"comedy", "storytelling", "Ghanaian culture"},
			"body": `What makes Joe Kuntani different is his ability to transform everyday Ghanaian experiences into comedy.

Relationships, marriage, family life, social expectations, money, work, friendship, culture and ordinary human behaviour can all become material for his performances.

His guitar becomes a storytelling partner.

- A simple chord progression can introduce a joke.
- A familiar Ghanaian melody can become a punchline.
- A serious-looking song can suddenly turn into comedy.`,
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type": "quote", "tags": bson.A{"performance", "guitar comedy"},
			"body":      "This is one of the qualities that makes Joe Kuntani's performances memorable: **he doesn't just tell comedy — he plays it.**",
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type": "prose", "heading": "Music and guitar",
			"tags": bson.A{"music", "highlife", "palm-wine guitar"},
			"body": `Joe Kuntani's musical identity is strongly connected to the Ghanaian guitar tradition, particularly the spirit of highlife and palm-wine guitar music.

He combines guitar playing, singing and comedy to create performances that connect with audiences in a uniquely Ghanaian way while remaining accessible to international audiences.

His musical work is also available through digital music platforms, where he is credited as Joe Kuntani. His catalogue includes works such as **“Ene Wo Ne”, “Don Jazzy”, “8888” and “Wa No Asem”.**`,
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type": "prose", "heading": "Beyond comedy",
			"tags": bson.A{"film", "acting", "creative direction"},
			"body": `Joe Kuntani is not limited to performing comedy.

He has also been identified professionally as a comedian, actor, motion graphic designer, film director and editor, demonstrating his wider involvement in Ghana's creative and digital media industry.

This combination of skills gives him the ability to understand entertainment from several perspectives — from performance and storytelling to visual production and digital content.`,
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type": "prose", "heading": "His connection with France",
			"tags": bson.A{"France", "Alliance Française Kumasi", "cultural exchange"},
			"body": `One of the significant aspects of Joe Kuntani's creative journey is his connection with France and the Francophone cultural space.

He has travelled to France and has developed an artistic relationship with the French cultural environment. His professional creative profile lists France alongside Ghana as countries of activity, demonstrating an international dimension to his work.

His connection with French culture is also reflected in his association with Alliance Française Kumasi, an institution dedicated to promoting French language, Francophone culture and cultural exchange between Ghana and the French-speaking world.

Joe Kuntani has participated in activities connected to Alliance Française Kumasi. In 2024, he was announced as a comedian performing at the Fête de la Musique, an event celebrating live music and cultural exchange in Kumasi.

This connection has helped strengthen his exposure to audiences and creative communities beyond Ghana.`,
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type": "prose", "heading": "Bridging Ghana and the world",
			"tags": bson.A{"Ghana", "international audience", "culture"},
			"body": `Joe Kuntani represents an interesting side of modern Ghanaian entertainment: an artist who can take something deeply Ghanaian — the guitar, highlife, humour and everyday Ghanaian life — and package it for a wider international audience.

His relationship with French-speaking cultural institutions and his experience in France demonstrate his interest in using entertainment as a bridge between cultures.

His comedy can be Ghanaian in its language, situations and humour while still communicating universal experiences such as love, relationships, family, ambition, disappointment and human behaviour.`,
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type": "prose", "heading": "Digital content creator",
			"tags": bson.A{"digital content", "social media", "creative storytelling"},
			"body": `Joe Kuntani has embraced social media as an important part of his artistic career.

Through short-form comedy, music, skits and creative storytelling, he continues to explore new ways of connecting with audiences online.

His content demonstrates an understanding of modern entertainment: the ability to create something quickly, make people laugh, tell a story and leave an impression within a short period of time.

He has also developed creative concepts around guitar-based comedy, including using music to deliver messages and create humorous situations.`,
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type": "prose", "heading": "A creative entrepreneur",
			"tags": bson.A{"entrepreneurship", "film production", "multidisciplinary"},
			"body": `Beyond being a performer, Joe Kuntani represents the growing generation of Ghanaian creative entrepreneurs who are building careers around multiple creative skills.

His experience in comedy, music, acting, film production, editing, motion graphics and digital content gives him a broad creative foundation.

This versatility means Joe Kuntani can perform on stage, create digital content, participate in film and television production, develop visual concepts and create music.`,
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type": "prose", "heading": "His vision",
			"tags": bson.A{"vision", "Ghanaian humour", "international collaboration"},
			"body": `Joe Kuntani's vision goes beyond simply making people laugh.

He seeks to demonstrate that comedy can be musical, creative, intelligent and culturally meaningful.

He wants the guitar to become more than an instrument for music. In his hands, it can become a character, a storyteller, a comedian and sometimes even the voice of an entire situation.

His work celebrates Ghanaian humour while opening the door to international collaboration.`,
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
		bson.M{
			"type": "prose", "heading": "Joe Kuntani — Numero Uno",
			"tags": bson.A{"Numero Uno", "brand", "the guitar comedian"},
			"body": `With his guitar, comedy and unmistakable personality, Joe Kuntani continues to build a brand around originality.

He is an entertainer who refuses to be placed into only one box.

**Comedian. Guitarist. Musician. Actor. Filmmaker. Creative director. Digital creator. Storyteller.**

But above all, Joe Kuntani is building a name around something uniquely his own:

## The guitar comedian

From Kumasi to the international creative space, Robert Sarpong — popularly known as Joe Kuntani — continues to prove that a guitar can do more than make music. It can make people laugh.

**And that is the sound of Joe Kuntani.**

*Ghana | France | Africa | The World*`,
			"asset_ids": emptyAssets, "items": emptyItems, "flip": false,
		},
	}
}
