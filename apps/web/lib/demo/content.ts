import type { ContentItem } from "../../components/content/types";
import type { PublicEvent } from "../../components/events/types";
import type { PublicService } from "../../components/services/types";

/**
 * Local/demo fixtures only. Copy is grounded in publicly reported positioning
 * (comedy + guitar “delivery musician” lane, live/corporate/wedding formats,
 * press mentions) but is NOT approved production inventory. Replace via CMS.
 */
export const DEMO_BANNER =
  "Demo preview — research-backed placeholders for layout only. Not approved production claims. Replace via CMS.";

/**
 * Demo fixtures are opt-in only. This used to fail open — an unset
 * NEXT_PUBLIC_DEMO_CONTENT fell through to an environment guess, so any build
 * whose NEXT_PUBLIC_APP_ENV was missing or misspelled served placeholder copy
 * as if it were approved production inventory. Absence of the flag now means
 * off, and nothing but an explicit opt-in turns it on.
 */
export function demoContentEnabled() {
  const flag = process.env.NEXT_PUBLIC_DEMO_CONTENT;
  return flag === "1" || flag === "true";
}

const stamp = "2026-08-06T00:00:00Z";

function item(
  partial: Pick<
    ContentItem,
    "id" | "kind" | "slug" | "title" | "summary" | "body" | "category" | "featured"
  > &
    Partial<ContentItem>,
): ContentItem {
  return {
    revision: 1,
    tags: ["demo", "research-backed", "cms-replace"],
    gallery_asset_ids: [],
    results: [],
    seo: {
      title: partial.title,
      description:
        partial.summary ||
        "Demo placeholder content awaiting CMS replacement.",
      canonical_url: "",
      social_image_asset_id: "",
    },
    status: "published",
    approved: false,
    published_at: stamp,
    created_at: stamp,
    updated_at: stamp,
    ...partial,
  };
}

export const demoImages = {
  hero: "/demo/hero-stage.png",
  workA: "/demo/work-lights.png",
  workB: "/demo/work-mic.png",
  workC: "/demo/work-crowd.png",
  workD: "/demo/work-set.png",
  videoA: "/demo/video-reel.png",
  videoB: "/demo/video-interview.png",
  pressA: "/demo/press-clip.png",
  pressB: "/demo/press-feature.png",
  about: "/demo/about-portrait.png",
  splash: "/demo/splash-stage.png",
} as const;

/** Cover art for demo ContentGrid cards — keyed by slug. */
export const demoCovers: Record<string, string> = {
  "delivery-musician-sets": demoImages.workA,
  "corporate-activations": demoImages.workB,
  "festivals-and-stages": demoImages.workC,
  "weddings-and-private": demoImages.workD,
  "guitar-comedy-reels": demoImages.videoA,
  "tour-conversations": demoImages.videoB,
  "owurachy-delivery-musician": demoImages.pressA,
  "svtv-france-tour": demoImages.pressB,
};

export const demoHome = item({
  id: "00000000-0000-4000-8000-000000000001",
  kind: "page",
  slug: "home",
  title: "Joe Kuntani",
  summary:
    "Ghanaian comedian and guitarist known publicly as Africa’s Delivery Musician — comedy, live music, and tailored messages for stages and rooms. Demo homepage; CMS owns the final claim set.",
  body: "This local demo surface sketches how a public home can introduce Joe’s comedy-with-guitar lane: custom “delivery” songs, audience interaction, and booking paths for corporate, festival, wedding, and campus rooms. Official biography, metrics, and client lists stay out until DISC-001 / ADR-005 approve them in the CMS.",
  category: "Demo",
  featured: true,
});

