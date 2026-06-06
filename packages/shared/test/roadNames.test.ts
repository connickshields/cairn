import { describe, it, expect } from "vitest";
import { extractRoadNames } from "../src/roadNames";

describe("extractRoadNames", () => {
  it("pulls forest-service refs", () => {
    expect(extractRoadNames("Bear left onto 7N76Y.")).toEqual(["7N76Y"]);
    expect(extractRoadNames("Track on right is 7N19. Bear left onto 7N76Y.").sort()).toEqual(["7N19", "7N76Y"]);
  });
  it("pulls a Route designation", () => {
    expect(extractRoadNames("Graded road on right is 7N16 (Route 6H).").sort()).toEqual(["6H", "7N16"]);
  });
  it("returns nothing for plain text", () => {
    expect(extractRoadNames("Track on left.")).toEqual([]);
  });
});
