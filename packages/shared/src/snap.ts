import { z } from "zod";
import { GeoPoint } from "./geo";

export const SnapRequest = z.object({
  segments: z.array(
    z.object({
      anchors: z.array(GeoPoint),
      roadNames: z.array(z.string()),
    }),
  ),
});
export type SnapRequest = z.infer<typeof SnapRequest>;

export const SnapLeg = z.object({ snapped: z.boolean(), points: z.array(GeoPoint) });
export type SnapLeg = z.infer<typeof SnapLeg>;

export const SnapResponse = z.object({
  segments: z.array(z.object({ legs: z.array(SnapLeg) })),
});
export type SnapResponse = z.infer<typeof SnapResponse>;
