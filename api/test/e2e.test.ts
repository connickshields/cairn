import { describe, it, expect } from "vitest";
import app from "../src/index";

// Real rows from the "Spur to the top of Calaveras Dome" sub-section.
const calaverasSpur = {
  name: "Calaveras Dome Trail",
  segments: [
    {
      name: "Spur to the top of Calaveras Dome",
      instructions: [
        { fwdMile: 0.0, text: "Continue to the north and pass through seasonal closure gate." },
        { fwdMile: 0.2, direction: "SO", text: "Track on left." },
        { fwdMile: 0.5, direction: "SO", text: "Cross over Moore Creek." },
        {
          fwdMile: 1.8,
          direction: "BL",
          text: "Track on right is 7N19. Bear left onto 7N76Y.",
          gps: { raw: "N38°28.33' W120°12.45'" },
        },
        { fwdMile: 2.3, direction: "SO", text: "Track on right. Road turns from gravel to graded dirt." },
        {
          fwdMile: 2.8,
          direction: "SO",
          text: "Track on left ends after 0.2 miles.",
          gps: { raw: "N38°28.49' W120°13.26'" },
        },
      ],
    },
  ],
};

describe("end-to-end GPX generation", () => {
  it("turns the Calaveras spur into valid GPX with two anchors", async () => {
    const res = await app.request("/api/gpx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(calaverasSpur),
    });
    expect(res.status).toBe(200);
    const gpx = await res.text();

    expect(gpx).toContain("<name>Spur to the top of Calaveras Dome</name>");
    expect((gpx.match(/<trkpt /g) ?? [])).toHaveLength(2);
    expect((gpx.match(/<wpt /g) ?? [])).toHaveLength(2);
    expect(gpx).toContain("<desc>Track on left ends after 0.2 miles.</desc>");
    expect(gpx).toContain('<trkpt lat="38.472167" lon="-120.207500">');
  });
});
