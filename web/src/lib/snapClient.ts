import { SnapResponse, extractRoadNames, type SnapRequest } from "@cairn/shared";
import type { EditableSegment, SegmentSnap } from "../store";
import { parseGps } from "./anchors";
import { apiFetch } from "./apiClient";

export function buildSnapRequest(segments: EditableSegment[]): SnapRequest {
  return {
    segments: segments.map((seg) => {
      const anchors = seg.instructions.flatMap((r) => {
        const g = parseGps(r.gpsRaw);
        return g.status === "ok" ? [{ lat: g.lat, lon: g.lon }] : [];
      });
      const names = new Set<string>();
      for (const r of seg.instructions) for (const n of extractRoadNames(r.text)) names.add(n);
      return { anchors, roadNames: [...names] };
    }),
  };
}

export async function requestSnap(req: SnapRequest): Promise<SnapResponse> {
  const res = await apiFetch("/api/snap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Snap failed: ${res.status}`);
  return SnapResponse.parse(await res.json());
}

export function snapResponseToStore(
  segments: EditableSegment[],
  resp: SnapResponse,
): Record<string, SegmentSnap> {
  const out: Record<string, SegmentSnap> = {};
  segments.forEach((seg, i) => {
    const r = resp.segments[i];
    if (r) out[seg.id] = { legs: r.legs };
  });
  return out;
}
