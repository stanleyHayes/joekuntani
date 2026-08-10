import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { vi } from "vitest";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    // Prefer reduced motion in tests so GSAP never leaves opacity:0 mid-tween.
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

const memoryStore = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryStore.set(key, String(value));
    },
    removeItem: (key: string) => {
      memoryStore.delete(key);
    },
    clear: () => {
      memoryStore.clear();
    },
    key: (index: number) => Array.from(memoryStore.keys())[index] ?? null,
    get length() {
      return memoryStore.size;
    },
  },
});

globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
  window.setTimeout(
    () => cb(Date.now()),
    16,
  )) as unknown as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame = ((id: number) => {
  window.clearTimeout(id);
}) as unknown as typeof cancelAnimationFrame;

vi.mock("next/font/google", () => ({
  Outfit: () => ({ className: "font-outfit", variable: "--font-outfit" }),
  DM_Sans: () => ({ className: "font-dm-sans", variable: "--font-dm-sans" }),
  Knewave: () => ({ className: "font-knewave", variable: "--font-knewave" }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Testing Library declares failure after 1s of waiting by default. That is
// plenty on an idle machine and not enough on a loaded one: every intermittent
// failure in this suite has been a `findBy*` giving up on a render that was
// merely slow, never one that was wrong. Waiting longer costs nothing when the
// element does appear — the timeout is only reached on a genuine failure.
configure({ asyncUtilTimeout: 5000 });
