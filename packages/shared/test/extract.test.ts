import { describe, it, expect } from "vitest";
import { ExtractedPage } from "../src/extract";

const validPage = {
  segments: [
    {
      name: "Spur to the top of Calaveras Dome",
      instructions: [
        { fwdMile: 0.0, direction: null, text: "Continue north.", gpsRaw: null, lowConfidence: false, note: null },
        {
          fwdMile: 1.8,
          direction: "BL",
          text: "Bear left onto 7N76Y.",
          gpsRaw: "N38°28.33' W120°12.45'",
          lowConfidence: true,
          note: "mileage smudged",
        },
      ],
    },
  ],
};

describe("ExtractedPage schema", () => {
  it("accepts a valid extracted page", () => {
    const parsed = ExtractedPage.parse(validPage);
    expect(parsed.segments[0].instructions[1].lowConfidence).toBe(true);
    expect(parsed.segments[0].instructions[1].gpsRaw).toBe("N38°28.33' W120°12.45'");
  });

  it("rejects an unknown direction code", () => {
    const bad = JSON.parse(JSON.stringify(validPage));
    bad.segments[0].instructions[1].direction = "XX";
    expect(ExtractedPage.safeParse(bad).success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const bad = JSON.parse(JSON.stringify(validPage));
    delete bad.segments[0].instructions[0].lowConfidence;
    expect(ExtractedPage.safeParse(bad).success).toBe(false);
  });
});