export const demoAbout = item({
  id: "00000000-0000-4000-8000-000000000002",
  kind: "page",
  slug: "about",
  title: "About Joe",
  summary:
    "Public profiles describe a Ghanaian entertainer who blends stand-up energy with acoustic guitar and original comedy songs — not a traditional single-lane comic or musician.",
  body: "Demo About copy for layout review. Public entertainment coverage has framed Joe Kuntani as a Ghanaian comedian-musician who delivers tailored messages through song — birthdays, weddings, relationship stories, social commentary, and brand rooms — with live guitar, spontaneous interaction, and digital skits across YouTube, TikTok, and Facebook. Education and tour details that appear in press (for example Accra Academy / Pentecost University mentions, or short international tour notes) must be re-verified in CMS before production publish. This paragraph is a demo stand-in, not an authorized biography.",
  category: "Demo",
  featured: false,
});

export const demoWork: ContentItem[] = [
  item({
    id: "00000000-0000-4000-8000-000000000011",
    kind: "portfolio",
    slug: "delivery-musician-sets",
    title: "Delivery musician sets",
    summary:
      "Custom comedy-song “deliveries” — announcements, tributes, and surprises shaped for the room. Demo case card only.",
    body: "Layout card for the trademark delivery-musician format described in public profiles: guitar, a clear message, and laughter. Replace with an approved CMS case study before launch — no client names or outcomes claimed here.",
    category: "Live delivery",
    featured: true,
  }),
  item({
    id: "00000000-0000-4000-8000-000000000012",
    kind: "portfolio",
    slug: "corporate-activations",
    title: "Corporate & brand rooms",
    summary:
      "Product launches, brand activations, and corporate functions that need interactive comedy with music. Demo layout only.",
    body: "Public profiles list corporate events, product launches, and brand campaigns among booking contexts. This card is for grid rhythm until CMS publishes an approved engagement write-up.",
    category: "Brand",
    featured: true,
  }),
  item({
    id: "00000000-0000-4000-8000-000000000013",
    kind: "portfolio",
    slug: "festivals-and-stages",
    title: "Festivals & concert stages",
    summary:
      "Festival and concert slots where guitar-led comedy meets a wider room. Demo atmosphere card.",
    body: "Press has noted festival and concert appearances (including shared bills such as Alliance Française programming in Kumasi). Use CMS to publish verified dates, venues, and media — not this demo stub.",
    category: "Festivals",
    featured: true,
  }),
  item({
    id: "00000000-0000-4000-8000-000000000014",
    kind: "portfolio",
    slug: "weddings-and-private",
    title: "Weddings & private celebrations",
    summary:
      "Family celebrations and private sessions that want a personal, melodic surprise. Demo card.",
    body: "Public positioning includes weddings and private family celebrations among formats. Replace with approved CMS stories; invent no guest lists or results here.",
    category: "Private",
    featured: false,
  }),
];

export const demoVideos: ContentItem[] = [
  item({
    id: "00000000-0000-4000-8000-000000000041",
    kind: "video",
    slug: "guitar-comedy-reels",
    title: "Guitar comedy reels",
    summary:
      "Digital skits and guitar-led comedy cuts of the kind audiences follow on YouTube, TikTok, and Facebook. Demo card — add verified URLs in CMS.",
    body: "Public coverage points fans to official social channels for skits and guitar humor. Keep external_url empty here until an approved source is linked in the CMS.",
    category: "Reels",
    featured: true,
    external_url: "",
  }),
  item({
    id: "00000000-0000-4000-8000-000000000042",
    kind: "video",
    slug: "tour-conversations",
    title: "Tour & interview cuts",
    summary:
      "Conversation and tour moments — including press notes about international dates. Demo layout only.",
    body: "Example: SVTV Africa coverage of a France tour appearance discussed on Daily Hustle Worldwide (2025). Link the verified clip from CMS when cleared; do not hardcode production embeds here.",
    category: "Conversations",
    featured: true,
    external_url: "",
  }),
];

