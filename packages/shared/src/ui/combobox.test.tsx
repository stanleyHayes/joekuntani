import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Combobox, type ComboboxOption } from "./combobox";

const options: readonly ComboboxOption[] = [
  { value: "comedy", label: "Comedy" },
  { value: "music", label: "Music" },
  { value: "acting-film", label: "Acting & Film" },
] as const;

// jsdom gives every element a zero rect, and the placement hook needs a real
// one to decide the popover fits anywhere at all.
function stubRect(element: HTMLElement) {
  element.getBoundingClientRect = () =>
    ({
      bottom: 300,
      height: 40,
      left: 24,
      right: 224,
      top: 260,
      width: 200,
      x: 24,
      y: 260,
      toJSON: () => ({}),
    }) as DOMRect;
}

function openWith(name = "Category") {
  const trigger = screen.getByRole("button", { name });
  stubRect(trigger);
  fireEvent.click(trigger);
  return trigger;
}

describe("Combobox", () => {
  it("filters options as the query is typed", () => {
    render(<Combobox aria-label="Category" options={options} />);
    openWith();

    expect(screen.getAllByRole("option")).toHaveLength(3);

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "mus" },
    });

    const remaining = screen.getAllByRole("option");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveTextContent("Music");
  });

  it("matches without regard to case or position in the label", () => {
    render(<Combobox aria-label="Category" options={options} />);
    openWith();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "FILM" },
    });

    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent("Acting & Film");
  });

  it("reports the chosen value and closes", () => {
    const onChange = vi.fn();
    render(
      <Combobox aria-label="Category" options={options} onChange={onChange} />,
    );
    openWith();

    fireEvent.click(screen.getByRole("option", { name: "Music" }));

    expect(onChange).toHaveBeenCalledWith("music");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("commits the active row with the keyboard", () => {
    const onChange = vi.fn();
    render(
      <Combobox aria-label="Category" options={options} onChange={onChange} />,
    );
    openWith();

    const search = screen.getByRole("combobox");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("music");
  });

  it("closes on Escape without choosing anything", () => {
    const onChange = vi.fn();
    render(
      <Combobox aria-label="Category" options={options} onChange={onChange} />,
    );
    openWith();

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the chosen label on the closed trigger", () => {
    function Harness() {
      const [value, setValue] = useState("");
      return (
        <Combobox
          aria-label="Category"
          options={options}
          value={value}
          onChange={setValue}
          placeholder="Select a category"
        />
      );
    }
    render(<Harness />);

    expect(screen.getByRole("button")).toHaveTextContent("Select a category");
    openWith();
    fireEvent.click(screen.getByRole("option", { name: "Comedy" }));
    expect(screen.getByRole("button")).toHaveTextContent("Comedy");
  });

  it("reports nothing matching rather than showing an empty list", () => {
    render(<Combobox aria-label="Category" options={options} />);
    openWith();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "zzz" },
    });

    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("Nothing matches that.")).toBeInTheDocument();
  });

  describe("inline create", () => {
    it("is absent when no onCreate is given", () => {
      render(<Combobox aria-label="Category" options={options} />);
      openWith();

      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "Poetry" },
      });

      expect(screen.queryByText(/^Create/)).not.toBeInTheDocument();
    });

    it("offers to create a name that does not exist", () => {
      const onCreate = vi.fn();
      render(
        <Combobox
          aria-label="Category"
          options={options}
          onCreate={onCreate}
        />,
      );
      openWith();

      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "Poetry" },
      });
      fireEvent.click(screen.getByText("Create “Poetry”"));

      expect(onCreate).toHaveBeenCalledWith("Poetry");
    });

    // The whole point of the taxonomy is that "Comedy" exists once.
    it("does not offer to create a name that already exists", () => {
      render(
        <Combobox aria-label="Category" options={options} onCreate={vi.fn()} />,
      );
      openWith();

      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "comedy" },
      });

      expect(screen.queryByText(/^Create/)).not.toBeInTheDocument();
      expect(screen.getByRole("option")).toHaveTextContent("Comedy");
    });

    it("ignores surrounding space when deciding a name is new", () => {
      render(
        <Combobox aria-label="Category" options={options} onCreate={vi.fn()} />,
      );
      openWith();

      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "  Comedy  " },
      });

      expect(screen.queryByText(/^Create/)).not.toBeInTheDocument();
    });

    it("creates the trimmed name, not the typed whitespace", () => {
      const onCreate = vi.fn();
      render(
        <Combobox
          aria-label="Category"
          options={options}
          onCreate={onCreate}
        />,
      );
      openWith();

      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "  Poetry  " },
      });
      fireEvent.click(screen.getByText("Create “Poetry”"));

      expect(onCreate).toHaveBeenCalledWith("Poetry");
    });

    it("reports progress and refuses a second submission while pending", () => {
      const onCreate = vi.fn();
      render(
        <Combobox
          aria-label="Category"
          options={options}
          onCreate={onCreate}
          createPending
        />,
      );
      openWith();

      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "Poetry" },
      });
      fireEvent.click(screen.getByText("Creating…"));

      expect(onCreate).not.toHaveBeenCalled();
    });
  });

  it("carries its value in a hidden input for form posts", () => {
    const { container } = render(
      <Combobox
        aria-label="Category"
        options={options}
        name="category"
        value="music"
      />,
    );

    expect(
      container.querySelector<HTMLInputElement>('input[name="category"]'),
    ).toHaveValue("music");
  });

  it("does not open when disabled", () => {
    render(<Combobox aria-label="Category" options={options} disabled />);
    const trigger = screen.getByRole("button", { name: "Category" });
    stubRect(trigger);
    fireEvent.click(trigger);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("dismisses on an outside press", () => {
    render(<Combobox aria-label="Category" options={options} />);
    openWith();
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows a hint beside the label when one is given", () => {
    render(
      <Combobox
        aria-label="Voice"
        options={[{ value: "sam", label: "Samantha", hint: "en-US" }]}
      />,
    );
    openWith("Voice");

    expect(screen.getByRole("option")).toHaveTextContent("en-US");
  });
});
