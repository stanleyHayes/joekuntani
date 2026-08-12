import { useLayoutEffect, useState, type RefObject } from "react";

export type PopoverPlacement = {
  top: number;
  left: number;
  /** Floor, not a fixed size — the popover grows to fit its longest option. */
  minWidth: number;
  maxWidth: number;
  maxHeight: number;
};

/**
 * Positions a portalled popover against its trigger, in viewport coordinates.
 *
 * Shared by Select and Combobox. Both render their list into document.body to
 * escape overflow and stacking contexts, which means neither gets positioning
 * from the document flow and both need the same measurements: flip above the
 * trigger when there is more room there, grow past the trigger's width rather
 * than cropping long options, and pull left when the popover would otherwise
 * run off the right edge.
 *
 * Returns null while closed, which is also the caller's signal not to render.
 */
export function usePopoverPlacement(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
): PopoverPlacement | null {
  const [placement, setPlacement] = useState<PopoverPlacement | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }

    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const gap = 6;
      const viewportPad = 8;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPad;
      const spaceAbove = rect.top - viewportPad;
      const preferDown = spaceBelow >= 160 || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(
        120,
        Math.min(288, preferDown ? spaceBelow - gap : spaceAbove - gap),
      );
      const top = preferDown
        ? rect.bottom + gap
        : Math.max(viewportPad, rect.top - gap - maxHeight);
      // The popover was once pinned to the trigger's width, so a narrow control
      // (a "Status" filter reading "All") clipped its own options to "payme…".
      // The trigger width is a floor instead, and the list may run to the
      // viewport edge. Measure the natural width first so a list that would
      // overflow gets pulled left rather than cropped.
      const content = contentRef.current;
      const natural = content
        ? Math.max(rect.width, content.scrollWidth + 2)
        : rect.width;
      const available = window.innerWidth - viewportPad * 2;
      const width = Math.min(natural, available);
      const left = Math.max(
        viewportPad,
        Math.min(rect.left, window.innerWidth - viewportPad - width),
      );
      setPlacement({
        top,
        left,
        minWidth: rect.width,
        maxWidth: available,
        maxHeight,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, triggerRef, contentRef]);

  return placement;
}
