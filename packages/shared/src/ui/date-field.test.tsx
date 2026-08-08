import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DateField } from "./date-field";

// The component syncs its view month / time from the value inside a 0ms timer,
// so every test pins the clock and flushes that timer explicitly.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 2, 15, 9, 45, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

function settle() {
  act(() => {
    vi.advanceTimersByTime(1);
  });
}

function grid() {
  return within(screen.getByRole("dialog")).getByRole("grid");
}

function day(label: string) {
  return within(grid()).getByRole("button", { name: label });
}

function stubRect(element: HTMLElement, rect: Partial<DOMRect>) {
  element.getBoundingClientRect = () =>
    ({
      bottom: 0,
      height: 40,
      left: 0,
      right: 0,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      ...rect,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe("DateField in date mode", () => {
  it("shows the formatted value, marks today and the selection, then commits a picked day", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DateField
        aria-label="Event date"
        className="custom-field"
        id="event-date"
        name="event_date"
        defaultValue="2026-03-15"
        onChange={onChange}
      />,
    );
    settle();

    const trigger = screen.getByRole("button", { name: "Event date" });
    expect(trigger).toHaveAttribute("id", "event-date");
    expect(trigger).toHaveTextContent("15 Mar 2026");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(container.firstChild).toHaveClass("custom-field");

    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Event date" });
    expect(within(panel).getByText("March 2026")).toBeInTheDocument();
    // 15 March 2026 is both the selection and the stubbed "today".
    expect(day("15")).toHaveAttribute("data-selected", "true");
    expect(day("15")).toHaveAttribute("data-today", "true");
    expect(day("20")).toHaveAttribute("data-selected", "false");

    fireEvent.click(day("20"));
    expect(onChange).toHaveBeenCalledWith("2026-03-20");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveTextContent("20 Mar 2026");
    expect(
      container.querySelector<HTMLInputElement>('input[name="event_date"]'),
    ).toHaveValue("2026-03-20");
  });

  // Guards the month arrows: a broken shiftMonth would leave the grid on the
  // original month even though the header label moved (or vice versa).
  it("steps months with the arrows, rolls the year over, and picks from the new month", () => {
    const onChange = vi.fn();
    render(
      <DateField
        aria-label="Event date"
        defaultValue="2026-01-10"
        onChange={onChange}
      />,
    );
    settle();
    fireEvent.click(screen.getByRole("button", { name: "Event date" }));
    expect(screen.getByText("January 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("December 2025")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("February 2026")).toBeInTheDocument();

    fireEvent.click(day("18"));
    expect(onChange).toHaveBeenCalledWith("2026-02-18");
  });

  it("always renders six weeks and commits adjacent-month days as their own month", () => {
    const onChange = vi.fn();
    render(
      <DateField
        aria-label="Event date"
        defaultValue="2026-02-10"
        onChange={onChange}
      />,
    );
    settle();
    fireEvent.click(screen.getByRole("button", { name: "Event date" }));

    const cells = within(grid()).getAllByRole("button");
    expect(cells).toHaveLength(42);
    // February 2026 starts on a Sunday, so the grid leads with 26-31 January.
    expect(cells[0]).toHaveTextContent("26");
    expect(cells[0]).toHaveAttribute("data-in-month", "false");
    expect(cells[6]).toHaveAttribute("data-in-month", "true");

    // The trailing cell belongs to March; picking it must commit a March date.
    expect(cells[41]).toHaveAttribute("data-in-month", "false");
    fireEvent.click(cells[41]);
    expect(onChange).toHaveBeenCalledWith("2026-03-08");
  });

  it("clears the value and jumps to today from the footer", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DateField
        aria-label="Event date"
        name="event_date"
        required
        defaultValue="2026-03-20"
        onChange={onChange}
      />,
    );
    settle();
    const hidden = () =>
      container.querySelector<HTMLInputElement>('input[name="event_date"]');
    expect(hidden()).not.toHaveAttribute("required");

    const trigger = screen.getByRole("button", { name: "Event date" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveTextContent("Choose date");
    // The required flag has to come back once the value is cleared, otherwise a
    // cleared field would look satisfied to the surrounding form.
    expect(hidden()).toHaveAttribute("required");
    expect(hidden()).toHaveValue("");

    settle();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-03-15");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveTextContent("15 Mar 2026");
  });

  it("falls back to the placeholder when the value is not a parseable date", () => {
    render(<DateField aria-label="Event date" value="2026-3-5" />);
    settle();
    expect(screen.getByRole("button", { name: "Event date" })).toHaveTextContent(
      "Choose date",
    );
  });

  it("keeps a controlled field owned by its parent and follows the value it is given", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DateField
        aria-label="Event date"
        value="2026-03-15"
        onChange={onChange}
      />,
    );
    settle();
    const trigger = screen.getByRole("button", { name: "Event date" });
    fireEvent.click(trigger);
    fireEvent.click(day("22"));

    expect(onChange).toHaveBeenCalledWith("2026-03-22");
    // The parent never accepted the change, so the display must not move.
    expect(trigger).toHaveTextContent("15 Mar 2026");

    rerender(
      <DateField
        aria-label="Event date"
        value="2026-07-04"
        onChange={onChange}
      />,
    );
    settle();
    expect(trigger).toHaveTextContent("04 Jul 2026");
    fireEvent.click(trigger);
    expect(screen.getByText("July 2026")).toBeInTheDocument();
  });
});

describe("DateField in datetime mode", () => {
  it("keeps the panel open while the day and clamped time are edited", () => {
    const onChange = vi.fn();
    render(
      <DateField
        aria-label="Starts at"
        mode="datetime"
        defaultValue="2026-03-15T18:30"
        onChange={onChange}
      />,
    );
    settle();
    const trigger = screen.getByRole("button", { name: "Starts at" });
    expect(trigger).toHaveTextContent("15 Mar 2026 · 18:30");

    fireEvent.click(trigger);
    fireEvent.click(day("22"));
    // Picking a day in datetime mode must not dismiss the time inputs.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith("2026-03-22T18:30");
    settle();

    const hour = screen.getByLabelText("Hour");
    const minute = screen.getByLabelText("Minute");
    expect(hour).toHaveValue(18);
    expect(minute).toHaveValue(30);

    fireEvent.change(hour, { target: { value: "99" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-03-22T23:30");
    settle();

    fireEvent.change(minute, { target: { value: "77" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-03-22T23:59");
    settle();

    // A cleared or negative entry must fall back to zero, never to NaN.
    fireEvent.change(hour, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-03-22T00:59");
    settle();

    fireEvent.change(minute, { target: { value: "-4" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-03-22T00:00");
    settle();
    expect(trigger).toHaveTextContent("22 Mar 2026 · 00:00");
  });

  it("stamps the current time when Today is used and rejects a date-only value", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DateField aria-label="Starts at" mode="datetime" onChange={onChange} />,
    );
    settle();
    const trigger = screen.getByRole("button", { name: "Starts at" });
    expect(trigger).toHaveTextContent("Choose date and time");

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-03-15T09:45");
    expect(screen.queryByRole("dialog")).toBeNull();

    // A date-only string cannot satisfy datetime mode and must not render as a
    // half-parsed value.
    rerender(
      <DateField
        aria-label="Starts at"
        mode="datetime"
        value="2026-03-15"
        onChange={onChange}
      />,
    );
    settle();
    expect(trigger).toHaveTextContent("Choose date and time");
  });

  it("edits the time from an empty value using the current date as the base", () => {
    const onChange = vi.fn();
    render(
      <DateField aria-label="Starts at" mode="datetime" onChange={onChange} />,
    );
    settle();
    fireEvent.click(screen.getByRole("button", { name: "Starts at" }));
    fireEvent.change(screen.getByLabelText("Hour"), { target: { value: "7" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-03-15T07:45");
  });
});

describe("DateField interaction guards", () => {
  it("opens from the keyboard, ignores unrelated keys, and dismisses on Escape or an outside click", () => {
    render(<DateField defaultValue="" />);
    settle();
    const trigger = screen.getByRole("button", { name: "Choose date" });

    fireEvent.keyDown(trigger, { key: "Tab" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("dialog", { name: "Choose a date" })).toBeVisible();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.keyDown(trigger, { key: "Enter" });
    const panel = screen.getByRole("dialog");
    // Pointer activity inside the panel or on the trigger must not close it.
    fireEvent.mouseDown(panel);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.mouseDown(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "a" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.keyDown(trigger, { key: " " });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("never opens while disabled", () => {
    render(
      <DateField aria-label="Locked date" defaultValue="2026-03-15" disabled />,
    );
    settle();
    const trigger = screen.getByRole("button", { name: "Locked date" });
    expect(trigger).toBeDisabled();

    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // Guards the flip-up/clamp logic: without it the panel renders off-screen for
  // triggers near the bottom or the right edge of the viewport.
  it("flips the panel above the trigger and clamps it inside the viewport", () => {
    render(<DateField aria-label="Event date" defaultValue="2026-03-15" />);
    settle();
    const trigger = screen.getByRole("button", { name: "Event date" });
    stubRect(trigger, { top: 700, bottom: 740, left: 2000, right: 2200 });

    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog");
    expect(panel.style.width).toBe("280px");
    expect(panel.style.top).toBe("392px");
    expect(panel.style.left).toBe("736px");

    // A viewport change must reposition the already-open panel below the trigger.
    stubRect(trigger, { top: 20, bottom: 60, left: 10, right: 210 });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(panel.style.top).toBe("68px");
    expect(panel.style.left).toBe("10px");

    // Not enough room below, but even less above: stay below the trigger.
    stubRect(trigger, { top: 100, bottom: 550, left: 10, right: 210 });
    act(() => {
      document.dispatchEvent(new Event("scroll"));
    });
    expect(panel.style.top).toBe("558px");
  });
});
