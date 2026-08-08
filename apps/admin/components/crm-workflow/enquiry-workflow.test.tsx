import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { EnquiryWorkflow } from "./enquiry-workflow";

// The proposal document is uploaded through a file picker now rather than
// typed in as a media-library UUID, so the upload call is stubbed.
vi.mock("../media/media-admin", () => ({
  // The picker resolves stored ids to a preview, so the listing is stubbed too.
  listAssets: vi.fn(async () => []),
  requestUpload: vi.fn(async () => ({
    id: "00000000-0000-4000-8000-0000000000d1",
    filename: "proposal.pdf",
    publicUrl: "",
    status: "ready",
  })),
}));

async function pickProposalPDF() {
  const file = new File(["%PDF-1.7"], "proposal.pdf", {
    type: "application/pdf",
  });
  fireEvent.change(screen.getByLabelText("Choose Proposal document"), {
    target: { files: [file] },
  });
  await waitFor(() =>
    expect(screen.getByText("proposal.pdf")).toBeInTheDocument(),
  );
}

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  document.cookie = "jk_admin_csrf=test-csrf; path=/";
});

test("renders accessible workflow and submits an internal note", async () => {
  fetchMock
    .mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: "note" }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        notes: [
          {
            id: "note",
            body: "Private follow-up",
            author_id: "staff",
            created_at: "2026-08-05T17:00:00Z",
          },
        ],
        tasks: [],
        stage_history: [],
        attachments: [],
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    });
  render(
    <EnquiryWorkflow
      enquiryId="lead-one"
      initial={{ notes: [], tasks: [], stage_history: [], attachments: [] }}
      deliveries={[]}
      autoload={false}
    />,
  );
  expect(
    screen.getByRole("heading", { name: "Lead activity" }),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Note"), {
    target: { value: "Private follow-up" },
  });
  fireEvent.submit(
    screen.getByRole("heading", { name: "Add internal note" }).closest("form")!,
  );
  await waitFor(() =>
    expect(screen.getByText("Internal note added.")).toBeInTheDocument(),
  );
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/admin/crm/enquiries/lead-one/notes",
    expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: expect.objectContaining({ "X-CSRF-Token": "test-csrf" }),
    }),
  );
});

test("shows delivery status and retries only failed delivery", async () => {
  fetchMock
    .mockResolvedValueOnce({ ok: true, status: 204, json: async () => null })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        notes: [],
        tasks: [],
        stage_history: [],
        attachments: [],
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    });
  render(
    <EnquiryWorkflow
      enquiryId="lead-one"
      initial={{ notes: [], tasks: [], stage_history: [], attachments: [] }}
      deliveries={[
        {
          id: "delivery",
          kind: "task.overdue",
          status: "dead_letter",
          attempts: 8,
        },
      ]}
      autoload={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() =>
    expect(
      screen.getByText("Notification queued for retry."),
    ).toBeInTheDocument(),
  );
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/admin/crm/enquiries/lead-one/deliveries/delivery/retry",
    expect.objectContaining({ method: "POST" }),
  );
});

test("completes an open task and keeps completed tasks read-only", async () => {
  const task = {
    id: "task",
    title: "Call client",
    priority: "high",
    status: "open",
    due_at: "2026-08-06T17:00:00Z",
  };
  fetchMock
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => task })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        notes: [],
        tasks: [{ ...task, status: "done" }],
        stage_history: [],
        attachments: [],
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    });
  render(
    <EnquiryWorkflow
      enquiryId="lead-one"
      initial={{ notes: [], tasks: [task], stage_history: [], attachments: [] }}
      deliveries={[]}
      autoload={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Complete task" }));
  await waitFor(() =>
    expect(screen.getByText("Task completed.")).toBeInTheDocument(),
  );
  expect(
    screen.queryByRole("button", { name: "Complete task" }),
  ).not.toBeInTheDocument();
});

test("reports protected attachment validation failures without exposing provider details", async () => {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 422,
    json: async () => ({ detail: "provider secret" }),
  });
  render(
    <EnquiryWorkflow
      enquiryId="lead-one"
      initial={{ notes: [], tasks: [], stage_history: [], attachments: [] }}
      deliveries={[]}
      autoload={false}
    />,
  );
  await pickProposalPDF();
  fireEvent.change(screen.getByLabelText("Label"), {
    target: { value: "Proposal" },
  });
  fireEvent.submit(
    screen
      .getByRole("heading", { name: "Add proposal attachment" })
      .closest("form")!,
  );
  await waitFor(() =>
    expect(
      screen.getByText("The attachment must be a ready protected document."),
    ).toBeInTheDocument(),
  );
  expect(screen.queryByText("provider secret")).not.toBeInTheDocument();
});

// The API only accepts an asset id, and an operator has no way to know one.
// Uploading has to be what produces it, and the label defaults from the file
// so the common case is a single click.
test("uploads a proposal PDF and attaches it by id", async () => {
  fetchMock
    .mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: "attachment" }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        notes: [],
        tasks: [],
        stage_history: [],
        attachments: [{ id: "attachment", label: "proposal" }],
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    });
  render(
    <EnquiryWorkflow
      enquiryId="lead-one"
      initial={{ notes: [], tasks: [], stage_history: [], attachments: [] }}
      deliveries={[]}
      autoload={false}
    />,
  );

  // Nothing can be attached until a document exists to attach.
  expect(screen.getByRole("button", { name: "Add attachment" })).toBeDisabled();

  await pickProposalPDF();
  expect(screen.getByLabelText("Label")).toHaveValue("proposal");
  expect(
    screen.getByRole("button", { name: "Add attachment" }),
  ).not.toBeDisabled();

  fireEvent.submit(
    screen
      .getByRole("heading", { name: "Add proposal attachment" })
      .closest("form")!,
  );
  await waitFor(() =>
    expect(
      screen.getByText("Protected proposal attachment added."),
    ).toBeInTheDocument(),
  );
  const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
    asset_id: string;
    label: string;
  };
  expect(body.asset_id).toBe("00000000-0000-4000-8000-0000000000d1");
  expect(body.label).toBe("proposal");
});
