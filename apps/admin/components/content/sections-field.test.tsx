import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { ContentSection } from "@joe-kuntani/shared/types/content";
import { SectionsField } from "./sections-field";

// The picker reaches for upload endpoints and a media list, none of which this
// field's own behaviour depends on.
vi.mock("../media/asset-picker", () => ({
  AssetUploadList: ({ label }: { label: string }) => <div>{label} picker</div>,
}));

const section = (over: Partial<ContentSection> = {}): ContentSection => ({
  type: "prose",
  heading: "",
  body: "",
  tags: [],
  asset_ids: [],
  items: [],
  flip: false,
  ...over,
});

it("invites the editor to add a section when the page is empty", () => {
  render(<SectionsField value={[]} onChange={vi.fn()} />);
  expect(
    screen.getByText("No sections yet. Add the first section below."),
  ).toBeVisible();
});

it("converts a legacy body into titled sections without rewriting its copy", () => {
  const onConvertLegacyBody = vi.fn();
  render(
    <SectionsField
      value={[]}
      legacyBody={
        "Opening paragraph.\n\nTHE MAN BEHIND THE GUITAR\n\nRobert grew up in Kumasi.\n\n## His vision\n\nComedy can be musical."
      }
      onChange={vi.fn()}
      onConvertLegacyBody={onConvertLegacyBody}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Convert body to sections" }),
  );
  expect(onConvertLegacyBody).toHaveBeenCalledWith([
    expect.objectContaining({
      heading: "Introduction",
      body: "Opening paragraph.",
    }),
    expect.objectContaining({
      heading: "The Man Behind The Guitar",
      body: "Robert grew up in Kumasi.",
    }),
    expect.objectContaining({
      heading: "His vision",
      body: "Comedy can be musical.",
    }),
  ]);
});

