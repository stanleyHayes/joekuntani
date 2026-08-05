# Joe Kuntani web design system

Status: provisional foundation. The palette, typography, photography, logo and
brand voice are not approved under ADR-005. Do not describe these tokens as the
final Joe Kuntani identity.

## Direction

The system is trust-first, media-led and informed by contemporary Accra's live
arts and independent poster culture. That influence appears through craft, not
borrowed symbols: compressed sans typography, syncopated type offsets, decisive
crop-like frames, a vivid red-orange accent and short physical interaction
cues. The energy is metropolitan and current while the content hierarchy stays
clear enough for an international audience.

This is intentionally not a kente or Adinkra simulation, a flag palette, a
heritage claim or a substitute for approved Ghanaian creative direction. It
creates a perceptibly Ghanaian-aware starting point without turning culture
into decoration. The accent and typographic treatment remain provisional under
ADR-005.

- One deep ink primary, one vivid red-orange accent and a compact neutral scale.
- Display typography uses a condensed system-sans stack; body and controls use
  a familiar system-sans stack. Approved fonts can replace these through the
  two font tokens without changing components.
- Panels use a 16px radius, controls use an 8px radius and buttons never rely on
  color alone for focus.
- Motion is limited to a short opening cadence and direct interaction feedback.
  Reduced-motion removes the reveal, smooth scrolling and transitions.
- Public pages use photography or video as their main visual. Until approved
  assets arrive, `ContentPlaceholder` makes the missing state explicit.

## Semantic tokens

Tokens live in `app/globals.css`; components consume semantic names rather than
literal colors.

| Family   | Tokens                                             | Purpose                             |
| -------- | -------------------------------------------------- | ----------------------------------- |
| Content  | `--ink`, `--ink-soft`                              | Primary and supporting text         |
| Surfaces | `--canvas`, `--surface`, `--surface-raised`        | Page and hierarchy                  |
| Action   | `--accent`, `--accent-strong`, `--accent-contrast` | Links and primary action            |
| Boundary | `--line`, `--focus`                                | Dividers and visible keyboard focus |
| Risk     | `--warning`, `--warning-surface`, `--warning-line` | Blocking content state              |
| Shape    | `--radius-control`, `--radius-panel`               | Consistent component geometry       |

Light and dark values follow the operating-system preference. Key text/action
pairings exceed WCAG AA contrast; forced-colors mode restores explicit system
borders.

## Contemporary Ghanaian rhythm

The public hero uses three recurring devices: offset headline lines, a cropped
three-beat accent rail and a framed media plane with an off-centre arc. Together
they create the quick visual cadence associated with current Accra event and
arts graphics without reproducing any traditional pattern. The content index
continues that cadence with alternating text alignment, and the admin shell
reduces it to a single accent rule so operational work remains calm.

Feature agents may reuse the offset, crop and three-beat devices sparingly.
They must not introduce additional accent hues, literal cultural motifs or
decorative motion that competes with approved photography and video.

## Layout contracts

`PublicShell` owns the skip link, primary/mobile navigation, footer navigation
and one context-specific footer CTA. Feature pages supply that CTA instead of
adding competing global actions.

`AdminShell` owns the administration landmark, responsive sidebar and visible
`ContentIncompleteWarning`. Admin feature screens supply their authorized
navigation and page content; server authorization remains mandatory.

At widths below 1152px public navigation collapses to a native `details`
control. Multi-column public layouts and the fixed admin sidebar collapse below
768px. The minimum supported viewport is 320px with no horizontal overflow.

## Accessibility rules

- Every route has one labelled `main` target and a first-focus skip link.
- Use native headings, links, navigation and disclosure controls before adding
  ARIA.
- Preserve `aria-current="page"` in both desktop and mobile navigation.
- Tap targets are at least 44px high; primary CTA labels remain on one line.
- Provide meaningful alt text for approved content images and `alt=""` only
  when an image is decorative.
- Do not communicate error, selection or status using color alone.
- Validate keyboard, screen-reader, dark mode, reduced motion, 200% zoom and
  320px overflow when adding a new shared component.

## Content safety

Never replace a placeholder with biography, roles, clients, testimonials,
metrics, pricing, contact details or media unless its approval record exists in
`docs/product/content-inventory.md`. Production must reject unresolved
placeholders; this foundation keeps them conspicuous for local and staging use.
