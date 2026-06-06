import { z } from "zod";

export const GeoPoint = z.object({ lat: z.number(), lon: z.number() });
export type GeoPoint = z.infer<typeof GeoPoint>;

export interface Bbox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function computeBbox(points: GeoPoint[], padMeters: number): Bbox {
  if (points.length === 0) throw new Error("computeBbox: no points");
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  const latPad = padMeters / 111320;
  const lonScale = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180) || 1;
  const lonPad = padMeters / (111320 * lonScale);
  return { minLat: minLat - latPad, minLon: minLon - lonPad, maxLat: maxLat + latPad, maxLon: maxLon + lonPad };
}
