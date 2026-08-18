package seed

import (
	"context"
	"crypto/rand"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Initial content for a fresh environment.
//
// Everything here is a starting point the owner edits in the admin dashboard —
// it is deliberately NOT a set of claims about Joe Kuntani. Only two categories
// of fact are asserted:
//
//   - Verifiable public record: the two press citations below link to published
//     articles, and the Facebook profile is the account those articles point to.
//   - The owner's own offering: service formats, page copy and calls to action,
//     which describe what is on sale rather than what has happened.
//
// No awards, venues, dates, testimonials, client names or performance history
// are invented. Contact details are obvious placeholders — publishing a phone
// number or address that does not exist would be worse than leaving it blank.
const initialContentSeedName = "202608071200_jk028_initial_content"

func initialContentSeed() Seed {
	return Seed{
		Name:     initialContentSeedName,
		Checksum: "jk028-initial-content-v6",
		Apply:    applyInitialContent,
	}
}

func applyInitialContent(ctx context.Context, database *mongo.Database) error {
	now := time.Now().UTC()
	owner, err := seedOwnerID(ctx, database)
	if err != nil {
		return err
	}
	if err = seedGlobalSettings(ctx, database, owner, now); err != nil {
		return err
	}
	if err = seedServices(ctx, database, now); err != nil {
		return err
	}
	return seedContentItems(ctx, database, now)
}

// seedOwnerID attributes the seeded records to the provisioned administrator so
// the audit trail has a real actor rather than a synthetic one.
func seedOwnerID(ctx context.Context, database *mongo.Database) (bson.ObjectID, error) {
	var user struct {
		ID bson.ObjectID `bson:"_id"`
	}
	err := database.Collection("users").FindOne(ctx, bson.M{"role": "administrator"}).Decode(&user)
	if err != nil {
		return bson.ObjectID{}, err
	}
	return user.ID, nil
}

func settingsValues() bson.M {
	return bson.M{
		"navigation": bson.A{
			bson.M{"label": "Work", "href": "/work"},
			bson.M{"label": "Services", "href": "/services"},
			bson.M{"label": "Events", "href": "/events"},
			bson.M{"label": "Videos", "href": "/videos"},
			bson.M{"label": "Press", "href": "/press"},
			bson.M{"label": "Gallery", "href": "/media/gallery"},
			bson.M{"label": "Shop", "href": "/shop"},
			bson.M{"label": "About", "href": "/about"},
		},
		"footer": bson.A{
			bson.M{"label": "Media kit", "href": "/media-kit"},
			bson.M{"label": "Contact", "href": "/contact"},
			bson.M{"label": "Privacy", "href": "/privacy"},
			bson.M{"label": "Terms", "href": "/terms"},
		},
		"ctas": bson.A{
			bson.M{
				"key":         "header",
				"title":       "Book a show",
				"description": "Start an enquiry for a date, a stage or a screen.",
				"label":       "Make an enquiry",
				"href":        "/book",
			},
			bson.M{
				"key":         "global",
				"title":       "Bring the set to your stage",
				"description": "Share the date, the room and the audience. You will get a written reply with availability and a fee range.",
				"label":       "Make an enquiry",
				"href":        "/book",
			},
		},
		// Live aliases on the joekuntani.com mailbox. `contact@` is the general
		// public address (contact page, footer, Person structured data);
		// `booking@` is the mailbox itself and takes the enquiry notifications.
		"contact": bson.M{
			"public_email": "contact@joekuntani.com",
			"phone":        "",
			"location":     "Accra, Ghana",
		},
		// Verified public profiles. Add or remove them in Settings → Contact
		// and social; the footer, contact page and Person structured data all
		// read from this one list.
		"social": bson.A{
			bson.M{"platform": "Instagram", "url": "https://www.instagram.com/joe_kuntani/"},
			bson.M{"platform": "TikTok", "url": "https://www.tiktok.com/@joekuntani_"},
			bson.M{"platform": "YouTube", "url": "https://www.youtube.com/c/joekuntani"},
			bson.M{"platform": "Facebook", "url": "https://www.facebook.com/joekuntanii/"},
		},
		"brand": bson.M{
			"name":             "Joe Kuntani",
			"tagline":          "Comedy and guitar, live.",
			"logo_asset_id":    "",
			"favicon_asset_id": "",
		},
		"seo": bson.M{
			"title_template":        "%s | Joe Kuntani",
			"default_title":         "Joe Kuntani",
			"description":           "Ghanaian music-comedian. Live comedy and guitar for stages, corporate rooms and private events.",
			"canonical_base":        "https://joekuntani.com",
			"social_image_asset_id": "",
		},
		"consent": bson.M{
			"version":         "2026-08-07",
			"privacy_label":   "I agree that my details may be used to respond to this enquiry, as described in the privacy notice.",
			"marketing_label": "Send me occasional updates about upcoming shows. Optional, and you can withdraw at any time.",
			"privacy_url":     "/privacy",
		},
		"integrations": bson.M{
			"email_provider":     "resend",
			"media_provider":     "cloudinary",
			"analytics_provider": "posthog",
			"payment_provider":   "paystack",
		},
		"team": bson.M{
			"notification_recipients": bson.A{},
			"business_timezone":       "Africa/Accra",
		},
	}
}

// seedGlobalSettings writes the same values to draft and published so the public
// site renders immediately, while the draft stays editable in the admin.
func seedGlobalSettings(ctx context.Context, database *mongo.Database, owner bson.ObjectID, now time.Time) error {
	values := settingsValues()
	_, err := database.Collection("global_settings").UpdateOne(ctx,
		bson.M{"key": "global"},
		bson.M{"$setOnInsert": bson.M{
			"key":              "global",
			"version":          int64(1),
			"draft":            values,
			"published":        values,
			"content_complete": true,
			"updated_by":       owner,
			"updated_at":       now,
			"published_at":     now,
		}},
		options.UpdateOne().SetUpsert(true))
	return err
}

type serviceSeed struct {
	name, slug, summary, description, category string
	order                                      int32
}

func seedServices(ctx context.Context, database *mongo.Database, now time.Time) error {
	services := []serviceSeed{
		{
			name:        "Live comedy set",
			slug:        "live-comedy-set",
			summary:     "A stand-up set built around comedy and guitar.",
			description: "A full live set for theatres, comedy nights and festival stages. Runs to the length you need, and the material is tailored to the room. Tell us the audience and the running order when you enquire.",
			category:    "Stage",
			order:       1,
		},
		{
			name:        "Corporate host and MC",
			slug:        "corporate-host-mc",
			summary:     "Hosting that keeps a corporate programme moving.",
			description: "Compering for conferences, launches, award nights and end-of-year gatherings. Includes linking segments, timekeeping and light custom material written around your brand and agenda.",
			category:    "Corporate",
			order:       2,
		},
		{
			name:        "Private and wedding events",
			slug:        "private-events",
			summary:     "A set shaped for a private celebration.",
			description: "Performance for weddings, birthdays and private parties, sized to the room and the moment. Content is agreed in advance so it fits the occasion and the guests.",
			category:    "Private",
			order:       3,
		},
		{
			name:        "Brand collaboration",
			slug:        "brand-collaboration",
			summary:     "Original comedy made with and for a brand.",
			description: "Sponsored sketches, campaign appearances and original material produced with a brand. Scope, usage rights and delivery dates are agreed in writing before work begins.",
			category:    "Brand",
			order:       4,
		},
	}

	for _, service := range services {
		id, err := seedUUID()
		if err != nil {
			return err
		}
		_, err = database.Collection("services").UpdateOne(ctx,
			bson.M{"slug": service.slug},
			bson.M{"$setOnInsert": bson.M{
				"public_id":   id,
				"name":        service.name,
				"slug":        service.slug,
				"summary":     service.summary,
				"description": service.description,
				"category":    service.category,
				"active":      true,
				"sort_order":  service.order,
				"form_schema": bson.M{"version": int32(1), "questions": bson.A{}},
				"cta":         bson.M{"label": "Make an enquiry", "href": "/book"},
				"version":     int64(1),
				"created_at":  now,
				"updated_at":  now,
			}},
			options.UpdateOne().SetUpsert(true))
		if err != nil {
			return err
		}
	}
	return nil
}

type contentSeed struct {
	collection  string
	kind        string
	slug        string
	title       string
	summary     string
	body        string
	category    string
	outlet      string
	externalURL string
	featured    bool
	// tags carry the markers the legal surface requires: legal-version:,
	// effective-date: and the full subject: set for the slug. Without every
	// one of them getLegalSurface refuses to publish the page.
	tags []string
}

func seedContentItems(ctx context.Context, database *mongo.Database, now time.Time) error {
	items := []contentSeed{
		{
			collection: "pages",
			kind:       "page",
			slug:       "about",
			title:      "About",
			summary:    "Joe Kuntani is a Ghanaian music-comedian who performs comedy with a guitar.",
			body:       "Joe Kuntani is a Ghanaian music-comedian. His work sits between stand-up and music: songs and sketches written to land a joke, performed live with a guitar.\n\nHe has released music alongside his comedy, including a single about Nigerian producer Don Jazzy, and has spoken publicly about taking his stage name from his junior high school headmaster.\n\nReplace this page with your own words in the admin dashboard — Content and media, then Pages.",
			category:   "about",
			featured:   true,
		},
		{
			collection: "pages",
			kind:       "page",
			slug:       "home",
			title:      "Joe Kuntani",
			summary:    "Ghanaian music-comedian. Comedy and guitar, live.",
			body:       "Comedy written to be played, not just told. Joe Kuntani performs stand-up with a guitar — songs, sketches and material built for the room he is standing in, whether that is a theatre, a corporate stage or a private celebration.\n\nEdit this in the admin dashboard under Content and media, then Pages, and choose the page with the slug \"home\".",
			featured:   true,
		},
		{
			collection: "pages",
			kind:       "page",
			slug:       "media-kit",
			title:      "Media kit",
			summary:    "Approved photography, biography and logo files for press and promoters.",
			body:       "Everything here is cleared for press and promoter use. Please use the approved biography and images as supplied, and credit photographers where a credit is listed.\n\nThe downloadable pack becomes available once an approved PDF is uploaded in the admin dashboard under Content and media. Until then, request assets through the contact page.",
			category:   "media-kit",
		},
		{
			collection: "pages",
			kind:       "page",
			slug:       "privacy",
			title:      "Privacy notice",
			summary:    "How enquiry and booking information is collected, used and retained.",
			body: "This notice explains what happens to the information you send through this site.\n\n" +
				"What is collected and why. When you submit an enquiry we collect your name, email address, any organisation you name and the details of your request. This is used to respond to you, to prepare a quote and to arrange a booking. Ticket purchases additionally involve payment details, which are handled by the payment provider and are never stored on this site.\n\n" +
				"Lawful basis. Enquiry and booking information is processed to take steps at your request before entering into a contract, and to perform that contract once agreed. Optional marketing updates are sent only with your consent, which you may withdraw at any time.\n\n" +
				"Retention. Enquiries that do not lead to a booking are kept only as long as needed to answer them and to keep a record of what was agreed. Booking and financial records are kept for as long as tax and accounting obligations require, then deleted.\n\n" +
				"Cookies. This site uses cookies that are necessary for it to function, including keeping staff signed in to the admin dashboard. Analytics are used to understand which pages are visited; they do not identify you personally.\n\n" +
				"Enquiries and third parties. Enquiry details are shared only with the people needed to answer them, and with the email, payment and hosting providers used to operate the site. They are not sold, and they are not used for unrelated marketing.\n\n" +
				"Your rights. You may ask for a copy of the information held about you, ask for it to be corrected or deleted, or object to how it is used. Requests are answered within a reasonable period.\n\n" +
				"Contact. Use the address published on the contact page for any privacy question or request.\n\n" +
				"This is a starting point written to be readable, not legal advice. Have it reviewed against your obligations before launch, then update the version and effective date in the admin dashboard.",
			tags: []string{
				"legal-version:1.0",
				"effective-date:2026-08-07",
				"subject:purposes-data-use",
				"subject:lawful-basis",
				"subject:retention",
				"subject:cookies",
				"subject:enquiries",
				"subject:data-subject-rights",
				"subject:contact",
			},
		},
		{
			collection: "pages",
			kind:       "page",
			slug:       "terms",
			title:      "Terms of use",
			summary:    "The terms that apply to using this site, its assets and its enquiry route.",
			body: "These terms apply to your use of this site.\n\n" +
				"Using this site. You may browse the site and use the enquiry route for genuine booking and press requests. Please do not attempt to disrupt the site, submit automated or misleading enquiries, or access areas reserved for staff.\n\n" +
				"Use of assets. Photographs, logos, video and written material on this site remain the property of their owners. Press and promoters may use the assets published in the media kit for coverage and promotion of booked performances, as supplied and with any listed credit. Any other reproduction, editing or commercial use needs written permission.\n\n" +
				"Bookings and enquiries. Submitting an enquiry is not a booking. A date is only held once it has been confirmed in writing, and any quoted fee, scope and cancellation terms are set out in that confirmation. Ticket sales are subject to the entry and refund policies published on the relevant event page.\n\n" +
				"Contact. Questions about these terms can be sent to the address published on the contact page.\n\n" +
				"This is a starting point written to be readable, not legal advice. Have it reviewed before launch, then update the version and effective date in the admin dashboard.",
			tags: []string{
				"legal-version:1.0",
				"effective-date:2026-08-07",
				"subject:site-use",
				"subject:asset-use",
				"subject:booking-disclaimer",
				"subject:contact",
			},
		},
		{
			collection:  "press_items",
			kind:        "press",
			slug:        "modernghana-don-jazzy",
			title:       "Joe Kuntani releases song about Nigeria's Don Jazzy",
			summary:     "ModernGhana reports on the release of a single addressed to Nigerian producer Don Jazzy.",
			category:    "coverage",
			outlet:      "ModernGhana",
			externalURL: "https://www.modernghana.com/entertainment/73394/joe-kuntani-releases-song-about-nigerias-don-jazz.html",
		},
		{
			collection:  "press_items",
			kind:        "press",
			slug:        "3news-stage-name",
			title:       "I got my stage name from my JHS headmaster",
			summary:     "3News covers how Joe Kuntani got his stage name and began performing comedy.",
			category:    "interview",
			outlet:      "3News",
			externalURL: "https://3news.com/showbiz/i-got-my-stage-name-from-my-jhs-headmaster-joe-kuntani-recounts-how-his-journey-into-the-world-of-comedy-began/",
		},
	}

	for _, item := range items {
		id, err := seedUUID()
		if err != nil {
			return err
		}
		// Each content collection has its own validator with
		// additionalProperties:false, so the document is built per collection
		// rather than from one shared shape.
		document := bson.M{
			"public_id":         id,
			"title":             item.title,
			"summary":           item.summary,
			"body":              item.body,
			"tags":              seedTags(item.tags),
			"featured":          item.featured,
			"gallery_asset_ids": bson.A{},
			"seo": bson.M{
				"title":                 item.title,
				"description":           item.summary,
				"canonical_url":         "",
				"social_image_asset_id": "",
			},
			"status":   "published",
			"approved": true,
			"revision": int64(1),
			// Must be a date, not null: the public query filters on
			// publish_at $lte now, and MongoDB type-brackets comparisons, so a
			// null here silently hides the record from every public page.
			"publish_at":   now,
			"unpublish_at": nil,
			"published_at": now,
			"created_at":   now,
			"updated_at":   now,
		}
		switch item.collection {
		case "pages":
			document["slug"] = item.slug
		case "press_items":
			document["category"] = item.category
			document["outlet"] = item.outlet
			document["external_url"] = item.externalURL
		}

		filter := bson.M{"title": item.title}
		if item.collection == "pages" {
			filter = bson.M{"slug": item.slug}
		}
		if _, err = database.Collection(item.collection).UpdateOne(ctx,
			filter, bson.M{"$setOnInsert": document},
			options.UpdateOne().SetUpsert(true)); err != nil {
			return err
		}
	}
	return nil
}

func seedUUID() (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	buffer[6] = (buffer[6] & 0x0f) | 0x40
	buffer[8] = (buffer[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", buffer[:4], buffer[4:6], buffer[6:8], buffer[8:10], buffer[10:]), nil
}

func seedTags(values []string) bson.A {
	tags := bson.A{}
	for _, value := range values {
		tags = append(tags, value)
	}
	return tags
}