export const demoPress: ContentItem[] = [
  item({
    id: "00000000-0000-4000-8000-000000000051",
    kind: "press",
    slug: "owurachy-delivery-musician",
    title: "Profile: comedy meets the guitar",
    summary:
      "Owurachy feature framing Joe as Africa’s Delivery Musician — humor, live music, and tailored messages.",
    body: "Demo press card pointing at public coverage. Confirm quote and asset rights in CMS before treating as production press.",
    category: "Features",
    featured: true,
    outlet: "Owurachy",
    external_url:
      "https://owurachy.com/joe-kuntani-the-ghanaian-comedian-redefining-entertainment-through-music/",
  }),
  item({
    id: "00000000-0000-4000-8000-000000000052",
    kind: "press",
    slug: "svtv-france-tour",
    title: "On tour conversations abroad",
    summary:
      "SVTV Africa interview coverage around a France tour and content-creation work abroad.",
    body: "Demo press card for stack density. Re-verify date, outlet framing, and republish rights in CMS.",
    category: "Interviews",
    featured: true,
    outlet: "SVTV Africa",
    external_url:
      "https://www.svtvafrica.com/2025/09/05/ill-return-to-ghana-i-cant-stay-here-with-the-kind-of-work-i-do-my-content-creation-job-brought-me-abroad/",
  }),
  item({
    id: "00000000-0000-4000-8000-000000000053",
    kind: "press",
    slug: "dailyguide-kumasi-bill",
    title: "Shared bill notes in Kumasi",
    summary:
      "DailyGuide Network note listing Joe among comedy acts for an Alliance Française Kumasi programme.",
    body: "Short press mention for demo layout. Confirm programme details and permissions before production.",
    category: "Mentions",
    featured: false,
    outlet: "DailyGuide Network",
    external_url:
      "https://dailyguidenetwork.com/alliance-francaise-to-hold-concert-in-kumasi/",
  }),
];

/** Demo “quotes” are layout-only paraphrases of public positioning — not client endorsements. */
export const demoTestimonials: ContentItem[] = [
  item({
    id: "00000000-0000-4000-8000-000000000021",
    kind: "testimonial",
    title: "Demo positioning note A",
    // Quote text only. Provenance and the not-approved warning live in
    // person_name/person_title/organization, which the section renders as the
    // attribution — keeping them out of the quotation itself.
    summary:
      "Where every message becomes music… and every performance becomes a memory.",
    body: "",
    category: "Demo",
    featured: true,
    person_name: "Public profile motto",
    person_title: "Demo layout — not a client quote",
    organization: "Replace via CMS",
  }),
  item({
    id: "00000000-0000-4000-8000-000000000022",
    kind: "testimonial",
    title: "Demo positioning note B",
    summary:
      "A lane between stand-up and conventional music: guitar, original comedy songs, and audience interaction.",
    body: "",
    category: "Demo",
    featured: true,
    person_name: "Coverage paraphrase",
    person_title: "Demo layout — not a client quote",
    organization: "Replace via CMS",
  }),
];

