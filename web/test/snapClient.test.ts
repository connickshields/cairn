import { describe, it, expect } from "vitest";
import { buildSnapRequest, snapResponseToStore } from "../src/lib/snapClient";
import type { EditableSegment } from "../src/store";
import type { SnapResponse } from "@cairn/shared";

const segments: EditableSegment[] = [
  {
    id: "s1",
    name: "Spur",
    instructions: [
      { id: "a", fwdMile: "0.0", direction: "", text: "start", gpsRaw: "", flagged: false, note: "" },
      { id: "b", fwdMile: "1.8", direction: "BL", text: "Bear left onto 7N76Y.", gpsRaw: "N38°28.33' W120°12.45'", flagged: false, note: "" },
      { id: "c", fwdMile: "2.8", direction: "SO", text: "ends", gpsRaw: "N38°28.49' W120°13.26'", flagged: false, note: "" },
    ],
  },
];

describe("buildSnapRequest", () => {
  it("collects valid anchors in order and extracted road names per segment", () => {
    const req = buildSnapRequest(segments);
    expect(req.segments).toHaveLength(1);
    expect(req.segments[0].anchors).toHaveLength(2); // only the two parseable gps rows
    expect(req.segments[0].anchors[0].lat).toBeCloseTo(38.4722, 4);
    expect(req.segments[0].roadNames).toContain("7N76Y");
  });
});

describe("snapResponseToStore", () => {
  it("keys the per-segment legs by segment id, in order", () => {
    const resp: SnapResponse = { segments: [{ legs: [{ snapped: true, points: [{ lat: 1, lon: 2 }] }] }] };
    const map = snapResponseToStore(segments, resp);
    expect(map["s1"].legs[0].snapped).toBe(true);
  });
});
