import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import {
  AssetUploadField,
  AssetUploadList,
  DocumentUploadField,
} from "./asset-picker";

const listAssets = vi.fn();
const requestUpload = vi.fn();

vi.mock("./media-admin", () => ({
  listAssets: (...args: unknown[]) => listAssets(...args),
  requestUpload: (...args: unknown[]) => requestUpload(...args),
}));

const STORED_ID = "00000000-0000-4000-8000-0000000000a1";

beforeEach(() => {
  listAssets.mockReset();
  requestUpload.mockReset();
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:local-preview"),
    revokeObjectURL: vi.fn(),
  });
});

function imageFile() {
  return new File(["binary"], "poster.png", { type: "image/png" });
}

// Offering to "replace" something the screen never showed leaves an operator
// guessing what they are about to overwrite.
test("resolves a stored image so there is something to replace", async () => {
  listAssets.mockResolvedValue([
    {
      id: STORED_ID,
      filename: "poster.png",
      publicUrl: "https://cdn.example.test/poster.png",
      status: "ready",
    },
  ]);
  render(
    <AssetUploadField
      label="Logo image"
      folder="brand"
      value={STORED_ID}
      onChange={vi.fn()}
    />,
  );

  const image = await screen.findByRole("presentation");
  expect(image).toHaveAttribute("src", "https://cdn.example.test/poster.png");
  await waitFor(() =>
    expect(screen.getByLabelText("Replace Logo image")).toBeInTheDocument(),
  );
});

// Nothing stored means nothing to replace, so the control must say so.
test("offers to choose, not replace, when nothing is stored", async () => {
  listAssets.mockResolvedValue([]);
  render(
    <AssetUploadField
      label="Logo image"
      folder="brand"
      value=""
      onChange={vi.fn()}
    />,
  );
  expect(screen.getByLabelText("Choose Logo image")).toBeInTheDocument();
  expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
});

// The preview must not wait on the upload — and must survive a provider that
// hands back no URL at all.
test("previews the picked image immediately and without a provider URL", async () => {
  listAssets.mockResolvedValue([]);
  requestUpload.mockResolvedValue({
    id: STORED_ID,
    filename: "poster.png",
    publicUrl: "",
    status: "draft",
  });
  const onChange = vi.fn();
  render(
    <AssetUploadField
      label="Logo image"
      folder="brand"
      value=""
      onChange={onChange}
    />,
  );

  fireEvent.change(screen.getByLabelText("Choose Logo image"), {
    target: { files: [imageFile()] },
  });

  const image = await screen.findByRole("presentation");
  expect(image).toHaveAttribute("src", "blob:local-preview");
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(STORED_ID));
});

test("a gallery shows the pictures behind ids it was given no previews for", async () => {
  listAssets.mockResolvedValue([
    {
      id: STORED_ID,
      filename: "one.png",
      publicUrl: "https://cdn.example.test/one.png",
      status: "ready",
    },
  ]);
  render(
    <AssetUploadList
      label="Product images"
      folder="merch"
      values={[STORED_ID]}
      onChange={vi.fn()}
    />,
  );
  const image = await screen.findByRole("presentation");
  expect(image).toHaveAttribute("src", "https://cdn.example.test/one.png");
});

// A document has no thumbnail, so the filename is the entire preview.
test("names the stored document so replacing it is an informed choice", async () => {
  listAssets.mockResolvedValue([
    {
      id: STORED_ID,
      filename: "proposal-v2.pdf",
      publicUrl: "",
      status: "ready",
    },
  ]);
  render(
    <DocumentUploadField
      label="Proposal document"
      value={STORED_ID}
      onChange={vi.fn()}
    />,
  );
  expect(await screen.findByText("proposal-v2.pdf")).toBeInTheDocument();
  expect(
    screen.getByLabelText("Replace Proposal document"),
  ).toBeInTheDocument();
});

test("shows the chosen document name before the upload resolves", async () => {
  listAssets.mockResolvedValue([]);
  let settle: (value: unknown) => void = () => {};
  requestUpload.mockReturnValue(
    new Promise((resolve) => {
      settle = resolve;
    }),
  );
  render(
    <DocumentUploadField
      label="Proposal document"
      value=""
      onChange={vi.fn()}
    />,
  );

  fireEvent.change(screen.getByLabelText("Choose Proposal document"), {
    target: {
      files: [new File(["%PDF"], "brief.pdf", { type: "application/pdf" })],
    },
  });
  expect(await screen.findByText("brief.pdf")).toBeInTheDocument();

  settle({
    id: STORED_ID,
    filename: "brief.pdf",
    publicUrl: "",
    status: "ready",
  });
});
