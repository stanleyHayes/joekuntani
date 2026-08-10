import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AdminPageGuide } from "./page-guide";

let pathname = "/media";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

type Utterance = {
  text: string;
  voice?: { name: string; lang: string };
  rate?: number;
  onend?: () => void;
  onerror?: () => void;
};

type Voice = { name: string; lang: string };

/** What a typical machine offers: novelty, legacy and neural side by side. */
const VOICES: Voice[] = [
  { name: "Albert", lang: "en-US" },
  { name: "Zarvox", lang: "en-US" },
  { name: "Fred", lang: "en-US" },
  { name: "Samantha", lang: "en-US" },
  { name: "Google UK English Female", lang: "en-GB" },
  { name: "Amélie", lang: "fr-CA" },
];

let voices: Voice[] = VOICES;

let spoken: Utterance[] = [];
let cancels = 0;

function installSpeech() {
  spoken = [];
  cancels = 0;
  class FakeUtterance {
    text: string;
    rate = 1;
    onend?: () => void;
    onerror?: () => void;
    constructor(text: string) {
      this.text = text;
    }
  }
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    writable: true,
    value: FakeUtterance,
  });
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    writable: true,
    value: {
      getVoices: () => voices,
      speak: (utterance: Utterance) => spoken.push(utterance),
      cancel: () => {
        cancels += 1;
        // The real API reports the interruption on everything it drops.
        for (const utterance of spoken) utterance.onerror?.();
      },
    },
  });
}

function removeSpeech() {
  // @ts-expect-error deleting an optional browser global for the unsupported case
  delete window.speechSynthesis;
  // @ts-expect-error deleting an optional browser global for the unsupported case
  delete window.SpeechSynthesisUtterance;
}

beforeEach(() => {
  voices = VOICES;
  pathname = "/media";
  localStorage.clear();
  installSpeech();
});

afterEach(() => {
  removeSpeech();
});

it("shows the purpose of the page without being asked", async () => {
  render(<AdminPageGuide title="Media" />);
  expect(await screen.findByText(/asset library/i)).toBeInTheDocument();
});

// The steps are the bulk of the text; leaving them open on every page would
// push the workspace itself below the fold.
it("keeps the steps collapsed until they are asked for", async () => {
  render(<AdminPageGuide title="Media" />);

  const toggle = await screen.findByRole("button", {
    name: /how to use this page/i,
  });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  // The flag and the list have to agree. jsdom does not apply the CSS module,
  // so this checks the `hidden` attribute is wired — the stylesheet side of it
  // is held by the `.steps[hidden]` rule, which a class `display` would
  // otherwise outrank.
  expect(screen.getByText(/always write alt text/i)).not.toBeVisible();

  fireEvent.click(toggle);
  expect(
    screen.getByRole("button", { name: /hide the steps/i }),
  ).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText(/always write alt text/i)).toBeVisible();
});

it("remembers that the steps were left open", async () => {
  const first = render(<AdminPageGuide title="Media" />);
  fireEvent.click(
    await screen.findByRole("button", { name: /how to use this page/i }),
  );
  first.unmount();

  render(<AdminPageGuide title="Media" />);
  expect(
    await screen.findByRole("button", { name: /hide the steps/i }),
  ).toBeInTheDocument();
});

// Chrome cuts a single utterance off after roughly fifteen seconds, so the
// script has to reach the synthesiser as separate sentences.
it("queues the guide one sentence at a time", async () => {
  render(<AdminPageGuide title="Media" />);
  fireEvent.click(
    await screen.findByRole("button", { name: /read this aloud/i }),
  );

  expect(spoken.length).toBeGreaterThan(4);
  expect(spoken[0].text).toBe("Media.");
  expect(spoken.every((utterance) => utterance.text.length < 300)).toBe(true);
});

it("stops reading when asked and reports it in the button", async () => {
  render(<AdminPageGuide title="Media" />);

  const listen = await screen.findByRole("button", {
    name: /read this aloud/i,
  });
  fireEvent.click(listen);
  const stop = screen.getByRole("button", { name: /stop reading/i });
  expect(stop).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(stop);
  expect(cancels).toBeGreaterThan(0);
  expect(
    screen.getByRole("button", { name: /read this aloud/i }),
  ).toHaveAttribute("aria-pressed", "false");
});

