import { describe, it, expect } from "vitest";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { buildGpx } from "../src/gpx";
import type { Route } from "../src/types";

const route: Route = {
  name: "Test Trail",
  segments: [
    {
      name: "Main",
      instructions: [
        { fwdMile: 0.0, direction: null, text: "Start; go north.", gps: null },
        {
          fwdMile: 1.8,
          direction: "BL",
          text: "Bear left onto 7N76Y.",
          gps: { raw: "N38°28.33' W120°12.45'", lat: 38.472167, lon: -120.2075 },
        },
        {
          fwdMile: 2.8,
          direction: "SO",
          text: "Track on left ends & <done>.",
          gps: { raw: "N38°28.49' W120°13.26'", lat: 38.474833, lon: -120.221 },
        },
      ],
    },
  ],
};

describe("buildGpx", () => {
  const gpx = buildGpx(route);

  it("is a GPX 1.1 document", () => {
    expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(gpx).toContain('<gpx version="1.1"');
  });

  it("is well-formed XML that parses back to a gpx root", () => {
    expect(XMLValidator.validate(gpx)).toBe(true);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(gpx);
    expect(parsed.gpx).toBeDefined();
    expect(parsed.gpx.trk.name).toBe("Main");
  });

  it("emits one track named after the segment with the gps anchors as trkpts", () => {
    expect(gpx).toContain("<name>Main</name>");
    const trkpts = gpx.match(/<trkpt /g) ?? [];
    expect(trkpts).toHaveLength(2);
    expect(gpx).toContain('<trkpt lat="38.472167" lon="-120.207500">');
  });

  it("emits a waypoint per gps-bearing instruction with text in desc and mileage in cmt", () => {
    const wpts = gpx.match(/<wpt /g) ?? [];
    expect(wpts).toHaveLength(2);
    expect(gpx).toContain("<desc>Bear left onto 7N76Y.</desc>");
    expect(gpx).toContain("<cmt>mile 1.8</cmt>");
  });

  it("escapes XML special characters in an emitted waypoint's text", () => {
    expect(gpx).toContain("Track on left ends &amp; &lt;done&gt;.");
  });
});
