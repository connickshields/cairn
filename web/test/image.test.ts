import { describe, it, expect } from "vitest";
import { computeDownsize } from "../src/lib/image";

describe("computeDownsize", () => {
  it("leaves images at or under the cap unchanged", () => {
    expect(computeDownsize(1600, 1200, 2200)).toEqual({ width: 1600, height: 1200 });
  });
  it("scales the long edge down to the cap, preserving aspect ratio", () => {
    expect(computeDownsize(4400, 2200, 2200)).toEqual({ width: 2200, height: 1100 });
  });
  it("handles a tall image", () => {
    expect(computeDownsize(2000, 4000, 2000)).toEqual({ width: 1000, height: 2000 });
  });
});
