import { describe, it, expect } from "vitest";
import app from "../src/index";

const payload = {
  name: "Test Trail",
  segments: [
    {
      name: "Main",
      instructions: [
        {
          fwdMile: 1.8,
          direction: "BL",
          text: "Bear left onto 7N76Y.",
          gps: { raw: "N38°28.33' W120°12.45'" },
        },
      ],
    },
  ],
};

async function post(body: unknown): Promise<Response> {
  return app.request("/api/gpx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/gpx", () => {
  it("returns a GPX download for a valid route", async () => {
    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/gpx+xml");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    const text = await res.text();
    expect(text).toContain('<gpx version="1.1"');
    expect(text).toContain("<desc>Bear left onto 7N76Y.</desc>");
  });

  it("returns 400 for an invalid route", async () => {
    const res = await post({ name: "x", segments: "not an array" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when a gps raw string is malformed", async () => {
    const bad = structuredClone(payload);
    (bad.segments[0].instructions[0] as any).gps = { raw: "garbage" };
    const res = await post(bad);
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-JSON body", async () => {
    const res = await app.request("/api/gpx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    expect(res.status).toBe(400);
  });
});
