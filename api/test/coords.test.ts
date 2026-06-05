import { describe, it, expect } from "vitest";
import { parseDmsCoordinate } from "../src/coords";

describe("parseDmsCoordinate", () => {
  it("parses the sample coordinate to decimal degrees", () => {
    const { lat, lon } = parseDmsCoordinate("N38°28.59' W120°10.43'");
    expect(lat).toBeCloseTo(38.4765, 4);
    expect(lon).toBeCloseTo(-120.1738, 4);
  });

  it("makes south and west negative", () => {
    const { lat, lon } = parseDmsCoordinate("S01°30.00' E000°15.00'");
    expect(lat).toBeCloseTo(-1.5, 6);
    expect(lon).toBeCloseTo(0.25, 6);
  });

  it("tolerates extra whitespace and a prime symbol", () => {
    const { lat, lon } = parseDmsCoordinate("  N38°28.59′   W120°10.43′  ");
    expect(lat).toBeCloseTo(38.4765, 4);
    expect(lon).toBeCloseTo(-120.1738, 4);
  });

  it("throws on unparseable input", () => {
    expect(() => parseDmsCoordinate("not a coordinate")).toThrow();
  });

  it("throws when minutes are out of range", () => {
    expect(() => parseDmsCoordinate("N38°60.00' W120°10.43'")).toThrow();
  });
});
