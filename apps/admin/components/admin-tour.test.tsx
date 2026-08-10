import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import {
  ADMIN_TOUR_STEPS,
  AdminTour,
  markTourDone,
  shouldAutoStartTour,
} from "./admin-tour";

const TOUR_KEY = "jk.admin.tour.done";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  });
});

// The tour is a first-run courtesy. Showing it again on every visit would be a
// nuisance, so finishing it has to stick.
it("auto-starts only until it has been seen", () => {
  expect(shouldAutoStartTour()).toBe(true);
  markTourDone();
  expect(localStorage.getItem(TOUR_KEY)).toBe("1");
  expect(shouldAutoStartTour()).toBe(false);
});

it("does not auto-start when storage cannot be read", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  });
  // Private browsing should not mean a tour on every page load.
  expect(shouldAutoStartTour()).toBe(false);
  expect(() => markTourDone()).not.toThrow();
});

it("walks forward and back through the steps", () => {
  render(<AdminTour onDone={vi.fn()} />);
  expect(
    screen.getByText(`Step 1 of ${ADMIN_TOUR_STEPS.length}`),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByText(`Step 2 of ${ADMIN_TOUR_STEPS.length}`),
  ).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(
    screen.getByText(`Step 1 of ${ADMIN_TOUR_STEPS.length}`),
  ).toBeVisible();
});

it("drives the same steps from the arrow keys", () => {
  render(<AdminTour onDone={vi.fn()} />);
  fireEvent.keyDown(document, { key: "ArrowRight" });
  expect(
    screen.getByText(`Step 2 of ${ADMIN_TOUR_STEPS.length}`),
  ).toBeVisible();

  fireEvent.keyDown(document, { key: "ArrowLeft" });
  expect(
    screen.getByText(`Step 1 of ${ADMIN_TOUR_STEPS.length}`),
  ).toBeVisible();

  // Left on the first step stays put rather than going negative.
  fireEvent.keyDown(document, { key: "ArrowLeft" });
  expect(
    screen.getByText(`Step 1 of ${ADMIN_TOUR_STEPS.length}`),
  ).toBeVisible();
});

it.each([
  ["Skip", () => fireEvent.click(screen.getByRole("button", { name: "Skip" }))],
  ["Escape", () => fireEvent.keyDown(document, { key: "Escape" })],
])("finishes and records the tour on %s", (_name, act) => {
  const onDone = vi.fn();
  render(<AdminTour onDone={onDone} />);
  act();
  expect(onDone).toHaveBeenCalledOnce();
  expect(localStorage.getItem(TOUR_KEY)).toBe("1");
});

it("ends on the last step", () => {
  const onDone = vi.fn();
  render(<AdminTour onDone={onDone} />);
  for (let step = 1; step < ADMIN_TOUR_STEPS.length; step += 1)
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

  const done = screen.getByRole("button", { name: "Done" });
  fireEvent.click(done);
  expect(onDone).toHaveBeenCalledOnce();
});

// A step points at a selector that may not exist on the current page — the
// card has to fall back to the middle rather than disappear.
it("still shows a step whose highlight target is absent", async () => {
  render(
    <AdminTour
      steps={[{ selector: "#nothing-here", title: "Missing", body: "Copy" }]}
      onDone={vi.fn()}
    />,
  );
  expect(await screen.findByText("Missing")).toBeVisible();
});

it("highlights a step whose target is on the page", async () => {
  const target = document.createElement("div");
  target.id = "present";
  // jsdom has no layout, so it implements neither of these.
  target.scrollIntoView = () => undefined;
  document.body.append(target);
  try {
    render(
      <AdminTour
        steps={[
          { selector: "#present", title: "Here", body: "Copy", side: "right" },
        ]}
        onDone={vi.fn()}
      />,
    );
    expect(await screen.findByText("Here")).toBeVisible();
  } finally {
    target.remove();
  }
});

it("renders nothing when handed no steps", () => {
  const { container } = render(<AdminTour steps={[]} onDone={vi.fn()} />);
  expect(container).toBeEmptyDOMElement();
});
