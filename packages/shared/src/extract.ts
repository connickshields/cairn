// Vision-extraction output schema. Defined with zod/v4 (not the v3 used by the rest of
// @cairn/shared) so it can be passed directly to the Anthropic SDK's zodOutputFormat,
// which requires v4 schemas. It's a plain schema with no transforms, so v4 is trivial here.
// The 2-letter direction codes are inlined rather than reusing the v3 `Direction` enum,
// because a v4 object cannot embed a v3 schema.
import { z } from "zod/v4";

export const ExtractedDirection = z.enum(["SO", "BL", "BR", "TL", "TR", "UT"]);

export const ExtractedInstruction = z.object({
  fwdMile: z.number().nullable(),
  direction: ExtractedDirection.nullable(),
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
