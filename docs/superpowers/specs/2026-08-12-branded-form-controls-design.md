# Branded form controls

Replace every remaining native form control in the admin and web apps with the
platform's own branded controls, and give the two lists that grow — video
categories and reading voices — a searchable picker instead of a scrolling
native menu.

## Problem

The platform already has a branded picker. `packages/shared/src/ui/select.tsx`
is a portal-rendered listbox with keyboard navigation and viewport-aware
placement, and it is used at fifteen call sites. `date-field.tsx` is used at
nine more. What remains is a scatter of native controls that never got
converted, so the same form can show a branded picker beside a raw browser
dropdown.

Two of those holdouts are worse than merely inconsistent:

- **Reading voice** (`page-guide.tsx`) lists the operating system's speech
  voices. macOS installs well over a hundred. A native `<select>` offers no way
  to find one except scrolling.
- **Video category** (`video-admin.tsx`) is a seeded taxonomy the admin can add
  to, so it grows with the catalogue. The editor picks from a `<select>` while
  the list rows below accept **free text**, so the same category can be created
  correctly in one place and typo'd into existence in the other.

Underneath all of this, nine UI components are byte-identical copies in both
`apps/web/components/ui/` and `packages/shared/src/ui/`, `select.tsx` among
them. Any new control added naively becomes a tenth duplicate, and any fix to
an existing one has to be made twice.

## Decisions

| Question | Decision |
| --- | --- |
| Scope | Every native control, not only the dropdowns |
| Duplication | Single implementation in `@joe-kuntani/shared`; the web copies are deleted |
| Unknown category | Offer inline create from the autocomplete |
| Checkbox and radio | Paint the native input with `appearance: none` |
| Delivery | One branch, a commit per stage, landing on `main` |

### Why the native input stays for checkbox and radio

`appearance: none` removes the browser's rendering entirely, so the control can
be painted to the brand with no compromise — gradient fill, custom tick, brand
focus ring. What it keeps is everything the browser already gets right: focus
handling, the space key, form participation, `:checked` and `:indeterminate`,
label association, and the accessibility tree. A `div` with `role="checkbox"`
would look identical and re-implement all of it by hand. The visual result is
the same; only the defect surface differs.

The dropdowns are the opposite case. A native `<select>` cannot be styled into
a branded popover and cannot host a search field, so there the custom widget is
the only way to get the design.

## Inventory

Counts are of source files, excluding `.next` build output.

| Control | Sites | Treatment |
| --- | --- | --- |
| `<select>` — Category | 1 | New `Combobox`, with inline create |
| `<select>` — Reading voice | 1 | New `Combobox`, search only |
| `<select>` — Visibility ×2, Section type, Text style | 4 | Existing `Select` |
| Category free-text on list rows | 1 | New `Combobox`, closing the typo hole |
| `type="checkbox"` | 19 | Branded `Checkbox` |
| `type="radio"` | 2 | Branded `Radio` |
| `type="file"` | 3 of 6 | New `FileInput`; 3 in `asset-picker` are already hidden behind styled labels and need no change |
| `type="date"` / `datetime-local"` | 4 | Existing `DateField` |
| Duplicated components | 9 | Re-export from shared, delete copies |

`markdown-field.tsx`'s "Text style" is not a value picker — it applies a heading
and resets itself to empty. It becomes a `Select` held at `value=""`, which
preserves that behaviour exactly.

## Components

### `Combobox` (new, shared)

A trigger button opens a popover containing a search field and a filtered
listbox — the command-palette shape, rather than an editable trigger. That keeps
the closed state visually identical to `Select`, so a form mixing the two reads
as one system.

```tsx
type ComboboxOption = { value: string; label: string; hint?: string };

type ComboboxProps = {
  options: readonly ComboboxOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;          // closed-state text when nothing is chosen
  searchPlaceholder?: string;
  emptyMessage?: string;         // shown when the filter matches nothing
  onCreate?: (label: string) => void | Promise<void>;  // presence enables create
  createPending?: boolean;
  disabled?: boolean;
  name?: string;                 // hidden input, for uncontrolled form posts
  id?: string;
  required?: boolean;
  className?: string;
  "aria-label"?: string;
};
```

Filtering is a case-insensitive substring match on `label`, which suits lists of
this size; no fuzzy ranking. When `onCreate` is supplied and the query matches
no option exactly, a final `Create "<query>"` row is appended to the list.

