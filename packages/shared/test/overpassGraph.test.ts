import { describe, it, expect } from "vitest";
import { buildOverpassQuery, parseOverpassToGraph, costFactor, type OverpassJson } from "../src/overpassGraph";

const json: OverpassJson = {
  elements: [
    { type: "node", id: 1, lat: 38.0, lon: -120.0 },
    { type: "node", id: 2, lat: 38.0, lon: -120.001 },
    { type: "node", id: 3, lat: 38.0, lon: -120.002 },
    { type: "way", id: 10, nodes: [1, 2, 3], tags: { highway: "track", ref: "7N76Y" } },
  ],
};

describe("buildOverpassQuery", () => {
  it("targets the bbox and asks for json", () => {
    const q = buildOverpassQuery({ minLat: 1, minLon: 2, maxLat: 3, maxLon: 4 });
    expect(q).toContain("[out:json]");
    expect(q).toContain("(1,2,3,4)");
    expect(q).toContain("highway");
  });
});

describe("parseOverpassToGraph", () => {
  it("builds bidirectional edges along a way with its tags", () => {
    const g = parseOverpassToGraph(json);
    expect(g.nodes.size).toBe(3);
    expect(g.adj.get(1)!.map((e) => e.to)).toEqual([2]);
    expect(g.adj.get(2)!.map((e) => e.to).sort()).toEqual([1, 3]);
    expect(g.adj.get(1)![0].tags).toMatchObject({ highway: "track", ref: "7N76Y" });
    expect(g.adj.get(1)![0].lengthM).toBeGreaterThan(0);
  });
});

describe("costFactor", () => {
  it("favors tracks over paved roads, with an unpaved discount", () => {
    expect(costFactor({ highway: "track" })).toBe(1);
    expect(costFactor({ highway: "primary" })).toBe(2);
    expect(costFactor({ highway: "tertiary" })).toBe(1.5);
    expect(costFactor({ highway: "track", surface: "gravel" })).toBeCloseTo(0.8, 5);
  });
});