// cancel() reports an interruption on everything it drops, and those events
// can land after the next play has started — a stale one must not switch the
// button back to idle while the new script is still being read.
it("ignores a cancellation belonging to a previous play", async () => {
  render(<AdminPageGuide title="Media" />);

  fireEvent.click(
    await screen.findByRole("button", { name: /read this aloud/i }),
  );
  const firstRun = [...spoken];

  fireEvent.click(screen.getByRole("button", { name: /stop reading/i }));
  spoken = [];
  fireEvent.click(screen.getByRole("button", { name: /read this aloud/i }));

  firstRun.forEach((utterance) => utterance.onerror?.());

  expect(screen.getByRole("button", { name: /stop reading/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("hides the listen control where the browser cannot speak", async () => {
  removeSpeech();
  render(<AdminPageGuide title="Media" />);
  await screen.findByRole("button", { name: /how to use this page/i });
  expect(screen.queryByRole("button", { name: /read this aloud/i })).toBeNull();
});

// A detail route has no guide of its own but is still part of its section.
it("inherits the section guide on a detail route", async () => {
  pathname = "/media/some-asset-id";
  render(<AdminPageGuide title="Media" />);
  expect(await screen.findByText(/asset library/i)).toBeInTheDocument();
});

// Better nothing than confident instructions for a different page.
it("renders nothing for a route with no guide", () => {
  pathname = "/unmapped-experiment";
  const { container } = render(<AdminPageGuide title="Whatever" />);
  expect(container).toBeEmptyDOMElement();
});

// Private browsing throws on any storage access. The guide is help text — it
// must still render, just without remembering the disclosure.
it("still renders when local storage cannot be read", async () => {
  const denied = () => {
    throw new Error("access denied");
  };
  // Restored in a finally: the shared beforeEach clears storage, so a throwing
  // stub left in place fails whichever test happens to run next.
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: denied,
      setItem: denied,
      removeItem: denied,
      clear: denied,
    },
  });
  try {
    render(<AdminPageGuide title="Media" />);
    expect(await screen.findByText(/asset library/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /how to use this page/i }),
    ).toHaveAttribute("aria-expanded", "false");
  } finally {
    if (original) Object.defineProperty(window, "localStorage", original);
  }
});

// The speech queue reports interruptions per utterance; the last one also
// reports a clean finish. Both have to return the button to idle.
it("returns to idle when the reading finishes on its own", async () => {
  render(<AdminPageGuide title="Media" />);
  fireEvent.click(
    await screen.findByRole("button", { name: /read this aloud/i }),
  );
  act(() => {
    spoken[spoken.length - 1].onend?.();
  });
  expect(
    screen.getByRole("button", { name: /read this aloud/i }),
  ).toHaveAttribute("aria-pressed", "false");
});

// The browser's default is whatever the system nominated years ago, which on
// most machines is a novelty or first-generation voice. Left unset, the guide
// read in exactly that voice.
it("reads with the most natural installed voice, not the default", async () => {
  render(<AdminPageGuide title="Media" />);
  fireEvent.click(
    await screen.findByRole("button", { name: /read this aloud/i }),
  );
  expect(spoken[0].voice?.name).toBe("Google UK English Female");
});

it("never picks a novelty or first-generation voice", async () => {
  voices = [
    { name: "Zarvox", lang: "en-US" },
    { name: "Albert", lang: "en-US" },
    { name: "Samantha", lang: "en-US" },
  ];
  render(<AdminPageGuide title="Media" />);
  fireEvent.click(
    await screen.findByRole("button", { name: /read this aloud/i }),
  );
  expect(spoken[0].voice?.name).toBe("Samantha");
});

// A voice reading English with another language's phonetics is worse than a
// robotic one, so a non-English voice is never chosen.
it("ignores voices that do not speak English", async () => {
  voices = [{ name: "Amélie", lang: "fr-CA" }];
  render(<AdminPageGuide title="Media" />);
  fireEvent.click(
    await screen.findByRole("button", { name: /read this aloud/i }),
  );
  expect(spoken[0].voice).toBeUndefined();
});

// Chrome reports an empty list until the voices load; asking too early must
// fall back to the browser default rather than crash.
it("still reads when the voice list has not loaded", async () => {
  voices = [];
  render(<AdminPageGuide title="Media" />);
  fireEvent.click(
    await screen.findByRole("button", { name: /read this aloud/i }),
  );
  expect(spoken.length).toBeGreaterThan(0);
  expect(spoken[0].voice).toBeUndefined();
});

it("reads a little under natural pace", async () => {
  render(<AdminPageGuide title="Media" />);
  fireEvent.click(
    await screen.findByRole("button", { name: /read this aloud/i }),
  );
  expect(spoken[0].rate).toBeLessThan(1);
  expect(spoken[0].rate).toBeGreaterThan(0.85);
});

// The scored pick is a guess until somebody hears it, and what is installed
// varies enormously between machines — so the choice has to be reachable.
it("offers a voice picker when there is more than one to choose from", async () => {
  render(<AdminPageGuide title="Media" />);
  const picker = await screen.findByRole("combobox", {
    name: /Reading voice/i,
  });
  const options = within(picker)
    .getAllByRole("option")
    .map((o) => o.textContent);
  expect(options[0]).toBe("Best available");
  expect(options).toContain("Samantha");
  // Non-English voices are never offered; they read English as gibberish.
  expect(options).not.toContain("Amélie");
});

it("hides the picker when the system offers no real choice", async () => {
  voices = [{ name: "Samantha", lang: "en-US" }];
  render(<AdminPageGuide title="Media" />);
  await screen.findByRole("button", { name: /read this aloud/i });
  expect(screen.queryByRole("combobox", { name: /Reading voice/i })).toBeNull();
});

it("reads in the chosen voice and remembers it", async () => {
  const first = render(<AdminPageGuide title="Media" />);
  fireEvent.change(
    await screen.findByRole("combobox", { name: /Reading voice/i }),
    { target: { value: "Samantha" } },
  );
  fireEvent.click(screen.getByRole("button", { name: /read this aloud/i }));
  expect(spoken[0].voice?.name).toBe("Samantha");

  first.unmount();
  spoken = [];
  render(<AdminPageGuide title="Media" />);
  fireEvent.click(
    await screen.findByRole("button", { name: /read this aloud/i }),
  );
  expect(spoken[0].voice?.name).toBe("Samantha");
});

// A voice can disappear between visits — a language pack removed, a different
// machine. The guide must fall back rather than read in none at all.
it("falls back to the best voice when the chosen one is gone", async () => {
  localStorage.setItem("jk.admin.guide.voice", "A Voice That Left");
  render(<AdminPageGuide title="Media" />);
  fireEvent.click(
    await screen.findByRole("button", { name: /read this aloud/i }),
  );
  expect(spoken[0].voice?.name).toBe("Google UK English Female");
});
