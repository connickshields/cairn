import { describe, it, expect } from "vitest";
import { extractedPageToSegments } from "../src/lib/extractMap";
import type { ExtractedPage } from "@cairn/shared";

const page: ExtractedPage = {
  segments: [
    {
      name: "Spur",
      instructions: [
        { fwdMile: 0, direction: null, text: "Continue north.", gpsRaw: null, lowConfidence: false, note: null },
        { fwdMile: 1.8, direction: "BL", text: "Bear left.", gpsRaw: "N38°28.33' W120°12.45'", lowConfidence: true, note: "smudged" },
      ],
    },
  ],
};

describe("extractedPageToSegments", () => {
  it("maps the extracted page to editable segments with ids", () => {
    const segs = extractedPageToSegments(page);
    expect(segs).toHaveLength(1);
    expect(segs[0].id).toBeTruthy();
    expect(segs[0].name).toBe("Spur");

    const [a, b] = segs[0].instructions;
    expect(a).toMatchObject({ fwdMile: "0", direction: "", text: "Continue north.", gpsRaw: "", flagged: false, note: "" });
    expect(b).toMatchObject({ fwdMile: "1.8", direction: "BL", gpsRaw: "N38°28.33' W120°12.45'", flagged: true, note: "smudged" });
    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });
});
