import { describe, it, expect } from "vitest";
import { haversineMeters, computeBbox, GeoPoint } from "../src/geo";

describe("haversineMeters", () => {
  it("is ~0 for the same point", () => {
    expect(haversineMeters({ lat: 38.47, lon: -120.2 }, { lat: 38.47, lon: -120.2 })).toBeCloseTo(0, 5);
  });
  it("matches a known short distance (~1 arc-minute of latitude ≈ 1852 m)", () => {
    const d = haversineMeters({ lat: 38.0, lon: -120.0 }, { lat: 38.0 + 1 / 60, lon: -120.0 });
    expect(d).toBeGreaterThan(1800);
    expect(d).toBeLessThan(1870);
  });
});

describe("computeBbox", () => {
  it("encloses the points and pads outward", () => {
    const b = computeBbox([{ lat: 38.4, lon: -120.3 }, { lat: 38.5, lon: -120.1 }], 300);
    expect(b.minLat).toBeLessThan(38.4);
    expect(b.maxLat).toBeGreaterThan(38.5);
    expect(b.minLon).toBeLessThan(-120.3);
    expect(b.maxLon).toBeGreaterThan(-120.1);
  });
  it("validates a GeoPoint", () => {
    expect(GeoPoint.safeParse({ lat: 1, lon: 2 }).success).toBe(true);
    expect(GeoPoint.safeParse({ lat: "x", lon: 2 }).success).toBe(false);
  });
});
