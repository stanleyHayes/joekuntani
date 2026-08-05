import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mediaKit: vi.fn(),
  contact: vi.fn(),
  services: vi.fn(),
}));

vi.mock("./data", () => ({
  getMediaKit: mocks.mediaKit,
  getContactConfiguration: mocks.contact,
}));
vi.mock("../services/data", () => ({ getPublicServices: mocks.services }));

import { generateMetadata as contactMetadata } from "../../app/contact/page";
import { generateMetadata as mediaMetadata } from "../../app/media-kit/page";

beforeEach(() => vi.clearAllMocks());

it("marks an unavailable media kit noindex and nofollow", async () => {
  mocks.mediaKit.mockResolvedValue({ page: null, download: null });
  await expect(mediaMetadata()).resolves.toMatchObject({
    robots: { index: false, follow: false },
  });
});

it("marks contact noindex and nofollow unless settings and services are ready", async () => {
  mocks.contact.mockResolvedValue(null);
  mocks.services.mockResolvedValue([]);
  await expect(contactMetadata()).resolves.toMatchObject({
    robots: { index: false, follow: false },
  });
});
