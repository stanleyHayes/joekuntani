import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("journey matrix documents the required Section 18.1 IDs", () => {
  const matrix = readFileSync(join(__dirname, "..", "journeys.md"), "utf8");
  for (const id of [
    "E2E-01",
    "E2E-02",
    "E2E-03",
    "E2E-04",
    "E2E-05",
    "E2E-06",
    "E2E-07",
    "E2E-08",
    "E2E-09",
    "E2E-10",
    "E2E-11",
  ]) {
    expect(matrix).toContain(id);
  }
});
