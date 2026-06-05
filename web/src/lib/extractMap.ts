import type { ExtractedPage } from "@cairn/shared";
import type { EditableInstruction, EditableSegment } from "../store";

const uid = () => crypto.randomUUID();

export function extractedPageToSegments(page: ExtractedPage): EditableSegment[] {
  return page.segments.map((seg) => ({
    id: uid(),
    name: seg.name,
    instructions: seg.instructions.map(
      (i): EditableInstruction => ({
        id: uid(),
        fwdMile: i.fwdMile === null ? "" : String(i.fwdMile),
        direction: i.direction ?? "",
        text: i.text,
        gpsRaw: i.gpsRaw ?? "",
        flagged: i.lowConfidence,
        note: i.note ?? "",
      }),
    ),
  }));
}
