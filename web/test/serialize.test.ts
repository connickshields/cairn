import { describe, it, expect } from "vitest";
import { Route } from "@cairn/shared";
import { toRoutePayload } from "../src/lib/serialize";
import type { RouteState } from "../src/store";

const state = {
  name: "Calaveras",
  segments: [
    {
      id: "s1",
      name: "Spur",
      instructions: [
        { id: "a", fwdMile: "0.0", direction: "", text: "Continue north.", gpsRaw: "" },
        { id: "b", fwdMile: "1.8", direction: "BL", text: "Bear left.", gpsRaw: "N38°28.33' W120°12.45'" },
      ],
    },
  ],
} as unknown as RouteState;

describe("toRoutePayload", () => {
  it("maps the editable model to the API input shape", () => {
    const payload = toRoutePayload(state);
    expect(payload).toEqual({
      name: "Calaveras",
      segments: [
        {
          name: "Spur",
          instructions: [
            { fwdMile: 0, direction: null, text: "Continue north.", gps: null },
            { fwdMile: 1.8, direction: "BL", text: "Bear left.", gps: { raw: "N38°28.33' W120°12.45'" } },
          ],
        },
      ],
    });
  });

  it("produces a payload that the shared Route schema accepts", () => {
    expect(Route.safeParse(toRoutePayload(state)).success).toBe(true);
  });

  it("treats non-numeric mileage as null", () => {
    const bad = { ...state, segments: [{ ...state.segments[0], instructions: [{ id: "x", fwdMile: "abc", direction: "", text: "t", gpsRaw: "" }] }] } as unknown as RouteState;
    expect(toRoutePayload(bad).segments[0].instructions[0].fwdMile).toBeNull();
  });

  it("includes snappedTrack per segment when snap data is provided", () => {
    const snapped = { s1: { legs: [{ snapped: true, points: [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }] }] } };
    const payload = toRoutePayload(state, snapped);
    expect(payload.segments[0].snappedTrack).toEqual([{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }]);
  });

  it("omits snappedTrack when there is no snap data", () => {
    expect(toRoutePayload(state).segments[0].snappedTrack).toBeUndefined();
  });
});
