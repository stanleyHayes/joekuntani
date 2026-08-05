import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import {
  deleteAsset,
  dimensionsFor,
  mapAsset,
  MediaAdmin,
  requestUpload,
  retryUpload,
  saveMetadata,
} from "./media-admin";
const safe = {
  id: "a",
  filename: "a.jpg",
  mime_type: "image/jpeg",
  public_url: "https://res.cloudinary.com/c/a.jpg",
  folder: "staging/content",
  alt_text: "Joe performing on a lit stage",
  tags: ["stage"],
  transformations: ["hero"],
  status: "ready" as const,
  width: 100,
  height: 50,
  bytes: 4,
  reference_count: 0,
};
const signed = {
  upload_url: "https://api.cloudinary.com/upload",
  api_key: "key",
  folder: "staging/content",
  public_id: "a",
  signature: "abc",
  timestamp: 1,
};
function response(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
describe("MediaAdmin", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = "jk_admin_csrf=; Max-Age=0";
  });
  it("loads safe assets and reports load failure", async () => {
    const fetch = vi.fn(async () => response(200, { assets: [safe] }));
    vi.stubGlobal("fetch", fetch);
    const { rerender } = render(<MediaAdmin />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(
      await screen.findByText("a.jpg", { selector: "strong" }),
    ).toBeVisible();
    fetch.mockResolvedValue(response(503));
    rerender(<MediaAdmin key="failed" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not be loaded",
    );
  });
  it("maps defaults and measures only images", async () => {
    expect(
      mapAsset({
        ...safe,
        tags: undefined as never,
        transformations: undefined as never,
      }).tags,
    ).toEqual([]);
    expect(
      await dimensionsFor(
        new File(["pdf"], "x.pdf", { type: "application/pdf" }),
      ),
    ).toEqual({ width: 0, height: 0 });
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 40, height: 20, close })),
    );
    expect(
      await dimensionsFor(new File(["img"], "x.jpg", { type: "image/jpeg" })),
    ).toEqual({ width: 40, height: 20 });
    expect(close).toHaveBeenCalled();
  });
  it("handles signed upload, provider failure and preserved draft", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 40, height: 20, close: vi.fn() })),
    );
    document.cookie = "jk_admin_csrf=csrf-token";
    const file = new File(["data"], "a.jpg", { type: "image/jpeg" });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    fetch
      .mockResolvedValueOnce(response(201, { asset: safe, upload: signed }))
      .mockResolvedValueOnce(response(200));
    expect(
      (
        await requestUpload({
          file,
          folder: "content",
          altText: safe.alt_text,
          tags: ["stage"],
        })
      ).status,
    ).toBe("ready");
    expect(fetch.mock.calls[0][1].headers["X-CSRF-Token"]).toBe("csrf-token");
    expect(fetch.mock.calls[1][1].body).toBeInstanceOf(FormData);
    fetch
      .mockResolvedValueOnce(response(201, { asset: safe, upload: signed }))
      .mockResolvedValueOnce(response(500));
    expect(
      (
        await requestUpload({
          file,
          folder: "content",
          altText: safe.alt_text,
          tags: [],
        })
      ).status,
    ).toBe("failed");
    fetch.mockResolvedValueOnce(
      response(503, { asset: safe, retryable: true }),
    );
    expect(
      (
        await requestUpload({
          file,
          folder: "content",
          altText: safe.alt_text,
          tags: [],
        })
      ).status,
    ).toBe("draft");
    fetch.mockResolvedValueOnce(response(400, {}));
    await expect(
      requestUpload({
        file,
        folder: "content",
        altText: safe.alt_text,
        tags: [],
      }),
    ).rejects.toThrow();
  });
  it("retries, saves and deletes through CSRF-protected API calls", async () => {
    const file = new File(["data"], "a.jpg", { type: "image/jpeg" });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    fetch
      .mockResolvedValueOnce(response(200, { asset: safe, upload: signed }))
      .mockResolvedValueOnce(response(200));
    expect((await retryUpload("a", file)).id).toBe("a");
    fetch.mockResolvedValueOnce(response(400, {}));
    await expect(retryUpload("a", file)).rejects.toThrow();
    fetch.mockResolvedValueOnce(response(200, safe));
    expect(
      (
        await saveMetadata("a", {
          altText: safe.alt_text,
          tags: [],
          transformations: [],
        })
      ).id,
    ).toBe("a");
    fetch.mockResolvedValueOnce(response(500));
    await expect(
      saveMetadata("a", {
        altText: safe.alt_text,
        tags: [],
        transformations: [],
      }),
    ).rejects.toThrow();
    fetch.mockResolvedValueOnce(response(204));
    await expect(deleteAsset("a")).resolves.toBeUndefined();
    fetch.mockResolvedValueOnce(response(409));
    await expect(deleteAsset("a")).rejects.toThrow();
  });
});
