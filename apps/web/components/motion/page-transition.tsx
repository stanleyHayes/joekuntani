"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";

gsap.registerPlugin(useGSAP);

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        gsap.set(root, { clearProps: "all", opacity: 1, y: 0 });
        return;
      }
      gsap.fromTo(
        root,
        { opacity: 0, y: 18, filter: "blur(4px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.55, ease: "power3.out" },
      );
      const headings = root.querySelectorAll("h1, .hero-title, .animate-text");
      if (headings.length) {
        gsap.fromTo(
          headings,
          { opacity: 0, y: 28, clipPath: "inset(0 0 100% 0)" },
          {
            opacity: 1,
            y: 0,
            clipPath: "inset(0 0 0% 0)",
            duration: 0.7,
            stagger: 0.08,
            ease: "power3.out",
            delay: 0.05,
          },
        );
      }
    },
    { dependencies: [pathname], scope: ref },
  );

  return (
    <div ref={ref} className="page-transition" data-pathname={pathname}>
      {children}
    </div>
  );
}
