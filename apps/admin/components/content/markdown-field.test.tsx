import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MarkdownField } from "./markdown-field";

vi.mock("../../ui/ai-assist", () => ({
  AiAssist: () => null,
}));

function setup(value = "") {
  const onChange = vi.fn();
  render(<MarkdownField label="Body" value={value} onChange={onChange} />);
  return { onChange };
}

// The whole point: an editor could not tell whether their markdown was right
// until it was already published.
it("previews the body through the same renderer the site uses", () => {
  setup("## Heading\n\nJoe plays **guitar**.");
  fireEvent.click(screen.getByRole("tab", { name: "Preview" }));

  expect(
    screen.getByRole("heading", { level: 2, name: "Heading" }),
  ).toBeInTheDocument();
  expect(screen.getByText("guitar").tagName).toBe("STRONG");
  // The source must be gone from view, not merely styled differently.
  expect(screen.queryByText(/\*\*guitar\*\*/)).toBeNull();
});

it("wraps the selected text rather than appending at the end", () => {
  const { onChange } = setup("Joe plays guitar");
  const area = screen.getByRole("textbox");
  (area as HTMLTextAreaElement).setSelectionRange(10, 16);

  fireEvent.click(screen.getByRole("button", { name: "Bold" }));
  expect(onChange).toHaveBeenCalledWith("Joe plays **guitar**");
});

// With no selection the button has to leave something editable behind,
// otherwise it inserts empty syntax the editor then has to fill in blind.
it("inserts a placeholder when nothing is selected", () => {
  const { onChange } = setup("");
  fireEvent.click(screen.getByRole("button", { name: "Link" }));
  expect(onChange).toHaveBeenCalledWith("[link text](https://)");
});

it("offers the formatting an editor actually reaches for", () => {
  setup();
  for (const name of [
    "Bold",
    "Italic",
    "Link",
    "Bulleted list",
    "Numbered list",
    "Block quote",
    "Inline code",
    "Horizontal divider",
  ]) {
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  }
  expect(
    screen.getByRole("combobox", { name: "Text style" }),
  ).toBeInTheDocument();
});

it("says so when there is nothing to preview", () => {
  setup("   ");
  fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
  expect(screen.getByText("Nothing written yet.")).toBeInTheDocument();
});

// Write is the default: opening the editor should put the caret where the work
// happens, not in a read-only view.
it("opens on the writing view", () => {
  setup("body");
  expect(screen.getByRole("tab", { name: "Write" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByRole("textbox")).toHaveValue("body");
});

it("applies a heading from the text-style control", () => {
  const { onChange } = setup("Section title");
  const area = screen.getByRole("textbox") as HTMLTextAreaElement;
  area.setSelectionRange(0, area.value.length);
  fireEvent.change(screen.getByRole("combobox", { name: "Text style" }), {
    target: { value: "2" },
  });
  expect(onChange).toHaveBeenCalledWith("## Section title");
});
