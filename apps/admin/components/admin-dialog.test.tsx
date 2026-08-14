import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminDialog } from "./admin-dialog";

describe("AdminDialog", () => {
  it("labels the focused modal and closes with Escape", () => {
    const onClose = vi.fn();
    render(
      <AdminDialog
        title="Add service"
        description="Create a private draft."
        onClose={onClose}
      >
        <button type="button">Save</button>
      </AdminDialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Add service" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveFocus();
    expect(dialog).toHaveTextContent("Create a private draft.");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  // A picker inside a dialog renders its list into document.body, so its own
  // Escape handling never reaches this dialog's listener. Without the guard,
  // dismissing a dropdown threw away the form it was sitting in.
  it("leaves Escape to an open popover inside it", () => {
    const onClose = vi.fn();
    render(
      <AdminDialog title="Upload a video" onClose={onClose}>
        <button type="button">Save</button>
        <ul data-popover-open="true" role="listbox" />
      </AdminDialog>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape again once the popover has gone", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <AdminDialog title="Upload a video" onClose={onClose}>
        <ul data-popover-open="true" role="listbox" />
      </AdminDialog>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <AdminDialog title="Upload a video" onClose={onClose}>
        <span />
      </AdminDialog>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("traps keyboard focus and restores the previous control", () => {
    const onClose = vi.fn();
    const { rerender } = render(<button type="button">Launcher</button>);
    const launcher = screen.getByRole("button", { name: "Launcher" });
    launcher.focus();
    rerender(
      <>
        <button type="button">Launcher</button>
        <AdminDialog title="Focused task" onClose={onClose}>
          <button type="button">First</button>
          <button type="button">Last</button>
        </AdminDialog>
      </>,
    );
    const last = screen.getByRole("button", { name: "Last" });
    const close = screen.getByRole("button", { name: "Close dialog" });

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();

    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();

    rerender(<button type="button">Launcher</button>);
    expect(screen.getByRole("button", { name: "Launcher" })).toHaveFocus();
  });

  it("closes from its labelled control", () => {
    const onClose = vi.fn();
    render(
      <AdminDialog title="Details" onClose={onClose}>
        Details
      </AdminDialog>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
