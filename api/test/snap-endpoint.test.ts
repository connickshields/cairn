import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../src/index";

const overpassJson = {
  elements: [
    { type: "node", id: 1, lat: 38.0, lon: -120.0 },
    { type: "node", id: 2, lat: 38.0, lon: -120.001 },
    { type: "node", id: 3, lat: 38.0, lon: -120.002 },
    { type: "way", id: 10, nodes: [1, 2, 3], tags: { highway: "track" } },
  ],
};

const env = { ANTHROPIC_API_KEY: "x", OVERPASS_URL: "https://overpass.test/api" };

const body = {
  segments: [{ anchors: [{ lat: 38.0, lon: -120.0 }, { lat: 38.0, lon: -120.002 }], roadNames: [] }],
};

function post(b: unknown) {
  return app.request(
    "/api/snap",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) },
    env,
  );
}

beforeEach(() => vi.unstubAllGlobals());

describe("POST /api/snap", () => {
  it("returns snapped geometry for a valid request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(overpassJson), { status: 200 })));
    const res = await post(body);
    expect(res.status).toBe(200);
    const json = await res.json() as { segments: { legs: { snapped: boolean; points: unknown[] }[] }[] };
    expect(json.segments[0].legs[0].snapped).toBe(true);
    expect(json.segments[0].legs[0].points.length).toBeGreaterThan(2);
  });

  it("returns 400 for an invalid request body", async () => {
    const res = await post({ segments: "nope" });
    expect(res.status).toBe(400);
  });

  it("returns 502 when Overpass fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
    const res = await post(body);
    expect(res.status).toBe(502);
  });
});