export const demoServices: PublicService[] = [
  {
    id: "00000000-0000-4000-8000-000000000031",
    name: "Live delivery set",
    slug: "live-delivery-set",
    summary:
      "On-stage comedy with guitar — custom messages, interaction, and room energy for festivals, campuses, and ticketed nights. Demo service for enquiry form review.",
    description:
      "Demo catalogue entry inspired by the publicly described delivery-musician format. Editors should retire this stub and publish approved services, pricing rules, and policies from admin. No fees or guarantees are stated here.",
    category: "Live stage",
    active: true,
    state: "active",
    version: 1,
    sort_order: 1,
    form_schema: {
      version: 1,
      questions: [
        {
          key: "event_format",
          label: "Event format",
          type: "select",
          required: true,
          options: [
            "Festival / concert",
            "Campus / community",
            "Private celebration",
            "Other",
          ],
        },
        {
          key: "preferred_date",
          label: "Preferred date",
          type: "date",
          required: false,
        },
        {
          key: "notes",
          label: "What should the set deliver?",
          type: "textarea",
          required: false,
        },
      ],
    },
    cta: { label: "Enquire about a live set", href: "/book" },
    created_at: stamp,
    updated_at: stamp,
  },
  {
    id: "00000000-0000-4000-8000-000000000032",
    name: "Corporate & brand activation",
    slug: "corporate-brand-activation",
    summary:
      "Interactive comedy-music for launches, brand rooms, and corporate programmes. Demo service only.",
    description:
      "Grounded in public mentions of corporate events, product launches, and brand campaigns. Replace with CMS-approved scope, run-of-show needs, and commercial terms.",
    category: "Brand",
    active: true,
    state: "active",
    version: 1,
    sort_order: 2,
    form_schema: {
      version: 1,
      questions: [
        {
          key: "activation_type",
          label: "Activation type",
          type: "select",
          required: true,
          options: [
            "Product launch",
            "Internal culture event",
            "Public brand experience",
            "Other",
          ],
        },
        {
          key: "audience_size",
          label: "Approximate audience size",
          type: "text",
          required: false,
        },
      ],
    },
    cta: { label: "Enquire for brands", href: "/book" },
    created_at: stamp,
    updated_at: stamp,
  },
  {
    id: "00000000-0000-4000-8000-000000000033",
    name: "Wedding & private celebration",
    slug: "wedding-private-celebration",
    summary:
      "Personal delivery songs and comedy for weddings and family celebrations. Demo enquiry path.",
    description:
      "Public positioning includes weddings and private celebrations. This demo service exists so the book flow has a third realistic option — retire when the approved catalogue ships.",
    category: "Private",
    active: true,
    state: "active",
    version: 1,
    sort_order: 3,
    form_schema: {
      version: 1,
      questions: [
        {
          key: "celebration_type",
          label: "Celebration type",
          type: "select",
          required: true,
          options: ["Wedding", "Birthday", "Family gathering", "Other"],
        },
        {
          key: "preferred_date",
          label: "Preferred date",
          type: "date",
          required: false,
        },
      ],
    },
    cta: { label: "Enquire for a private set", href: "/book" },
    created_at: stamp,
    updated_at: stamp,
  },
];

/**
 * Demo first-party events for layout / filter / ticket UI review.
 * Not on-sale inventory. Titles and venues are placeholders inspired by
 * Accra/Kumasi live-arts rooms — not confirmed Joe Kuntani dates.
 */
