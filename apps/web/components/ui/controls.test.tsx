import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { OTPInput } from "./otp-input";
import { Select } from "./select";

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
] as const;

describe("Select", () => {
  it("supports keyboard selection, placement, clearing and outside dismissal", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Select
        aria-label="Example select"
        defaultValue="b"
        name="example"
        onChange={onChange}
        options={options}
        placeholder="Any option"
      />,
    );
    const trigger = screen.getByRole("button", { name: "Example select" });
    trigger.getBoundingClientRect = () =>
      ({
        bottom: 580,
        height: 40,
        left: 24,
        right: 224,
        top: 540,
        width: 200,
        x: 24,
        y: 540,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const list = screen.getByRole("listbox");
    expect(list).toHaveFocus();
    fireEvent.keyDown(list, { key: "End" });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "ArrowUp" });
    fireEvent.keyDown(list, { key: "Home" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("a");
    expect(
      container.querySelector<HTMLInputElement>('input[name="example"]'),
    ).toHaveValue("a");

    fireEvent.click(trigger);
    fireEvent.mouseEnter(screen.getByRole("option", { name: "Any option" }));
    fireEvent.click(screen.getByRole("option", { name: "Any option" }));
    expect(onChange).toHaveBeenLastCalledWith("");

    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("honours controlled and disabled modes", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Select
        aria-label="Controlled select"
        value="a"
        onChange={onChange}
        options={options}
        required
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Controlled select" }));
    fireEvent.click(screen.getByRole("option", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith("b");
    expect(
      screen.getByRole("button", { name: "Controlled select" }),
    ).toHaveTextContent("Alpha");

    rerender(
      <Select
        aria-label="Controlled select"
        value="a"
        onChange={onChange}
        options={options}
        disabled
      />,
    );
    const disabled = screen.getByRole("button", { name: "Controlled select" });
    fireEvent.click(disabled);
    fireEvent.keyDown(disabled, { key: "Enter" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

function OTPHarness() {
  const [value, setValue] = useState("");
  return <OTPInput value={value} onChange={setValue} autoFocus />;
}

describe("OTPInput", () => {
  it("accepts digits, paste and bounded keyboard navigation", () => {
    const { container } = render(<OTPHarness />);
    const first = screen.getByLabelText("Digit 1 of 6");
    const second = screen.getByLabelText("Digit 2 of 6");
    fireEvent.change(first, { target: { value: "x7" } });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "ArrowLeft" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(second).toHaveFocus();

    fireEvent.paste(second, {
      clipboardData: { getData: () => "12a3456" },
    });
    expect(
      container.querySelector<HTMLInputElement>('input[name="code"]'),
    ).toHaveValue("123456");
    expect(
      screen.getByRole("group", { name: "Verification code" }),
    ).toHaveAttribute("data-complete", "true");
    fireEvent.keyDown(second, { key: "Backspace" });
    fireEvent.keyDown(second, { key: "Backspace" });
    fireEvent.paste(first, {
      clipboardData: { getData: () => "letters" },
    });
  });

  it("supports custom length and disabled cells", () => {
    render(
      <OTPInput
        aria-label="Short code"
        value="12"
        onChange={vi.fn()}
        length={4}
        disabled
      />,
    );
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
    expect(screen.getByLabelText("Digit 1 of 4")).toBeDisabled();
  });
});