Keyboard: typing filters, `ArrowUp`/`ArrowDown` move the active option and skip
nothing, `Enter` commits the active row (including the create row), `Escape`
closes and restores focus to the trigger, `Home`/`End` jump. The active option
is tracked with `aria-activedescendant` so focus stays in the search field.

### Shared placement hook

`select.tsx` carries about fifty lines of careful viewport math — flip above or
below by available space, grow past the trigger width rather than clipping long
options, and pull left when the popover would overflow. `Combobox` needs exactly
this. Rather than copy it, extract it to `use-popover-placement.ts` and have both
components consume it. This is the one piece of existing code the work
restructures, and only because a second consumer now exists.

### `Checkbox` and `Radio` (new, shared)

Thin wrappers over the native input that guarantee consistent markup and label
association, with the visual work in CSS:

```tsx
<Checkbox checked={agreed} onChange={setAgreed}>
  Email me about shows and releases.
</Checkbox>
```

Painted with `appearance: none`, the brand gradient on `:checked`, a stroked
tick, `--focus` ring on `:focus-visible`, and `:disabled` at reduced opacity.
`Radio` is the same control with a dot and a full border radius. Both honour
`prefers-reduced-motion` by dropping the check transition.

### `FileInput` (new, shared)

A branded button (or drop target, where the current design already implies one)
wrapping a visually hidden native input — the pattern `asset-picker` already
uses successfully. It shows the chosen file name, an optional accept hint, and a
pending state. Applied to the two `media-library` inputs and the one in
`video-admin`.

## Consolidation

`apps/web/components/ui/` duplicates nine components byte for byte. Only three
of them — `select`, `date-field`, `empty-state` — are imported by web code at
all, across eight import lines in four files. The other three components
(`ai-assist`, `otp-input`, `content-incomplete-warning`) have no web consumer
whatsoever; they are dead copies kept alive only by sitting next to live ones.

So the copies are deleted outright rather than left as re-export shims: the
eight imports move to `@joe-kuntani/shared/ui/*`, and the duplicate files, their
stylesheets and their duplicated tests go. A shim would have kept a file per
component forever to save eight import lines.

The duplicated tests are removed rather than kept, because the shared package
already runs the same assertions against the same source. Components genuinely
local to web — `brand-splash`, `brand-watermark`, `button-link`,
`content-placeholder`, `demo-banner` — stay where they are.

## Category, end to end

`video-admin.tsx` currently derives `categories` as a `string[]` union of the
draft value, active category titles, and every category already used by a video.
The `Combobox` takes the same list as options. `onCreate` calls the existing
`createCategory()`, which already POSTs to `/api/admin/video-categories`, pushes
the result into state, selects it on the draft, and reports failure — so inline
create reuses that path rather than adding a second one.

The list-row free-text input is replaced by the same `Combobox` without
`onCreate`, so rows can only be assigned categories that exist. This is the
behavioural change in the work: it removes the ability to invent a category by
typing into a row. That is the point — it is the hole that lets the taxonomy
drift.

## Testing

The shared package already uses Vitest with Testing Library, and
`controls.test.tsx` establishes the pattern.

- `Combobox`: filters on typing, commits with `Enter`, offers the create row
  only when `onCreate` is set and no exact match exists, closes on `Escape`,
  reports the chosen value.
- `Checkbox` / `Radio`: toggle by click and by space, respect `disabled`, stay
  associated with their label.
- `FileInput`: surfaces the chosen file name and the pending state.
- Existing `Select` and `DateField` tests must keep passing after the placement
  hook is extracted — that extraction is behaviour-preserving and the tests are
  what prove it.

Each stage runs `pnpm typecheck`, `pnpm lint`, and the affected test suites; the
final stage runs a production build of both apps before landing.

## Sequence

One branch, one commit per stage, so the history stays reviewable:

1. Extract the placement hook; consolidate the nine duplicates into shared.
2. Build `Combobox`; migrate Category (with inline create), the list-row
   category, and Reading voice.
3. Migrate the four remaining native `<select>` to `Select`.
4. Build `Checkbox` and `Radio`; migrate 21 sites.
5. Build `FileInput`; migrate 3 sites; move the 4 date inputs to `DateField`.

Then fast-forward `main` and push once.

## Out of scope

- The 25 `<textarea>` elements. A textarea is styled by ordinary CSS and needs
  no replacement component.
- Redesigning any form's layout or copy. This work swaps controls; it does not
  rearrange the pages they sit on.
- The seeded category data itself, which is already live in production.
