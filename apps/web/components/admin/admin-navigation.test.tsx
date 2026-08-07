import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminTour, markTourDone, shouldAutoStartTour } from "./admin-tour";
import { AdminUserMenu } from "./admin-user-menu";

const router = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  router.refresh.mockReset();
  router.replace.mockReset();
  document.cookie = "jk_admin_csrf=; Max-Age=0";
});

describe("AdminTour", () => {
  it("persists completion and supports buttons and keyboard navigation", async () => {
    expect(shouldAutoStartTour()).toBe(true);
    const onDone = vi.fn();
    const target = document.createElement("div");
    target.dataset.tourTarget = "true";
    target.scrollIntoView = vi.fn();
    target.getBoundingClientRect = () =>
      ({
        bottom: 180,
        height: 100,
        left: 20,
        right: 220,
        top: 80,
        width: 200,
        x: 20,
        y: 80,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.append(target);

    render(
      <AdminTour
        onDone={onDone}
        steps={[
          { title: "Welcome", body: "Start here" },
          {
            selector: '[data-tour-target="true"]',
            side: "right",
            title: "Target",
            body: "Highlighted control",
          },
          { selector: "[data-missing]", title: "Missing", body: "Fallback" },
        ]}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Admin tour" }),
    ).toHaveTextContent("Step 1 of 3");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      await screen.findByRole("heading", { name: "Target" }),
    ).toBeVisible();
    await waitFor(() => expect(target.scrollIntoView).toHaveBeenCalled());
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(
      await screen.findByRole("heading", { name: "Welcome" }),
    ).toBeVisible();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      await screen.findByRole("heading", { name: "Missing" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onDone).toHaveBeenCalledOnce();
    expect(shouldAutoStartTour()).toBe(false);
    target.remove();
  });

  it("finishes on the final step and fails closed when storage is blocked", () => {
    const onDone = vi.fn();
    render(
      <AdminTour
        onDone={onDone}
        steps={[{ title: "Only step", body: "Complete it" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalledOnce();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => markTourDone()).not.toThrow();
    expect(shouldAutoStartTour()).toBe(false);
  });
});

describe("AdminUserMenu", () => {
  it("loads staff identity, closes safely, replays the tour and signs out", async () => {
    document.cookie = "jk_admin_csrf=csrf-token";
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          id: "staff-1",
          name: "Ama Mensah",
          email: "ama@example.com",
          role: "administrator",
        }),
      )
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    const onReplayTour = vi.fn();
    render(<AdminUserMenu onReplayTour={onReplayTour} />);

    expect(await screen.findByText("Ama Mensah")).toBeVisible();
    const trigger = screen.getByRole("button", { name: /Ama Mensah/ });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toHaveTextContent("ama@example.com");
    fireEvent.click(screen.getByRole("menuitem", { name: /Replay tour/ }));
    expect(onReplayTour).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => {
      expect(fetcher).toHaveBeenLastCalledWith(
        "/api/admin/auth/logout",
        expect.objectContaining({
          method: "POST",
          headers: { "X-CSRF-Token": "csrf-token" },
        }),
      );
      expect(router.replace).toHaveBeenCalledWith("/admin/login");
      expect(router.refresh).toHaveBeenCalled();
    });
  });

  it("keeps the account fallback usable when session loading fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<AdminUserMenu />);
    const trigger = screen.getByRole("button", { name: /Account/ });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toHaveTextContent("Staff");
    fireEvent.click(screen.getByRole("menuitem", { name: /My profile/ }));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
