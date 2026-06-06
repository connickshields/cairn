import { concatLegs, type RouteInput } from "@cairn/shared";
import type { RouteState, SegmentSnap } from "../store";

export function toRoutePayload(
  state: Pick<RouteState, "name" | "segments">,
  snapped?: Record<string, SegmentSnap>,
): RouteInput {
  return {
    name: state.name,
    segments: state.segments.map((seg) => {
      const snap = snapped?.[seg.id];
      const track = snap && snap.legs.length > 0 ? concatLegs(snap.legs) : undefined;
      return {
        name: seg.name,
        snappedTrack: track,
        instructions: seg.instructions.map((row) => {
          const n = Number(row.fwdMile);
          return {
            fwdMile: row.fwdMile.trim() === "" || Number.isNaN(n) ? null : n,
            direction: row.direction === "" ? null : row.direction,
            text: row.text,
            gps: row.gpsRaw.trim() === "" ? null : { raw: row.gpsRaw.trim() },
          };
        }),
      };
    }),
  };
}
