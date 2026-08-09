import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminShell } from "./admin-shell";

describe("AdminShell", () => {
  it("exposes the content warning and accessible workspace landmarks", () => {
    render(
      <AdminShell
        currentPath="/content"
        missingContentCount={4}
        title="Content workspace"
      >
        <p>Workspace content</p>
      </AdminShell>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Content incomplete");
    expect(screen.getByRole("status")).toHaveTextContent("4 items remain");
    expect(
      screen.getByRole("navigation", { name: "Administration" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Services" })).toHaveAttribute(
      "href",
      "/services",
    );
    expect(
      screen.getByRole("heading", { name: "Content workspace" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Skip to workspace" }),
    ).toHaveAttribute("href", "#admin-main-content");
  });

  it("hides the content warning when no outstanding item count is reported", () => {
    render(
      <AdminShell title="Overview">
        <p>No content yet</p>
      </AdminShell>,
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("hides the content warning once every required item is recorded", () => {
    render(
      <AdminShell missingContentCount={0} title="Overview">
        <p>Everything recorded</p>
      </AdminShell>,
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders collapsible grouped navigation with connectors and collapse control", () => {
    render(
      <AdminShell currentPath="/campaigns" title="Campaigns">
        <p>Campaign workspace</p>
      </AdminShell>,
    );

    const publishToggle = screen.getByRole("button", { name: /Publish/i });
    expect(publishToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Campaigns" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getAllByRole("button", {
        name: /Collapse sidebar|Expand sidebar/,
      }),
    ).not.toHaveLength(0);
    expect(document.querySelector("[class*='connector']")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Newsletter" })).toHaveAttribute(
      "href",
      "/newsletter",
    );
    expect(screen.getByRole("link", { name: "Users & roles" })).toHaveAttribute(
      "href",
      "/team",
    );
  });

  it("collapses a nav group when its heading is toggled", () => {
    render(
      <AdminShell currentPath="/" title="Overview">
        <p>Overview body</p>
      </AdminShell>,
    );

    const governance = screen.getByRole("button", { name: /Governance/i });
    expect(governance).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(governance);
    expect(governance).toHaveAttribute("aria-expanded", "false");
  });

  it("hydrates saved rail state and controls the mobile drawer", async () => {
    localStorage.setItem("jk.admin.nav.collapsed", "true");
    localStorage.setItem("jk.admin.tour.done", "1");
    const { container } = render(
      <AdminShell currentPath="/" title="Overview">
        <p>Overview body</p>
      </AdminShell>,
    );
    const frame = container.querySelector("[data-admin-frame]");
    await waitFor(() =>
      expect(frame).toHaveAttribute("data-collapsed", "true"),
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Expand sidebar" })[0],
    );
    expect(frame).toHaveAttribute("data-collapsed", "false");
    expect(localStorage.getItem("jk.admin.nav.collapsed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(frame).toHaveAttribute("data-mobile-nav", "open");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(frame).toHaveAttribute("data-mobile-nav", "closed");

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Close navigation" }));
    expect(frame).toHaveAttribute("data-mobile-nav", "closed");
  });

  it("falls back safely when persisted navigation state is corrupt", async () => {
    localStorage.setItem("jk.admin.nav.collapsed", "{");
    localStorage.setItem("jk.admin.nav.groups", "{");
    localStorage.setItem("jk.admin.tour.done", "1");
    const { container } = render(
      <AdminShell title="Overview">
        <p>Overview body</p>
      </AdminShell>,
    );
    await waitFor(() =>
      expect(container.querySelector("[data-admin-frame]")).toHaveAttribute(
        "data-collapsed",
        "false",
      ),
    );
    expect(screen.getByRole("button", { name: /Publish/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});