export const demoEvents: PublicEvent[] = [
  {
    id: "00000000-0000-4000-8000-000000000061",
    slug: "accra-delivery-night-demo",
    title: "Delivery Night — Accra (demo)",
    summary:
      "Demo ticketed comedy-with-guitar night for Accra rooms. Layout only until CMS publishes a real date.",
    description:
      "Placeholder first-party event so the public events list, filters, and ticket cards can be reviewed. Inspired by the publicly described delivery-musician live format — not a confirmed Joe Kuntani show. Replace via Events admin before marketing this date.",
    starts_at: "2026-09-20T19:00:00Z",
    ends_at: "2026-09-20T22:00:00Z",
    timezone: "Africa/Accra",
    banner_asset_id: "",
    venue: {
      name: "National Theatre environs (demo venue)",
      address: "South Liberation Link — demo address only",
      city: "Accra",
      country_code: "GH",
      map_url: "https://www.google.com/maps/search/?api=1&query=National+Theatre+Accra",
      accessibility: "Demo accessibility note — confirm step-free access in CMS.",
    },
    policies: {
      refunds:
        "Demo policy: refunds follow the published event terms once CMS replaces this stub.",
      entry: "Demo policy: doors open before start; ticket QR required at entry.",
      age_limit: 16,
      age_guidance: "Recommended 16+ for comedy language (demo guidance).",
      accessibility: "Contact the box office for access needs (demo copy).",
    },
    banner: {
      featured: true,
      starts_at: "2026-08-01T00:00:00Z",
      ends_at: "2026-09-20T19:00:00Z",
    },
    availability: "on_sale",
    tickets: [
      {
        id: "00000000-0000-4000-8000-000000000071",
        name: "General admission",
        description: "Standing / general floor — demo tier.",
        price: "80.00",
        currency: "GHS",
        capacity: 200,
        sold: 42,
        reserved: 8,
        min_per_order: 1,
        max_per_order: 4,
        sales_start: "2026-08-01T00:00:00Z",
        sales_end: "2026-09-20T18:00:00Z",
        availability: "on_sale",
        checkout_href:
          "/tickets/checkout?event=accra-delivery-night-demo&ticket=00000000-0000-4000-8000-000000000071",
      },
      {
        id: "00000000-0000-4000-8000-000000000072",
        name: "Early entry",
        description: "Earlier doors + closer floor access — demo tier.",
        price: "140.00",
        currency: "GHS",
        capacity: 40,
        sold: 18,
        reserved: 2,
        min_per_order: 1,
        max_per_order: 2,
        sales_start: "2026-08-01T00:00:00Z",
        sales_end: "2026-09-20T18:00:00Z",
        availability: "on_sale",
        checkout_href:
          "/tickets/checkout?event=accra-delivery-night-demo&ticket=00000000-0000-4000-8000-000000000072",
      },
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000062",
    slug: "kumasi-campus-session-demo",
    title: "Campus Session — Kumasi (demo)",
    summary:
      "Demo campus / community comedy-music session for Kumasi. Not a confirmed booking.",
    description:
      "Placeholder event for second-city filter coverage. Public press has mentioned Kumasi programme bills; this card does not claim that specific Alliance Française date — publish verified shows from admin.",
    starts_at: "2026-10-11T18:30:00Z",
    ends_at: "2026-10-11T21:00:00Z",
    timezone: "Africa/Accra",
    banner_asset_id: "",
    venue: {
      name: "Campus hall (demo venue)",
      address: "Demo campus address, Kumasi",
      city: "Kumasi",
      country_code: "GH",
      accessibility: "Demo — confirm access routes with the venue.",
    },
    policies: {
      refunds: "Demo refund copy — replace in CMS.",
      entry: "Demo entry: student ID may be requested at door.",
      age_limit: 16,
      age_guidance: "Campus-friendly demo guidance.",
    },
    banner: { featured: false },
    availability: "scheduled",
    tickets: [
      {
        id: "00000000-0000-4000-8000-000000000073",
        name: "Standard",
        description: "General campus ticket — demo.",
        price: "50.00",
        currency: "GHS",
        capacity: 300,
        sold: 0,
        reserved: 0,
        min_per_order: 1,
        max_per_order: 6,
        sales_start: "2026-09-01T00:00:00Z",
        sales_end: "2026-10-11T17:00:00Z",
        availability: "scheduled",
      },
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000063",
    slug: "private-brand-room-demo",
    title: "Brand Room Preview — Accra (demo)",
    summary:
      "Demo corporate / brand-room style listing for Accra. Shows sold-out and closed states in the UI.",
    description:
      "Placeholder past/sold-out listing so filters and ticket status labels can be reviewed. Not a real corporate booking.",
    starts_at: "2026-07-12T17:00:00Z",
    ends_at: "2026-07-12T19:30:00Z",
    timezone: "Africa/Accra",
    banner_asset_id: "",
    venue: {
      name: "Private brand venue (demo)",
      address: "Airport Residential Area — demo only",
      city: "Accra",
      country_code: "GH",
    },
    policies: {
      refunds: "Sales closed — demo past event.",
      entry: "Invite / ticket hold — demo.",
      age_limit: 18,
    },
    banner: { featured: false },
    availability: "sold_out",
    tickets: [
      {
        id: "00000000-0000-4000-8000-000000000074",
        name: "Guest pass",
        description: "Demo sold-out tier.",
        price: "0.00",
        currency: "GHS",
        capacity: 80,
        sold: 80,
        reserved: 0,
        min_per_order: 1,
        max_per_order: 1,
        sales_start: "2026-06-01T00:00:00Z",
        sales_end: "2026-07-12T12:00:00Z",
        availability: "sold_out",
      },
    ],
  },
];

export const demoEventCovers: Record<string, string> = {
  "accra-delivery-night-demo": demoImages.workC,
  "kumasi-campus-session-demo": demoImages.workA,
  "private-brand-room-demo": demoImages.workB,
};
