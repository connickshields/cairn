import { describe, it, expect } from "vitest";
import { SnapRequest, SnapResponse } from "../src/snap";
import { Route } from "../src/types";

describe("SnapRequest / SnapResponse", () => {
  it("accepts a valid request", () => {
    const req = { segments: [{ anchors: [{ lat: 1, lon: 2 }], roadNames: ["7N76Y"] }] };
    expect(SnapRequest.safeParse(req).success).toBe(true);
  });
  it("accepts a valid response with per-leg geometry", () => {
    const resp = { segments: [{ legs: [{ snapped: true, points: [{ lat: 1, lon: 2 }] }] }] };
    expect(SnapResponse.safeParse(resp).success).toBe(true);
  });
});

describe("Route.snappedTrack", () => {
  it("accepts an optional snappedTrack on a segment", () => {
    const route = {
      name: "r",
      segments: [{ name: "s", instructions: [], snappedTrack: [{ lat: 1, lon: 2 }] }],
    };
    const parsed = Route.parse(route);
    expect(parsed.segments[0].snappedTrack).toEqual([{ lat: 1, lon: 2 }]);
  });
  it("still accepts a segment without snappedTrack", () => {
    expect(Route.safeParse({ name: "r", segments: [{ name: "s", instructions: [] }] }).success).toBe(true);
  });
});
