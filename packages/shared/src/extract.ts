import { z } from "zod";
import { Direction } from "./types";

export const ExtractedInstruction = z.object({
  fwdMile: z.number().nullable(),
  direction: Direction.nullable(),
  text: z.string(),
  gpsRaw: z.string().nullable(),
  lowConfidence: z.boolean(),
  note: z.string().nullable(),
});
export type ExtractedInstruction = z.infer<typeof ExtractedInstruction>;

export const ExtractedSegment = z.object({
  name: z.string(),
  instructions: z.array(ExtractedInstruction),
});
export type ExtractedSegment = z.infer<typeof ExtractedSegment>;

export const ExtractedPage = z.object({
  segments: z.array(ExtractedSegment),
});
export type ExtractedPage = z.infer<typeof ExtractedPage>;
