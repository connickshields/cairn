import { describe, it, expect } from "vitest";
import { parseGps, deriveAnchors } from "../src/lib/anchors";
import type { EditableSegment } from "../src/store";

describe("parseGps", () => {
  it("reports empty for blank input", () => {
    expect(parseGps("")).toEqual({ status: "empty" });
    expect(parseGps("   ")).toEqual({ status: "empty" });
  });
  it("parses a valid coordinate", () => {
    const r = parseGps("N38°28.33' W120°12.45'");
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.lat).toBeCloseTo(38.4722, 4);
      expect(r.lon).toBeCloseTo(-120.2075, 4);
    }
  });
  it("reports error for garbage", () => {
    expect(parseGps("nope").status).toBe("error");
  });
});

describe("deriveAnchors", () => {
  const segs: EditableSegment[] = [
    {
      id: "s1",
      name: "Main",
      instructions: [
        { id: "a", fwdMile: "0.0", direction: "", text: "start", gpsRaw: "", flagged: false, note: "" },
        { id: "b", fwdMile: "1.8", direction: "BL", text: "anchor1", gpsRaw: "N38°28.33' W120°12.45'", flagged: false, note: "" },
        { id: "c", fwdMile: "2.8", direction: "SO", text: "bad", gpsRaw: "garbage", flagged: false, note: "" },
        { id: "d", fwdMile: "3.0", direction: "SO", text: "anchor2", gpsRaw: "N38°28.49' W120°13.26'", flagged: false, note: "" },
      ],
    },
  ];

  it("keeps only rows with a valid gps, in order, per segment", () => {
    const out = deriveAnchors(segs);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Main");
    expect(out[0].points.map((p) => p.text)).toEqual(["anchor1", "anchor2"]);
    expect(out[0].points[0].lat).toBeCloseTo(38.4722, 4);
  });
});
