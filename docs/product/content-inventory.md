# Content inventory and approval register

Status: discovery draft derived only from product specification v1.1  
Owner required: Joe Kuntani or an authorized business manager  
Last updated: 2026-08-05

## Rules

- `SPECIFIED` means the product specification requires the content type or behavior; it does **not** mean public copy or a factual claim has been approved.
- `SUPPLIED` means a source asset/copy file has been received but still needs named approval.
- `APPROVED` requires approver name, approval date, source location, and permitted use.
- `PLACEHOLDER` is allowed only in local/preview/staging and must be visibly labelled.
- `MISSING` blocks production publication of the affected claim or surface.
- Never infer or scrape personal details, claims, audience statistics, clients, pricing, photographs, or event information.

At this review, the repository contains only the build specification. Therefore every production content item below is `MISSING`; product structure and behavioral requirements are `SPECIFIED`.

## Brand and identity

| Item                             | Status    | Source                      | Approval evidence                   | Intended use / constraint                                                               |
| -------------------------------- | --------- | --------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| Public display name: Joe Kuntani | SPECIFIED | Product specification title | Product owner confirmation required | Global identity and metadata                                                            |
| Approved positioning statement   | MISSING   | -                           | -                                   | Hero, metadata, media kit; must not be invented                                         |
| Primary and alternate logos      | MISSING   | -                           | -                                   | SVG preferred; document clear-space and background rules                                |
| Brand palette                    | MISSING   | -                           | -                                   | Specification allows one dark primary, one accent, neutrals; final colors need approval |
| Brand typography                 | MISSING   | -                           | -                                   | License and web usage must be confirmed                                                 |
| Voice/tone guidance              | MISSING   | -                           | -                                   | Premium, playful, distinctly Ghanaian without stereotypes is direction, not final copy  |
| Favicon/social avatar            | MISSING   | -                           | -                                   | Derive only from approved identity assets                                               |

## Biography and professional claims

| Item                            | Status  | Required fields                                  | Approval evidence | Surfaces                                                                                              |
| ------------------------------- | ------- | ------------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------- |
| Short biography                 | MISSING | Approved text, version, approver, date           | -                 | Home, downloadable bio, media kit                                                                     |
| Long biography/origin story     | MISSING | Approved text and fact-check owner               | -                 | About                                                                                                 |
| Professional role labels        | MISSING | Exact permitted titles                           | -                 | Specification proposes comedian, host, performer, brand partner but owner must confirm public wording |
| Values and creative perspective | MISSING | Approved statements                              | -                 | About                                                                                                 |
| Career timeline                 | MISSING | Date, event/milestone, evidence, permitted media | -                 | About                                                                                                 |
| Achievements/awards             | MISSING | Exact title, issuer, year, source                | -                 | About, media kit                                                                                      |
| Downloadable biography file     | MISSING | Approved PDF/DOC and version date                | -                 | About/media kit                                                                                       |

## Photography and visual media

| Item                      | Status  | Required metadata                               | Rights requirement                 | Intended use            |
| ------------------------- | ------- | ----------------------------------------------- | ---------------------------------- | ----------------------- |
| Hero portrait/film        | MISSING | Creator, capture date, alt text, focal point    | Web, marketing, crops and duration | Home                    |
| Professional portrait set | MISSING | Photographer, alt text, orientation, resolution | Download/publication permission    | About, press, media kit |
| Performance photography   | MISSING | Event/date/photographer/caption                 | Web and promotional rights         | Work/services/events    |
| Behind-the-scenes imagery | MISSING | Context/caption/alt text                        | Subject releases where needed      | Case studies            |
| Approved press assets     | MISSING | Title, format, dimensions, version              | Explicit media-download terms      | Press/media kit         |

## Services and commercial enquiry content

| Item                     | Status                   | Required content                                              | Notes                                                     |
| ------------------------ | ------------------------ | ------------------------------------------------------------- | --------------------------------------------------------- |
| Brand campaigns          | SPECIFIED / MISSING COPY | Name, summary, detailed scope, lead time, CTA, form questions | No pricing assumed                                        |
| Event hosting / MC       | SPECIFIED / MISSING COPY | Scope, event fit, requirements, CTA, form questions           | Confirm preferred public label                            |
| Comedy performance       | SPECIFIED / MISSING COPY | Scope, duration options, production needs, CTA                | No availability promise                                   |
| Appearances              | SPECIFIED / MISSING COPY | Scope, boundaries, CTA, questions                             | Confirm usage restrictions                                |
| Content production       | SPECIFIED / MISSING COPY | Formats, process, rights, CTA                                 | Confirm deliverables                                      |
| Custom partnerships      | SPECIFIED / MISSING COPY | Qualification copy and CTA                                    | No implied acceptance                                     |
| Budget ranges/currencies | MISSING                  | Approved bands and currencies                                 | Forms cannot ship to production without business decision |
| Booking acknowledgement  | SPECIFIED / MISSING COPY | Response expectation, support route, disclaimer               | Must state submission is not confirmation                 |

## Portfolio, partners, testimonials, and results

| Item                     | Status  | Required record                                                                              | Publication control                    |
| ------------------------ | ------- | -------------------------------------------------------------------------------------------- | -------------------------------------- |
| Portfolio case studies   | MISSING | Client/event, problem, Joe's role, concept, deliverables, media, results, testimonial, dates | Client/subject approval and rights     |
| Partner/client logos     | MISSING | Vector/raster asset, official name, engagement link                                          | Written permission and display context |
| Testimonials             | MISSING | Exact quote, person, title, organization, approval date                                      | Quote and attribution approval         |
| Campaign metrics/results | MISSING | Metric definition, value, period, source, last-updated date                                  | Claim substantiation and approval      |
| Related-work links       | MISSING | Approved relationships/order                                                                 | CMS-managed                            |

