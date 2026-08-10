import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { NewsletterForm } from "./newsletter-form";

const consent = {
  version: "2026-08-v1",
  marketingLabel: "Email me about shows and releases.",
  privacyURL: "/privacy",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function fill(email: string, name = "") {
  if (name)
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: name },
    });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: email },
  });
}

it("sends exactly the fields the API accepts", async () => {
  render(<NewsletterForm consent={consent} source="footer" />);
  fill("ama@example.test", "Ama Mensah");
  fireEvent.click(screen.getByLabelText(/Email me about shows/));
  fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/public/newsletter");
  // The decoder runs DisallowUnknownFields, so an extra key fails the whole
  // request with a 400 that says nothing useful.
  expect(JSON.parse(String(init.body))).toEqual({
    email: "ama@example.test",
    name: "Ama Mensah",
    source: "footer",
    consent_version: "2026-08-v1",
    consent: true,
  });
});

// A stored address is only lawful to email if the record says what was agreed,
// so the box is never pre-ticked and never bypassed.
it("refuses to subscribe without consent", async () => {
  render(<NewsletterForm consent={consent} />);
  fill("ama@example.test");
  expect(screen.getByLabelText(/Email me about shows/)).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Tick the box to agree",
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

it("asks for an email before sending anything", async () => {
  render(<NewsletterForm consent={consent} />);
  fireEvent.click(screen.getByLabelText(/Email me about shows/));
  fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Enter an email address",
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

it("confirms the signup and clears the form", async () => {
  render(<NewsletterForm consent={consent} />);
  fill("ama@example.test");
  fireEvent.click(screen.getByLabelText(/Email me about shows/));
  fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));

  expect(await screen.findByRole("status")).toHaveTextContent("on the list");
  expect(screen.queryByRole("button", { name: "Subscribe" })).toBeNull();
});

it("says so when the request fails rather than claiming success", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
  render(<NewsletterForm consent={consent} />);
  fill("ama@example.test");
  fireEvent.click(screen.getByLabelText(/Email me about shows/));
  fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "did not go through",
  );
  expect(screen.queryByRole("status")).toBeNull();
});

// Without a version there is nothing to record agreement against, so
// collecting an address would produce a record that cannot lawfully be used.
it("does not render at all when no consent version is published", () => {
  const { container } = render(
    <NewsletterForm consent={{ ...consent, version: "" }} />,
  );
  expect(container).toBeEmptyDOMElement();
});

it("links the privacy page when settings publish one", () => {
  render(<NewsletterForm consent={consent} />);
  expect(
    screen.getByRole("link", { name: /How we handle your details/ }),
  ).toHaveAttribute("href", "/privacy");
});
