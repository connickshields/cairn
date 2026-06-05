import { describe, it, expect } from "vitest";
import { Route } from "../src/types";

const validRoute = {
  name: "Calaveras Dome Trail",
  segments: [
    {
      name: "Spur to the top of Calaveras Dome",
      instructions: [
        { fwdMile: 0.0, text: "Continue to the north and pass through seasonal closure gate." },
        { fwdMile: 0.2, direction: "SO", text: "Track on left." },
        {
          fwdMile: 1.8,
          direction: "BL",
          text: "Track on right is 7N19. Bear left onto 7N76Y.",
          gps: { raw: "N38°28.33' W120°12.45'" },
        },
      ],
    },
  ],
};

describe("Route schema", () => {
  it("accepts a valid route and fills decimal lat/lon from raw gps", () => {
    const parsed = Route.parse(validRoute);
    const gps = parsed.segments[0].instructions[2].gps;
    expect(gps).not.toBeNull();
    expect(gps!.raw).toBe("N38°28.33' W120°12.45'");
    expect(gps!.lat).toBeCloseTo(38.4722, 4);
    expect(gps!.lon).toBeCloseTo(-120.2075, 4);
  });

  it("normalizes omitted optional fields to null", () => {
    const parsed = Route.parse(validRoute);
    const first = parsed.segments[0].instructions[0];
    expect(first.direction).toBeNull();
    expect(first.gps).toBeNull();
  });

  it("rejects an unknown direction code", () => {
    const bad = structuredClone(validRoute);
    (bad.segments[0].instructions[1] as any).direction = "XX";
    expect(Route.safeParse(bad).success).toBe(false);
  });

  it("rejects a malformed gps raw string", () => {
    const bad = structuredClone(validRoute);
    (bad.segments[0].instructions[2] as any).gps = { raw: "garbage" };
    expect(Route.safeParse(bad).success).toBe(false);
  });
});
