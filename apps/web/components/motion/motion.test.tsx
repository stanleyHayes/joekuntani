import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageTransition } from "./page-transition";
import { MotionShell, ScrollReveal } from "./scroll-reveal";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("motion primitives", () => {
  it("renders page transition content under reduced motion", () => {
    render(
      <PageTransition>
        <h1>Headline</h1>
      </PageTransition>,
    );
    expect(screen.getByRole("heading", { name: "Headline" })).toBeVisible();
  });

  it("renders scroll reveal and motion shell children", () => {
    render(
      <MotionShell>
        <main>
          <header>
            <h1>Shell</h1>
          </header>
          <section>
            <ScrollReveal>
              <p>Revealed</p>
            </ScrollReveal>
          </section>
        </main>
      </MotionShell>,
    );
    expect(screen.getByText("Revealed")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Shell" })).toBeVisible();
  });

  it("runs GSAP enter animation when reduced motion is off", () => {
    allowMotion();
    const { container } = render(
      <PageTransition>
        <h1 className="hero-title">Animated</h1>
      </PageTransition>,
    );
    expect(container.querySelector(".page-transition")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Animated" })).toBeInTheDocument();
  });

  it("arms ScrollTrigger reveals when reduced motion is off", () => {
    allowMotion();
    render(
      <MotionShell>
        <main>
          <section>
            <ScrollReveal className="extra">
              <p>Motion on</p>
            </ScrollReveal>
          </section>
        </main>
      </MotionShell>,
    );
    expect(screen.getByText("Motion on")).toBeInTheDocument();
    expect(document.querySelector(".scroll-reveal.extra")).toBeTruthy();
  });
});

function allowMotion() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: () => ({
      matches: false,
      media: "",
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}
