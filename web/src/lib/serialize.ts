import type { RouteInput } from "@cairn/shared";
import type { RouteState } from "../store";

export function toRoutePayload(state: Pick<RouteState, "name" | "segments">): RouteInput {
  return {
    name: state.name,
    segments: state.segments.map((seg) => ({
      name: seg.name,
      instructions: seg.instructions.map((row) => {
        const n = Number(row.fwdMile);
        return {
          fwdMile: row.fwdMile.trim() === "" || Number.isNaN(n) ? null : n,
          direction: row.direction === "" ? null : row.direction,
          text: row.text,
          gps: row.gpsRaw.trim() === "" ? null : { raw: row.gpsRaw.trim() },
        };
      }),
    })),
  };
}