## Videos, press, and external embeds

| Item                      | Status  | Required metadata                                                  | Constraint                            |
| ------------------------- | ------- | ------------------------------------------------------------------ | ------------------------------------- |
| YouTube videos            | MISSING | Approved URL/embed, title, category, poster, caption, publish date | External embed only; no large uploads |
| TikTok videos             | MISSING | Approved URL/embed and fallback poster/link                        | Respect platform behavior/rights      |
| Instagram videos          | MISSING | Approved URL/embed and fallback poster/link                        | Respect platform behavior/rights      |
| Press articles/interviews | MISSING | Outlet, title, type, date, approved excerpt, URL, image rights     | Attribute source accurately           |
| Podcast appearances       | MISSING | Show, episode, date, URL, artwork rights                           | External link/embed                   |
| TV/radio appearances      | MISSING | Program, outlet, date, clip/link permission                        | Do not imply outlet endorsement       |

## Audience metrics and media kit

| Item                      | Status  | Required fields                                                                            | Constraint                           |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------ | ------------------------------------ |
| Platform audience metrics | MISSING | Platform, followers/reach/impressions/engagement, definition, period, source, last updated | Publish only after approval          |
| Audience demographics     | MISSING | Dimension, segments, period, source                                                        | Privacy-safe aggregates only         |
| Media kit web copy        | MISSING | Approved narrative, offerings, claims, contact route                                       | CMS-managed                          |
| Media kit PDF             | MISSING | Approved version, issue date, public/private classification                                | Admin-uploaded; secure if not public |

## Global contact, navigation, and calls to action

| Item                              | Status  | Required values                                                                                     | Safety requirement                                                |
| --------------------------------- | ------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Approved business email           | MISSING | Address, display label, routing owner                                                               | Never expose private personal email                               |
| Public phone/WhatsApp             | MISSING | Explicitly approved number and contexts                                                             | Never infer or expose private number                              |
| Business/postal address           | MISSING | Exact approved public wording                                                                       | Never expose personal address                                     |
| Support contact                   | MISSING | Ticket-order support email/process                                                                  | Required before ticket sales                                      |
| Transactional email sender/domain | MISSING | Approved from-name/address, verified domain owner, per-environment routing, SPF/DKIM/DMARC evidence | Required before production email                                  |
| Internal notification recipients  | MISSING | Recipient set by enquiry/event type and environment, routing owner, escalation and delivery test    | Staging and production recipients must never be shared implicitly |
| Social links                      | MISSING | Official URL, handle, label                                                                         | Owner verification required                                       |
| Primary CTA labels                | MISSING | Page/context/label/destination                                                                      | Every public page needs one contextual CTA                        |
| Navigation/footer order           | MISSING | Approved labels/order/legal links                                                                   | Editable in CMS                                                   |

## Legal, privacy, accessibility, and asset-use copy

| Item                          | Status  | Required content                                                                                  | Review                         |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------- | ------------------------------ |
| Privacy notice                | MISSING | Purposes, lawful handling, retention, cookies, enquiry processing, contact mechanism, data rights | Qualified legal/privacy review |
| Website terms                 | MISSING | Site use, asset restrictions, booking disclaimer                                                  | Qualified legal review         |
| Enquiry consent text/version  | MISSING | Required privacy consent and optional marketing consent                                           | Legal/privacy approval         |
| Cookie/analytics notice       | MISSING | Tools, categories, choices, retention                                                             | Legal/privacy approval         |
| Media asset-use terms         | MISSING | Permitted press/download use and attribution                                                      | Rights owner/legal approval    |
| Accessibility contact/process | MISSING | Contact route and response process                                                                | Business owner approval        |

## Events and ticketing

| Item                       | Status  | Required fields                                                                                                                           | Publication/payment gate              |
| -------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Event records              | MISSING | Approved title, slug, summary/body, banner, venue/address/city/country/timezone, schedule/doors, age/accessibility, capacity, sale window | Required per event                    |
| Event organizer terms      | MISSING | Organizer identity and approved terms                                                                                                     | Legal/business approval               |
| Refund/cancellation policy | MISSING | Exact policy, effective date, exceptional handling                                                                                        | Legal/business and provider alignment |
| Ticket types               | MISSING | Name, description, Decimal128 price, currency, quantities, per-order limits, sale window                                                  | Authorized manager approval           |
| Fees/tax disclosure        | MISSING | Components, payer, calculation, display copy                                                                                              | Finance/legal/provider confirmation   |
| Payment methods/provider   | MISSING | Provider, Ghana methods, settlement/reconciliation owner                                                                                  | ADR-004; blocks production checkout   |
| Ticket email copy          | MISSING | Confirmation, delivery, failure, reminder, cancellation, refund templates                                                                 | Support/legal approval                |
| Check-in operator guidance | MISSING | Roles, device guidance, manual override/escalation                                                                                        | Operations approval/training          |

## Approval record template

Every approved content batch must append a record; links should point to versioned repository/import artifacts or a controlled asset source.

| Batch ID | Items | Approver name/authority | Approved at | Source/version | Permitted channels | Expiry/review date |
| -------- | ----- | ----------------------- | ----------- | -------------- | ------------------ | ------------------ |
| _none_   | -     | -                       | -           | -              | -                  | -                  |

## Production content gate

Production seeding/import must fail or leave affected content unpublished when required records lack `APPROVED` evidence. The application must warn administrators about incomplete content, but must never turn sample data into public claims automatically.
