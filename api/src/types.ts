import { z } from "zod";
import { parseDmsCoordinate } from "./coords";

export const Direction = z.enum(["SO", "BL", "BR", "TL", "TR", "UT"]);
export type Direction = z.infer<typeof Direction>;

export interface GpsFix {
  raw: string;
  lat: number;
  lon: number;
}

// Input is just { raw }; the transform fills decimal lat/lon via the parser.
const GpsFixInput = z
  .object({ raw: z.string() })
  .transform((value, ctx): GpsFix => {
    try {
      const { lat, lon } = parseDmsCoordinate(value.raw);
      return { raw: value.raw, lat, lon };
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: (err as Error).message,
      });
      return z.NEVER;
    }
  });

export const Instruction = z.object({
  fwdMile: z.number().nullish().transform((v) => v ?? null),
  direction: Direction.nullish().transform((v) => v ?? null),
  text: z.string(),
  gps: GpsFixInput.nullish().transform((v) => v ?? null),
});
export type Instruction = z.infer<typeof Instruction>;

export const RouteSegment = z.object({
  name: z.string(),
  instructions: z.array(Instruction),
});
export type RouteSegment = z.infer<typeof RouteSegment>;

export const Route = z.object({
  name: z.string(),
  segments: z.array(RouteSegment),
});
export type Route = z.infer<typeof Route>;
