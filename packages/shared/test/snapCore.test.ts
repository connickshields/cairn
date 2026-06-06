import { describe, it, expect } from "vitest";
import { parseOverpassToGraph, type OverpassJson } from "../src/overpassGraph";
import { nearestNode, dijkstra, concatLegs, snapRoute } from "../src/snapCore";
import type { SnapRequest } from "../src/snap";

// A straight 3-node track plus a fork: from node 2 you can reach node 5 either via
// the short unnamed way 2-4-5 or the longer named way 2-6-5 (ref 7N76Y).
const json: OverpassJson = {
  elements: [
    { type: "node", id: 1, lat: 38.0, lon: -120.0 },
    { type: "node", id: 2, lat: 38.0, lon: -120.001 },
    { type: "node", id: 3, lat: 38.0, lon: -120.002 },
    { type: "node", id: 4, lat: 38.0005, lon: -120.0025 },
    { type: "node", id: 5, lat: 38.0, lon: -120.003 },
    { type: "node", id: 6, lat: 37.999, lon: -120.0025 },
    { type: "way", id: 10, nodes: [1, 2, 3], tags: { highway: "track" } },
    { type: "way", id: 11, nodes: [2, 4, 5], tags: { highway: "track" } },
    { type: "way", id: 12, nodes: [2, 6, 5], tags: { highway: "track", ref: "7N76Y" } },
  ],
};
const graph = parseOverpassToGraph(json);

describe("nearestNode", () => {
  it("finds the closest node within the radius", () => {
    expect(nearestNode(graph, { lat: 38.0, lon: -120.0009 }, 200)).toBe(2);
  });
  it("returns null when nothing is within the radius", () => {
    expect(nearestNode(graph, { lat: 40, lon: -100 }, 150)).toBeNull();
  });
});

describe("dijkstra", () => {
  it("takes the short way by default", () => {
    expect(dijkstra(graph, 2, 5, [])).toEqual([2, 4, 5]);
  });
  it("prefers the named way when its ref is requested", () => {
    expect(dijkstra(graph, 2, 5, ["7N76Y"])).toEqual([2, 6, 5]);
  });
});

describe("concatLegs", () => {
  it("concatenates and de-dups the shared boundary point", () => {
    const out = concatLegs([
      { points: [{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }] },
      { points: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }] },
    ]);
    expect(out).toEqual([{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }, { lat: 2, lon: 2 }]);
  });
});

describe("snapRoute", () => {
  it("snaps a leg along the graph and reports it snapped", () => {
    const req: SnapRequest = {
      segments: [{ anchors: [{ lat: 38.0, lon: -120.0 }, { lat: 38.0, lon: -120.002 }], roadNames: [] }],
    };
    const resp = snapRoute(req, graph, { snapRadiusM: 200 });
    expect(resp.segments[0].legs).toHaveLength(1);
    expect(resp.segments[0].legs[0].snapped).toBe(true);
    expect(resp.segments[0].legs[0].points.length).toBeGreaterThan(2);
  });
  it("falls back to a straight leg when an anchor can't snap", () => {
    const req: SnapRequest = {
      segments: [{ anchors: [{ lat: 38.0, lon: -120.0 }, { lat: 40.0, lon: -100.0 }], roadNames: [] }],
    };
    const resp = snapRoute(req, graph, { snapRadiusM: 150 });
    expect(resp.segments[0].legs[0].snapped).toBe(false);
    expect(resp.segments[0].legs[0].points).toEqual([
      { lat: 38.0, lon: -120.0 },
      { lat: 40.0, lon: -100.0 },
    ]);
  });
});
