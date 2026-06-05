import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ExtractedPage, type ExtractedPage as ExtractedPageT } from "@cairn/shared";

export const ALLOWED_MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type MediaType = (typeof ALLOWED_MEDIA)[number];

export const EXTRACTION_SYSTEM = [
  "You read a single scanned page from a printed overland/4x4 route guide and return its rows as structured data.",
  "",
  "The page is two-column. Read the LEFT column top-to-bottom, then the RIGHT column top-to-bottom.",
  "Each row has: a forward mileage (a small number next to a down-triangle ▼), an optional 2-letter direction code, and a description.",
  "Direction codes: SO (straight over), BL (bear left), BR (bear right), TL (turn left), TR (turn right), UT (u-turn). If a row has no code, use null.",
  "Capture the FORWARD view only (the black text and the ▼ mileage). IGNORE the reverse view (the blue text and the up-triangle ▲ mileage).",
  "Bold standalone headers (e.g. 'Spur to the top of Calaveras Dome', 'Continuation of Main Trail') are SEGMENT boundaries: start a new segment with that name. Rows before the first header belong to a segment with name \"\".",
  "GPS fixes appear as highlighted full-width bars like 'GPS: N38°28.59' W120°10.43''. Put the coordinate EXACTLY as printed into gpsRaw (do NOT convert to decimal). Rows without a fix have gpsRaw null.",
  "Set lowConfidence true and give a short note for any cell you are unsure about (smudged number, ambiguous code, hard-to-read coordinate). Otherwise lowConfidence false and note null.",
  "Transcribe descriptions verbatim. Do not invent rows or coordinates.",
].join("\n");

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function extractPage(opts: {
  client: Anthropic;
  imageBase64: string;
  mediaType: MediaType;
}): Promise<ExtractedPageT> {
  const res = await opts.client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(ExtractedPage) },
    system: EXTRACTION_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: opts.mediaType, data: opts.imageBase64 } },
          { type: "text", text: "Extract every row from this route-guide page into the schema." },
        ],
      },
    ],
  });
  if (!res.parsed_output) throw new Error("Extraction returned no structured output");
  return res.parsed_output as ExtractedPageT;
}
