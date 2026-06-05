import { parseDmsCoordinate } from "@cairn/shared";
import type { EditableSegment } from "../store";

export type GpsParse =
  | { status: "empty" }
  | { status: "ok"; lat: number; lon: number }
  | { status: "error" };

export function parseGps(raw: string): GpsParse {
  if (raw.trim() === "") return { status: "empty" };
  try {
    const { lat, lon } = parseDmsCoordinate(raw);
    return { status: "ok", lat, lon };
  } catch {
    return { status: "error" };
  }
}

export interface AnchorPoint {
  id: string;
  lat: number;
  lon: number;
  text: string;
  fwdMile: string;
}

export interface SegmentAnchors {
  id: string;
  name: string;
  points: AnchorPoint[];
}

export function deriveAnchors(segments: EditableSegment[]): SegmentAnchors[] {
  return segments.map((seg) => ({
    id: seg.id,
    name: seg.name,
    points: seg.instructions.flatMap((row) => {
      const g = parseGps(row.gpsRaw);
      if (g.status !== "ok") return [];
      return [{ id: row.id, lat: g.lat, lon: g.lon, text: row.text, fwdMile: row.fwdMile }];
    }),
  }));
}
