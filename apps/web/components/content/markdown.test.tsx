import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Markdown } from "./markdown";

// Bodies were dropped into a div with `white-space: pre-wrap`, so an editor
// writing `**bold**` published the asterisks.
it("parses markdown instead of printing its syntax", () => {
  const { container } = render(
    <Markdown>{"Joe plays **guitar** and _tells jokes_."}</Markdown>,
  );
  expect(container.querySelector("strong")).toHaveTextContent("guitar");
  expect(container.querySelector("em")).toHaveTextContent("tells jokes");
  expect(container.textContent).not.toContain("**");
  expect(container.textContent).not.toContain("_tells");
});

// The page owns its h1. A body that introduced a second one would leave the
// document with two top-level headings.
it("demotes a body h1 so the page keeps one h1", () => {
  render(<Markdown>{"# The man behind the guitar"}</Markdown>);
  expect(
    screen.getByRole("heading", { level: 2, name: "The man behind the guitar" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
});

// This is what makes it safe to render stored content without a sanitiser:
// react-markdown ignores embedded HTML unless rehype-raw is added.
it("renders embedded HTML as inert text rather than markup", () => {
  const { container } = render(
    <Markdown>{'<img src=x onerror="alert(1)"><script>alert(2)</script>'}</Markdown>,
  );
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("img")).toBeNull();
});

// GFM: tables and strikethrough are the two an editor is most likely to reach
// for, and neither works on stock CommonMark.
it("supports GitHub-flavoured tables and strikethrough", () => {
  const { container } = render(
    <Markdown>
      {"| Set | Length |\n| --- | --- |\n| Live | 45m |\n\n~~cancelled~~"}
    </Markdown>,
  );
  expect(container.querySelector("table")).toBeTruthy();
  expect(screen.getByRole("cell", { name: "45m" })).toBeInTheDocument();
  expect(container.querySelector("del")).toHaveTextContent("cancelled");
});

// External links open away from the site, so they must not hand the opener a
// writable window reference.
it("protects external links against reverse tabnabbing", () => {
  render(<Markdown>{"[press](https://example.com) and [work](/work)"}</Markdown>);
  const external = screen.getByRole("link", { name: "press" });
  expect(external).toHaveAttribute("target", "_blank");
  expect(external).toHaveAttribute("rel", expect.stringContaining("noopener"));
  // An internal link should stay in the tab.
  expect(screen.getByRole("link", { name: "work" })).not.toHaveAttribute(
    "target",
  );
});

// A draft with no body must render nothing rather than an empty bordered block.
it("renders nothing for an absent or blank body", () => {
  const { container: empty } = render(<Markdown>{""}</Markdown>);
  expect(empty).toBeEmptyDOMElement();
  const { container: blank } = render(<Markdown>{"   \n  "}</Markdown>);
  expect(blank).toBeEmptyDOMElement();
  const { container: missing } = render(<Markdown>{undefined}</Markdown>);
  expect(missing).toBeEmptyDOMElement();
});
