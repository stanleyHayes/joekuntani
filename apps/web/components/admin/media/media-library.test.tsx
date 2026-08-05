import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { MediaAsset, MediaLibrary } from "./media-library";

const asset: MediaAsset = {
  id: "asset-1",
  filename: "performance.jpg",
  mimeType: "image/jpeg",
  publicUrl: "https://res.cloudinary.com/test/performance.jpg",
  folder: "staging/content",
  altText: "Joe performing under warm stage lights",
  tags: ["stage"],
  transformations: ["hero"],
  status: "ready",
  width: 1600,
  height: 900,
  bytes: 1024,
  referenceCount: 1,
};

describe("MediaLibrary", () => {
  it("renders an accessible asset grid and prevents referenced deletion", () => {
    const remove = vi.fn();
    render(<MediaLibrary initialAssets={[asset]} onDelete={remove} />);
    expect(
      screen.getByRole("heading", { name: "Asset library" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Media assets" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete asset" }));
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("used in 1 place");
  });
  it("validates uploads before invoking a provider", async () => {
    const upload = vi.fn();
    render(<MediaLibrary initialAssets={[]} onUpload={upload} />);
    fireEvent.change(screen.getByLabelText(/Alternative text/), {
      target: { value: "short" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Request secure upload" })
        .closest("form")!,
    );
    expect(upload).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "approved file",
    );
  });

  it("uploads an allowed file and selects the returned asset", async () => {
    const uploaded = {
      ...asset,
      id: "asset-2",
      filename: "new.png",
      referenceCount: 0,
    };
    const upload = vi.fn(async () => uploaded);
    render(<MediaLibrary initialAssets={[]} onUpload={upload} />);
    const file = new File(["image"], "new.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/^File/), {
      target: { files: [file] },
    });
    fireEvent.change(screen.getByLabelText(/Alternative text/), {
      target: { value: "Joe rehearsing on a softly lit stage" },
    });
    fireEvent.change(screen.getByLabelText(/^Tags/), {
      target: { value: "Stage, stage, Rehearsal" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Request secure upload" })
        .closest("form")!,
    );
    await waitFor(() =>
      expect(upload).toHaveBeenCalledWith(
        expect.objectContaining({ file, tags: ["stage", "rehearsal"] }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("uploaded"),
    );
    expect(screen.getAllByText("new.png")).toHaveLength(2);
  });

  it("preserves upload form state when the provider is absent or fails", async () => {
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    const { rerender } = render(<MediaLibrary initialAssets={[]} />);
    const file = new File(["image"], "new.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/^File/), {
      target: { files: [file] },
    });
    fireEvent.change(screen.getByLabelText(/Alternative text/), {
      target: { value: "Joe rehearsing on a softly lit stage" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Request secure upload" })
        .closest("form")!,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "provider is unavailable",
    );
    rerender(
      <MediaLibrary
        key="provider-retry"
        initialAssets={[]}
        onUpload={failing}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^File/), {
      target: { files: [file] },
    });
    fireEvent.change(screen.getByLabelText(/Alternative text/), {
      target: { value: "Joe rehearsing on a softly lit stage" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Request secure upload" })
        .closest("form")!,
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "temporarily unavailable",
      ),
    );
  });
  it("saves edited metadata", async () => {
    const save = vi.fn(
      async (
        _id: string,
        input: Pick<MediaAsset, "altText" | "tags" | "transformations">,
      ) => ({ ...asset, ...input }),
    );
    render(<MediaLibrary initialAssets={[asset]} onSave={save} />);
    const alt = screen.getByDisplayValue(asset.altText);
    fireEvent.change(alt, {
      target: { value: "Joe standing backstage in a red jacket" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save metadata" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        "asset-1",
        expect.objectContaining({
          altText: "Joe standing backstage in a red jacket",
        }),
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Metadata saved");
  });

  it("rejects weak metadata and reports save failures", async () => {
    const save = vi.fn(async () => {
      throw new Error("offline");
    });
    render(<MediaLibrary initialAssets={[asset]} onSave={save} />);
    const alt = screen.getByDisplayValue(asset.altText);
    fireEvent.change(alt, { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Save metadata" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("meaningfully");
    fireEvent.change(alt, {
      target: { value: "Joe standing backstage in a red jacket" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save metadata" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "could not be saved",
      ),
    );
  });

  it("deletes unreferenced assets and retains them on failure", async () => {
    const removable = { ...asset, referenceCount: 0 };
    const remove = vi.fn(async () => undefined);
    const { rerender } = render(
      <MediaLibrary initialAssets={[removable]} onDelete={remove} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete asset" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("asset-1"));
    expect(screen.getByText("No assets yet")).toBeInTheDocument();
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    rerender(
      <MediaLibrary
        key="delete-retry"
        initialAssets={[removable]}
        onDelete={failing}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete asset" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "could not be deleted",
      ),
    );
    expect(screen.getAllByText("performance.jpg")).toHaveLength(2);
  });

  it("selects another asset and renders non-image previews", () => {
    const pdf = {
      ...asset,
      id: "pdf",
      filename: "press-kit.pdf",
      mimeType: "application/pdf",
      publicUrl: "",
      width: 0,
      height: 0,
      referenceCount: 0,
    };
    render(<MediaLibrary initialAssets={[asset, pdf]} />);
    fireEvent.click(screen.getByRole("button", { name: /press-kit.pdf/ }));
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(
      screen.getByText("press-kit.pdf", { selector: "p" }),
    ).toBeInTheDocument();
  });
  it("guides and completes a preserved draft retry", async () => {
    const draft = { ...asset, status: "failed" as const, referenceCount: 0 };
    const retry = vi.fn(async () => ({
      ...draft,
      status: "uploading" as const,
    }));
    render(<MediaLibrary initialAssets={[draft]} onRetry={retry} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry secure upload" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Choose the original");
    const wrong = new File(["x"], draft.filename, { type: draft.mimeType });
    fireEvent.change(screen.getByLabelText("Original file"), {
      target: { files: [wrong] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Retry secure upload" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "same file name, type, and size",
    );
    const correct = new File([new Uint8Array(draft.bytes)], draft.filename, {
      type: draft.mimeType,
    });
    fireEvent.change(screen.getByLabelText("Original file"), {
      target: { files: [correct] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Retry secure upload" }),
    );
    await waitFor(() => expect(retry).toHaveBeenCalledWith(draft.id, correct));
    expect(screen.getByRole("status")).toHaveTextContent("retried");
  });
  it("retains a draft when retry fails", async () => {
    const draft = { ...asset, status: "draft" as const, referenceCount: 0 };
    const retry = vi.fn(async () => {
      throw new Error("offline");
    });
    render(<MediaLibrary initialAssets={[draft]} onRetry={retry} />);
    const correct = new File([new Uint8Array(draft.bytes)], draft.filename, {
      type: draft.mimeType,
    });
    fireEvent.change(screen.getByLabelText("Original file"), {
      target: { files: [correct] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Retry secure upload" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("still unavailable"),
    );
  });
  it("reports a provider-pending draft after upload", async () => {
    const draft = { ...asset, status: "draft" as const, referenceCount: 0 };
    const upload = vi.fn(async () => draft);
    render(<MediaLibrary initialAssets={[]} onUpload={upload} />);
    const file = new File([new Uint8Array(draft.bytes)], draft.filename, {
      type: draft.mimeType,
    });
    fireEvent.change(screen.getByLabelText(/^File/), {
      target: { files: [file] },
    });
    fireEvent.change(screen.getByLabelText(/Alternative text/), {
      target: { value: draft.altText },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Request secure upload" })
        .closest("form")!,
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Draft saved"),
    );
  });
});
