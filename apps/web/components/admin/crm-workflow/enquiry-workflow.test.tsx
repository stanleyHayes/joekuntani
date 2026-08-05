import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { EnquiryWorkflow } from "./enquiry-workflow";

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
  fireEvent.change(screen.getByLabelText("Protected media asset ID"), {
    target: { value: "asset" },
  });
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
