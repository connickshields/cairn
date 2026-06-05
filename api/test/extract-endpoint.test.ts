import { describe, it, expect, vi, beforeEach } from "vitest";

const sample = { segments: [{ name: "Main", instructions: [] }] };

// vi.mock is hoisted above imports, so any variable its factory references must be
// created with vi.hoisted (a plain top-level const would not be initialized yet).
const { extractPageMock } = vi.hoisted(() => ({ extractPageMock: vi.fn() }));

vi.mock("../src/extract", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, extractPage: extractPageMock };
});

import app from "../src/index";

const env = { ANTHROPIC_API_KEY: "test-key" };

beforeEach(() => {
  extractPageMock.mockReset();
  extractPageMock.mockResolvedValue(sample);
});

describe("POST /api/extract", () => {
  it("returns the extracted page for an image body", async () => {
    const res = await app.request(
      "/api/extract",
      { method: "POST", headers: { "Content-Type": "image/png" }, body: new Uint8Array([1, 2, 3]) },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(sample);
    expect(extractPageMock).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when the content-type is not an image", async () => {
    const res = await app.request(
      "/api/extract",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for an empty image body", async () => {
    const res = await app.request(
      "/api/extract",
      { method: "POST", headers: { "Content-Type": "image/png" }, body: new Uint8Array([]) },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 502 when extraction throws", async () => {
    extractPageMock.mockRejectedValueOnce(new Error("api down"));
    const res = await app.request(
      "/api/extract",
      { method: "POST", headers: { "Content-Type": "image/png" }, body: new Uint8Array([1, 2, 3]) },
      env,
    );
    expect(res.status).toBe(502);
  });
});