it("appends a text block and leaves the existing ones alone", () => {
  const onChange = vi.fn();
  render(
    <SectionsField
      value={[section({ heading: "First" })]}
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add section" }));

  const next = onChange.mock.calls[0][0] as ContentSection[];
  expect(next).toHaveLength(2);
  expect(next[0].heading).toBe("First");
  expect(next[1].type).toBe("prose");
});

// A collapsed row has to say what it holds, or reordering is guesswork.
it("labels a row by its heading, then its body, then its type", () => {
  // Asserted through the disclosure, which is the only button carrying
  // aria-expanded: the summary text also appears in the open textarea and in
  // the "Move …"/"Remove …" labels, so looser queries match several nodes.
  const summary = () => screen.getByRole("button", { expanded: true });

  const { rerender } = render(
    <SectionsField
      value={[section({ heading: "Roots" })]}
      onChange={vi.fn()}
    />,
  );
  expect(summary()).toHaveAccessibleName(/Roots/);

  rerender(
    <SectionsField
      value={[section({ body: "A long passage" })]}
      onChange={vi.fn()}
    />,
  );
  expect(summary()).toHaveAccessibleName(/A long passage/);

  rerender(<SectionsField value={[section()]} onChange={vi.fn()} />);
  expect(summary()).toHaveAccessibleName(/Text \(empty\)/);
});

// Swapping two array entries in place is easy to write as an assignment that
// clobbers one of them, which silently duplicates a block.
it("swaps two blocks when one is moved down", () => {
  const onChange = vi.fn();
  render(
    <SectionsField
      value={[section({ heading: "One" }), section({ heading: "Two" })]}
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Move One down" }));

  const next = onChange.mock.calls[0][0] as ContentSection[];
  expect(next.map((entry) => entry.heading)).toEqual(["Two", "One"]);
});

it("refuses to move the first block up or the last block down", () => {
  const onChange = vi.fn();
  render(
    <SectionsField
      value={[section({ heading: "One" }), section({ heading: "Two" })]}
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Move One up" }));
  fireEvent.click(screen.getByRole("button", { name: "Move Two down" }));
  expect(onChange).not.toHaveBeenCalled();
});

it("removes only the block asked for", () => {
  const onChange = vi.fn();
  render(
    <SectionsField
      value={[section({ heading: "Keep" }), section({ heading: "Drop" })]}
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove Drop" }));

  const next = onChange.mock.calls[0][0] as ContentSection[];
  expect(next.map((entry) => entry.heading)).toEqual(["Keep"]);
});

it("edits the heading and body of the open block", () => {
  const onChange = vi.fn();
  render(<SectionsField value={[section()]} onChange={onChange} />);

  fireEvent.change(screen.getByLabelText(/^Heading/), {
    target: { value: "Early years" },
  });
  expect((onChange.mock.calls[0][0] as ContentSection[])[0].heading).toBe(
    "Early years",
  );

  fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
    target: { value: "He started in Kumasi." },
  });
  expect((onChange.mock.calls[1][0] as ContentSection[])[0].body).toBe(
    "He started in Kumasi.",
  );
});

// Each type shows a different set of controls; showing the wrong ones is how an
// editor ends up filling a field the published page never reads.
it("shows only the controls the chosen type uses", () => {
  const { rerender } = render(
    <SectionsField value={[section({ type: "quote" })]} onChange={vi.fn()} />,
  );
  // A quote is the statement itself, so it has no separate heading.
  expect(screen.queryByLabelText(/^Heading/)).toBeNull();
  expect(screen.getByRole("textbox", { name: "Quote" })).toBeVisible();

  rerender(
    <SectionsField value={[section({ type: "stats" })]} onChange={vi.fn()} />,
  );
  // Figures are label/value pairs, so there is no prose body to write.
  expect(screen.queryByRole("textbox", { name: "Description" })).toBeNull();

  rerender(
    <SectionsField value={[section({ type: "gallery" })]} onChange={vi.fn()} />,
  );
  expect(screen.getByText("Images picker")).toBeVisible();

  rerender(
    <SectionsField
      value={[section({ type: "prose_image" })]}
      onChange={vi.fn()}
    />,
  );
  expect(screen.getByText("Image picker")).toBeVisible();
  expect(screen.getByLabelText("Put the image first")).toBeVisible();
});

// The blocks carry most of a page's prose, so the writing help has to be
// there and not only on the legacy single body field.
it.each([
  ["prose", "Description"],
  ["prose_image", "Description"],
  ["gallery", "Description"],
  ["quote", "Quote"],
] as const)("offers the assistant on a %s block", (type, label) => {
  render(<SectionsField value={[section({ type })]} onChange={vi.fn()} />);
  expect(
    screen.getByRole("group", { name: `AI writing help for ${label}` }),
  ).toBeVisible();
});

it("stores normalized tags on the individual section", () => {
  const onChange = vi.fn();
  render(<SectionsField value={[section()]} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText("Section tags"), {
    target: { value: "Comedy, Guitar, comedy" },
  });
  expect((onChange.mock.calls[0][0] as ContentSection[])[0].tags).toEqual([
    "comedy",
    "guitar",
  ]);
});

it("changes a block's type without discarding what is written", () => {
  const onChange = vi.fn();
  render(
    <SectionsField
      value={[section({ heading: "Kept", body: "Also kept" })]}
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Type" }));
  fireEvent.click(screen.getByRole("option", { name: "Quote" }));

  const next = (onChange.mock.calls[0][0] as ContentSection[])[0];
  expect(next.type).toBe("quote");
  expect(next.heading).toBe("Kept");
  expect(next.body).toBe("Also kept");
});

// A figures block with no rows would show nothing to type into, so one blank
// row stands in — and it has to behave like a real row, not a placeholder.
it("offers one blank figure row before any have been added", () => {
  const onChange = vi.fn();
  render(
    <SectionsField value={[section({ type: "stats" })]} onChange={onChange} />,
  );

  expect(screen.getByLabelText("Label 1")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Label 1"), {
    target: { value: "Shows" },
  });
  expect((onChange.mock.calls[0][0] as ContentSection[])[0].items).toEqual([
    { label: "Shows", value: "" },
  ]);
});

it("adds, edits and removes figure rows", () => {
  const onChange = vi.fn();
  const items = [
    { label: "Shows", value: "120" },
    { label: "Cities", value: "8" },
  ];
  render(
    <SectionsField
      value={[section({ type: "stats", items })]}
      onChange={onChange}
    />,
  );

  fireEvent.change(screen.getByLabelText("Value 2"), {
    target: { value: "9" },
  });
  expect((onChange.mock.calls[0][0] as ContentSection[])[0].items).toEqual([
    { label: "Shows", value: "120" },
    { label: "Cities", value: "9" },
  ]);

  fireEvent.click(screen.getByRole("button", { name: "Add figure" }));
  expect(
    ((onChange.mock.calls[1][0] as ContentSection[])[0].items ?? []).length,
  ).toBe(3);

  // Two rows, so the second Remove is the one belonging to "Cities".
  fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
  expect((onChange.mock.calls[2][0] as ContentSection[])[0].items).toEqual([
    { label: "Shows", value: "120" },
  ]);
});

it("flips a text-and-image block so the picture leads", () => {
  const onChange = vi.fn();
  render(
    <SectionsField
      value={[section({ type: "prose_image" })]}
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByLabelText("Put the image first"));
  expect((onChange.mock.calls[0][0] as ContentSection[])[0].flip).toBe(true);
});

// A dozen open blocks recreate the wall of text that blocks exist to break up.
it("opens one block at a time and can close it", () => {
  render(
    <SectionsField
      value={[section({ heading: "One" }), section({ heading: "Two" })]}
      onChange={vi.fn()}
    />,
  );
  const [first, second] = screen.getAllByRole("listitem");

  expect(within(first).getByLabelText(/^Heading/)).toBeVisible();
  expect(within(second).queryByLabelText(/^Heading/)).toBeNull();

  fireEvent.click(within(second).getByRole("button", { expanded: false }));
  expect(within(second).getByLabelText(/^Heading/)).toBeVisible();
  expect(within(first).queryByLabelText(/^Heading/)).toBeNull();
});
