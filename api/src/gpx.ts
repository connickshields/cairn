import type { Instruction, Route, RouteSegment } from "./types";

export function buildGpx(route: Route): string {
  const waypoints = route.segments
    .flatMap((segment) => segment.instructions)
    .filter((i) => i.gps !== null)
    .map(buildWaypoint);
  const tracks = route.segments.map(buildTrack);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="cairn" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${esc(route.name)}</name></metadata>`,
    ...waypoints,
    ...tracks,
    "</gpx>",
    "",
  ].join("\n");
}

function buildWaypoint(i: Instruction): string {
  const g = i.gps!;
  const label = [i.direction, i.fwdMile !== null ? `mi ${i.fwdMile}` : null]
    .filter((p): p is string => p !== null)
    .join(" ") || "wpt";
  const cmt = i.fwdMile !== null ? `mile ${i.fwdMile}` : "";
  return [
    `  <wpt lat="${fmt(g.lat)}" lon="${fmt(g.lon)}">`,
    `    <name>${esc(label)}</name>`,
    `    <desc>${esc(i.text)}</desc>`,
    `    <cmt>${esc(cmt)}</cmt>`,
    "  </wpt>",
  ].join("\n");
}

function buildTrack(segment: RouteSegment): string {
  const points = segment.instructions
    .filter((i) => i.gps !== null)
    .map((i) => `      <trkpt lat="${fmt(i.gps!.lat)}" lon="${fmt(i.gps!.lon)}"></trkpt>`);
  return [
    "  <trk>",
    `    <name>${esc(segment.name)}</name>`,
    "    <trkseg>",
    ...points,
    "    </trkseg>",
    "  </trk>",
  ].join("\n");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt(n: number): string {
  return n.toFixed(6);
}
