# Phase 4 Road Snapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Snap a route's GPS anchors to real OSM road geometry via a `POST /api/snap` Worker endpoint (Overpass + a track-favoring, name-biased shortest path), surface it behind a "Snap to roads" toggle, and bake the snapped track into the GPX.

**Architecture:** A pure snapping pipeline in `@cairn/shared` (bbox → Overpass→graph → cost/name-weighted Dijkstra per leg → per-leg straight fallback). The Worker endpoint fetches Overpass once per request and runs the pipeline. The editable `Route` gains an optional `snappedTrack`; the GPX writer uses it when present. The frontend toggles snapping, renders snapped/fallback legs on the map, invalidates on edit, and includes the geometry in the download.

**Tech Stack:** TypeScript · npm workspaces · zod (v3) · Cloudflare Workers (Hono) · Overpass API · React + Vite + react-leaflet · vitest.

Spec: `docs/superpowers/specs/2026-06-06-phase4-road-snapping-design.md`

---

## File Structure

```
packages/shared/
  src/geo.ts            GeoPoint zod + Bbox, haversineMeters, computeBbox
  src/roadNames.ts      extractRoadNames(text)
  src/overpassGraph.ts  Overpass JSON types, ROAD_HIGHWAYS, buildOverpassQuery, parseOverpassToGraph, costFactor
  src/snap.ts           SnapRequest / SnapResponse zod schemas
  src/snapCore.ts       nearestNode, matchesName, edgeWeight, dijkstra, concatLegs, snapRoute
  src/types.ts          (modify) RouteSegment gains optional snappedTrack
  src/index.ts          (modify) re-export the new modules
  test/*.test.ts
api/
  src/index.ts          (modify) POST /api/snap + Env.OVERPASS_URL
  src/gpx.ts            (modify) use segment.snappedTrack for trkpts when present
  test/snap-endpoint.test.ts, test/gpx.test.ts (modify)
web/
  src/store.ts          (modify) snapEnabled + snapped + setSnapEnabled/setSnapped/clearSnap; mutations invalidate snap
  src/lib/snapClient.ts buildSnapRequest, requestSnap, snapResponseToStore
  src/lib/serialize.ts  (modify) toRoutePayload includes snappedTrack
  src/components/ReviewView.tsx  (modify) "Snap to roads" toggle
  src/components/MapPanel.tsx     (modify) render snapped/fallback legs
  src/components/DownloadButton.tsx (modify) include snapped geometry
  test/*.test.ts
```

**Commands run from the repo root with the workspace flag.** All deps are already installed (Overpass needs no key/package).

---

### Task 1: `geo.ts` — point, bbox, distance

**Files:** Create `packages/shared/src/geo.ts`, `packages/shared/test/geo.test.ts`.

- [ ] **Step 1: Write the failing test** — Create `packages/shared/test/geo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { haversineMeters, computeBbox, GeoPoint } from "../src/geo";

describe("haversineMeters", () => {
  it("is ~0 for the same point", () => {
    expect(haversineMeters({ lat: 38.47, lon: -120.2 }, { lat: 38.47, lon: -120.2 })).toBeCloseTo(0, 5);
  });
  it("matches a known short distance (~1 arc-minute of latitude ≈ 1852 m)", () => {
    const d = haversineMeters({ lat: 38.0, lon: -120.0 }, { lat: 38.0 + 1 / 60, lon: -120.0 });
    expect(d).toBeGreaterThan(1800);
    expect(d).toBeLessThan(1870);
  });
});

describe("computeBbox", () => {
  it("encloses the points and pads outward", () => {
    const b = computeBbox([{ lat: 38.4, lon: -120.3 }, { lat: 38.5, lon: -120.1 }], 300);
    expect(b.minLat).toBeLessThan(38.4);
    expect(b.maxLat).toBeGreaterThan(38.5);
    expect(b.minLon).toBeLessThan(-120.3);
    expect(b.maxLon).toBeGreaterThan(-120.1);
  });
  it("validates a GeoPoint", () => {
    expect(GeoPoint.safeParse({ lat: 1, lon: 2 }).success).toBe(true);
    expect(GeoPoint.safeParse({ lat: "x", lon: 2 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace @cairn/shared -- geo`. Expected: FAIL (cannot resolve `../src/geo`).

- [ ] **Step 3: Write `packages/shared/src/geo.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify pass** — Run: `npm test --workspace @cairn/shared -- geo` (4 tests) then `npm run typecheck --workspace @cairn/shared` (exit 0).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/geo.ts packages/shared/test/geo.test.ts
git commit -m "feat(shared): geo helpers (GeoPoint, haversine, bbox)"
```

---

### Task 2: `roadNames.ts` — extract road designations

**Files:** Create `packages/shared/src/roadNames.ts`, `packages/shared/test/roadNames.test.ts`.

- [ ] **Step 1: Write the failing test** — Create `packages/shared/test/roadNames.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractRoadNames } from "../src/roadNames";

describe("extractRoadNames", () => {
  it("pulls forest-service refs", () => {
    expect(extractRoadNames("Bear left onto 7N76Y.")).toEqual(["7N76Y"]);
    expect(extractRoadNames("Track on right is 7N19. Bear left onto 7N76Y.").sort()).toEqual(["7N19", "7N76Y"]);
  });
  it("pulls a Route designation", () => {
    expect(extractRoadNames("Graded road on right is 7N16 (Route 6H).").sort()).toEqual(["6H", "7N16"]);
  });
  it("returns nothing for plain text", () => {
    expect(extractRoadNames("Track on left.")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace @cairn/shared -- roadNames`. Expected: FAIL.

- [ ] **Step 3: Write `packages/shared/src/roadNames.ts`**

```ts
// Pull road designations a route guide cites, e.g. "7N09", "7N76Y", "Route 6H", "US-50".
export function extractRoadNames(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.match(/\b\d{1,2}N\d{1,2}[A-Z]?\b/g) ?? []) out.add(m.toUpperCase());
  for (const m of text.match(/\bRoute\s+[A-Z0-9]+\b/gi) ?? []) out.add(m.replace(/Route\s+/i, "").toUpperCase());
  for (const m of text.match(/\b(?:I|US|SR|CR)-?\d+\b/gi) ?? []) out.add(m.toUpperCase().replace(/-/g, ""));
  return [...out];
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npm test --workspace @cairn/shared -- roadNames` (3 tests) then `npm run typecheck --workspace @cairn/shared` (exit 0).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/roadNames.ts packages/shared/test/roadNames.test.ts
git commit -m "feat(shared): extract road designations from instruction text"
```

---

### Task 3: `overpassGraph.ts` — query, parse to graph, costing

**Files:** Create `packages/shared/src/overpassGraph.ts`, `packages/shared/test/overpassGraph.test.ts`.

- [ ] **Step 1: Write the failing test** — Create `packages/shared/test/overpassGraph.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildOverpassQuery, parseOverpassToGraph, costFactor, type OverpassJson } from "../src/overpassGraph";

const json: OverpassJson = {
  elements: [
    { type: "node", id: 1, lat: 38.0, lon: -120.0 },
    { type: "node", id: 2, lat: 38.0, lon: -120.001 },
    { type: "node", id: 3, lat: 38.0, lon: -120.002 },
    { type: "way", id: 10, nodes: [1, 2, 3], tags: { highway: "track", ref: "7N76Y" } },
  ],
};

describe("buildOverpassQuery", () => {
  it("targets the bbox and asks for json", () => {
    const q = buildOverpassQuery({ minLat: 1, minLon: 2, maxLat: 3, maxLon: 4 });
    expect(q).toContain("[out:json]");
    expect(q).toContain("(1,2,3,4)");
    expect(q).toContain("highway");
  });
});

describe("parseOverpassToGraph", () => {
  it("builds bidirectional edges along a way with its tags", () => {
    const g = parseOverpassToGraph(json);
    expect(g.nodes.size).toBe(3);
    expect(g.adj.get(1)!.map((e) => e.to)).toEqual([2]);
    expect(g.adj.get(2)!.map((e) => e.to).sort()).toEqual([1, 3]);
    expect(g.adj.get(1)![0].tags).toMatchObject({ highway: "track", ref: "7N76Y" });
    expect(g.adj.get(1)![0].lengthM).toBeGreaterThan(0);
  });
});

describe("costFactor", () => {
  it("favors tracks over paved roads, with an unpaved discount", () => {
    expect(costFactor({ highway: "track" })).toBe(1);
    expect(costFactor({ highway: "primary" })).toBe(2);
    expect(costFactor({ highway: "tertiary" })).toBe(1.5);
    expect(costFactor({ highway: "track", surface: "gravel" })).toBeCloseTo(0.8, 5);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace @cairn/shared -- overpassGraph`. Expected: FAIL.

- [ ] **Step 3: Write `packages/shared/src/overpassGraph.ts`**

```ts
import { haversineMeters } from "./geo";

export const ROAD_HIGHWAYS = [
  "track",
  "unclassified",
  "service",
  "residential",
  "road",
  "tertiary",
  "secondary",
  "primary",
];

export interface WayTags {
  highway?: string;
  surface?: string;
  ref?: string;
  name?: string;
}

export interface GraphNode {
  id: number;
  lat: number;
  lon: number;
}

export interface GraphEdge {
  to: number;
  lengthM: number;
  tags: WayTags;
}

export interface Graph {
  nodes: Map<number, GraphNode>;
  adj: Map<number, GraphEdge[]>;
}

export interface OverpassNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
}
export interface OverpassWay {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}
export type OverpassElement = OverpassNode | OverpassWay;
export interface OverpassJson {
  elements: OverpassElement[];
}

export function buildOverpassQuery(bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number }): string {
  const filter = ROAD_HIGHWAYS.join("|");
  const b = `(${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon})`;
  return `[out:json][timeout:25];way["highway"~"^(${filter})$"]${b};(._;>;);out body;`;
}

export function costFactor(tags: WayTags): number {
  let f: number;
  switch (tags.highway) {
    case "primary":
    case "secondary":
      f = 2;
      break;
    case "tertiary":
      f = 1.5;
      break;
    default:
      f = 1;
  }
  if (["unpaved", "dirt", "gravel", "ground", "compacted", "fine_gravel"].includes(tags.surface ?? "")) {
    f *= 0.8;
  }
  return f;
}

export function parseOverpassToGraph(json: OverpassJson): Graph {
  const nodes = new Map<number, GraphNode>();
  for (const el of json.elements) {
    if (el.type === "node") nodes.set(el.id, { id: el.id, lat: el.lat, lon: el.lon });
  }
  const adj = new Map<number, GraphEdge[]>();
  const addEdge = (from: number, to: number, lengthM: number, tags: WayTags) => {
    const list = adj.get(from) ?? [];
    list.push({ to, lengthM, tags });
    adj.set(from, list);
  };
  for (const el of json.elements) {
    if (el.type !== "way") continue;
    const tags: WayTags = {
      highway: el.tags?.highway,
      surface: el.tags?.surface,
      ref: el.tags?.ref,
      name: el.tags?.name,
    };
    for (let i = 0; i + 1 < el.nodes.length; i++) {
      const a = nodes.get(el.nodes[i]);
      const b = nodes.get(el.nodes[i + 1]);
      if (!a || !b) continue;
      const len = haversineMeters(a, b);
      addEdge(a.id, b.id, len, tags);
      addEdge(b.id, a.id, len, tags);
    }
  }
  return { nodes, adj };
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npm test --workspace @cairn/shared -- overpassGraph` (3 tests) then `npm run typecheck --workspace @cairn/shared` (exit 0).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/overpassGraph.ts packages/shared/test/overpassGraph.test.ts
git commit -m "feat(shared): Overpass query + JSON→graph + road costing"
```

---

### Task 4: snap request/response schemas + Route.snappedTrack + index

**Files:** Create `packages/shared/src/snap.ts`, `packages/shared/test/snap.test.ts`; Modify `packages/shared/src/types.ts`, `packages/shared/src/index.ts`.

- [ ] **Step 1: Write the failing test** — Create `packages/shared/test/snap.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SnapRequest, SnapResponse } from "../src/snap";
import { Route } from "../src/types";

describe("SnapRequest / SnapResponse", () => {
  it("accepts a valid request", () => {
    const req = { segments: [{ anchors: [{ lat: 1, lon: 2 }], roadNames: ["7N76Y"] }] };
    expect(SnapRequest.safeParse(req).success).toBe(true);
  });
  it("accepts a valid response with per-leg geometry", () => {
    const resp = { segments: [{ legs: [{ snapped: true, points: [{ lat: 1, lon: 2 }] }] }] };
    expect(SnapResponse.safeParse(resp).success).toBe(true);
  });
});

describe("Route.snappedTrack", () => {
  it("accepts an optional snappedTrack on a segment", () => {
    const route = {
      name: "r",
      segments: [{ name: "s", instructions: [], snappedTrack: [{ lat: 1, lon: 2 }] }],
    };
    const parsed = Route.parse(route);
    expect(parsed.segments[0].snappedTrack).toEqual([{ lat: 1, lon: 2 }]);
  });
  it("still accepts a segment without snappedTrack", () => {
    expect(Route.safeParse({ name: "r", segments: [{ name: "s", instructions: [] }] }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace @cairn/shared -- "snap"`. Expected: FAIL (cannot resolve `../src/snap`).

- [ ] **Step 3: Write `packages/shared/src/snap.ts`**

```ts
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
```

- [ ] **Step 4: Add `snappedTrack` to `RouteSegment` in `packages/shared/src/types.ts`** — add the import and the optional field. Change the top import line to include geo, and update `RouteSegment`:

```ts
import { z } from "zod";
import { parseDmsCoordinate } from "./coords";
import { GeoPoint } from "./geo";
```

```ts
export const RouteSegment = z.object({
  name: z.string(),
  instructions: z.array(Instruction),
  snappedTrack: z.array(GeoPoint).optional(),
});
export type RouteSegment = z.infer<typeof RouteSegment>;
```

(Leave everything else in `types.ts` unchanged.)

- [ ] **Step 5: Re-export from `packages/shared/src/index.ts`** — change it to exactly this (no `./snapCore` line yet — that module is created in Task 5, which appends its export):

```ts
export * from "./coords";
export * from "./types";
export * from "./extract";
export * from "./geo";
export * from "./roadNames";
export * from "./overpassGraph";
export * from "./snap";
```

- [ ] **Step 6: Run to verify pass** — Run: `npm test --workspace @cairn/shared -- "snap"` (the `snap.test.ts` — 4 tests) then `npm run typecheck --workspace @cairn/shared` (exit 0). Also run `npm test --workspace api` to confirm the `Route` change didn't break the api's gpx/route tests (10+ tests still green).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/snap.ts packages/shared/src/types.ts packages/shared/src/index.ts packages/shared/test/snap.test.ts
git commit -m "feat(shared): snap request/response schemas + Route.snappedTrack"
```

---

### Task 5: `snapCore.ts` — snap, weighting, Dijkstra, snapRoute

**Files:** Create `packages/shared/src/snapCore.ts`, `packages/shared/test/snapCore.test.ts`; Modify `packages/shared/src/index.ts`.

- [ ] **Step 1: Write the failing test** — Create `packages/shared/test/snapCore.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseOverpassToGraph, type OverpassJson } from "../src/overpassGraph";
import { nearestNode, dijkstra, concatLegs, snapRoute } from "../src/snapCore";
import type { SnapRequest } from "../src/snap";

// A straight 3-node track plus a fork: from node 2 you can reach node 5 either via
// the short unnamed way 2-4-5 or the longer named way 2-6-5 (ref 7N76Y).
const json: OverpassJson = {
  elements: [
    { type: "node", id: 1, lat: 38.0, lon: -120.0 },
    { type: "node", id: 2, lat: 38.0, lon: -120.001 },
    { type: "node", id: 3, lat: 38.0, lon: -120.002 },
    { type: "node", id: 4, lat: 38.0005, lon: -120.0025 },
    { type: "node", id: 5, lat: 38.0, lon: -120.003 },
    { type: "node", id: 6, lat: 37.999, lon: -120.0025 },
    { type: "way", id: 10, nodes: [1, 2, 3], tags: { highway: "track" } },
    { type: "way", id: 11, nodes: [2, 4, 5], tags: { highway: "track" } },
    { type: "way", id: 12, nodes: [2, 6, 5], tags: { highway: "track", ref: "7N76Y" } },
  ],
};
const graph = parseOverpassToGraph(json);

describe("nearestNode", () => {
  it("finds the closest node within the radius", () => {
    expect(nearestNode(graph, { lat: 38.0, lon: -120.0009 }, 200)).toBe(2);
  });
  it("returns null when nothing is within the radius", () => {
    expect(nearestNode(graph, { lat: 40, lon: -100 }, 150)).toBeNull();
  });
});

describe("dijkstra", () => {
  it("takes the short way by default", () => {
    expect(dijkstra(graph, 2, 5, [])).toEqual([2, 4, 5]);
  });
  it("prefers the named way when its ref is requested", () => {
    expect(dijkstra(graph, 2, 5, ["7N76Y"])).toEqual([2, 6, 5]);
  });
});

describe("concatLegs", () => {
  it("concatenates and de-dups the shared boundary point", () => {
    const out = concatLegs([
      { points: [{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }] },
      { points: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }] },
    ]);
    expect(out).toEqual([{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }, { lat: 2, lon: 2 }]);
  });
});

describe("snapRoute", () => {
  it("snaps a leg along the graph and reports it snapped", () => {
    const req: SnapRequest = {
      segments: [{ anchors: [{ lat: 38.0, lon: -120.0 }, { lat: 38.0, lon: -120.002 }], roadNames: [] }],
    };
    const resp = snapRoute(req, graph, { snapRadiusM: 200 });
    expect(resp.segments[0].legs).toHaveLength(1);
    expect(resp.segments[0].legs[0].snapped).toBe(true);
    expect(resp.segments[0].legs[0].points.length).toBeGreaterThan(2);
  });
  it("falls back to a straight leg when an anchor can't snap", () => {
    const req: SnapRequest = {
      segments: [{ anchors: [{ lat: 38.0, lon: -120.0 }, { lat: 40.0, lon: -100.0 }], roadNames: [] }],
    };
    const resp = snapRoute(req, graph, { snapRadiusM: 150 });
    expect(resp.segments[0].legs[0].snapped).toBe(false);
    expect(resp.segments[0].legs[0].points).toEqual([
      { lat: 38.0, lon: -120.0 },
      { lat: 40.0, lon: -100.0 },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace @cairn/shared -- snapCore`. Expected: FAIL (cannot resolve `../src/snapCore`).

- [ ] **Step 3: Write `packages/shared/src/snapCore.ts`**

```ts
import { haversineMeters, type GeoPoint } from "./geo";
import { costFactor, type Graph, type WayTags } from "./overpassGraph";
import type { SnapRequest, SnapResponse } from "./snap";

export function nearestNode(graph: Graph, point: GeoPoint, maxRadiusM: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const n of graph.nodes.values()) {
    const d = haversineMeters(point, n);
    if (d < bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return best !== null && bestD <= maxRadiusM ? best : null;
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function matchesName(tags: WayTags, roadNames: string[]): boolean {
  if (roadNames.length === 0) return false;
  const hay = [tags.ref, tags.name].filter((x): x is string => !!x).map(norm);
  if (hay.length === 0) return false;
  return roadNames.some((rn) => {
    const n = norm(rn);
    return n.length > 0 && hay.some((h) => h.includes(n));
  });
}

export function edgeWeight(lengthM: number, tags: WayTags, roadNames: string[]): number {
  return lengthM * costFactor(tags) * (matchesName(tags, roadNames) ? 0.3 : 1);
}

class MinHeap {
  private a: { id: number; d: number }[] = [];
  get size() {
    return this.a.length;
  }
  push(item: { id: number; d: number }) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].d <= a[i].d) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): { id: number; d: number } | undefined {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let s = i;
        if (l < a.length && a[l].d < a[s].d) s = l;
        if (r < a.length && a[r].d < a[s].d) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]];
        i = s;
      }
    }
    return top;
  }
}

export function dijkstra(graph: Graph, start: number, goal: number, roadNames: string[]): number[] | null {
  if (start === goal) return [start];
  const dist = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, number>();
  const done = new Set<number>();
  const heap = new MinHeap();
  heap.push({ id: start, d: 0 });
  while (heap.size > 0) {
    const cur = heap.pop()!;
    if (done.has(cur.id)) continue;
    done.add(cur.id);
    if (cur.id === goal) break;
    for (const e of graph.adj.get(cur.id) ?? []) {
      const nd = cur.d + edgeWeight(e.lengthM, e.tags, roadNames);
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, cur.id);
        heap.push({ id: e.to, d: nd });
      }
    }
  }
  if (!done.has(goal)) return null;
  const path: number[] = [];
  let n: number | undefined = goal;
  while (n !== undefined) {
    path.unshift(n);
    n = prev.get(n);
  }
  return path[0] === start ? path : null;
}

const samePoint = (a: GeoPoint, b: GeoPoint) => a.lat === b.lat && a.lon === b.lon;

export function concatLegs(legs: { points: GeoPoint[] }[]): GeoPoint[] {
  const out: GeoPoint[] = [];
  for (const leg of legs) {
    for (const p of leg.points) {
      if (out.length === 0 || !samePoint(out[out.length - 1], p)) out.push(p);
    }
  }
  return out;
}

export function snapRoute(req: SnapRequest, graph: Graph, opts: { snapRadiusM?: number } = {}): SnapResponse {
  const radius = opts.snapRadiusM ?? 150;
  return {
    segments: req.segments.map((seg) => {
      const snapIds = seg.anchors.map((a) => nearestNode(graph, a, radius));
      const legs: SnapResponse["segments"][number]["legs"] = [];
      for (let i = 0; i + 1 < seg.anchors.length; i++) {
        const a = seg.anchors[i];
        const b = seg.anchors[i + 1];
        let points: GeoPoint[] | null = null;
        const sa = snapIds[i];
        const sb = snapIds[i + 1];
        if (sa !== null && sb !== null) {
          const path = dijkstra(graph, sa, sb, seg.roadNames);
          if (path) {
            const mid = path.map((id) => {
              const nd = graph.nodes.get(id)!;
              return { lat: nd.lat, lon: nd.lon };
            });
            points = [a, ...mid, b];
          }
        }
        legs.push(points ? { snapped: true, points } : { snapped: false, points: [a, b] });
      }
      return { legs };
    }),
  };
}
```

- [ ] **Step 4: Add `./snapCore` to `packages/shared/src/index.ts`** — append the line:

```ts
export * from "./snapCore";
```

- [ ] **Step 5: Run to verify pass** — Run: `npm test --workspace @cairn/shared -- snapCore` (7 tests) then `npm run typecheck --workspace @cairn/shared` (exit 0).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/snapCore.ts packages/shared/src/index.ts packages/shared/test/snapCore.test.ts
git commit -m "feat(shared): snapRoute (nearest-node snap + name-biased Dijkstra + fallback)"
```

---

### Task 6: `POST /api/snap` endpoint

**Files:** Modify `api/src/index.ts`; Create `api/test/snap-endpoint.test.ts`.

- [ ] **Step 1: Write the failing test** — Create `api/test/snap-endpoint.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../src/index";

const overpassJson = {
  elements: [
    { type: "node", id: 1, lat: 38.0, lon: -120.0 },
    { type: "node", id: 2, lat: 38.0, lon: -120.001 },
    { type: "node", id: 3, lat: 38.0, lon: -120.002 },
    { type: "way", id: 10, nodes: [1, 2, 3], tags: { highway: "track" } },
  ],
};

const env = { ANTHROPIC_API_KEY: "x", OVERPASS_URL: "https://overpass.test/api" };

const body = {
  segments: [{ anchors: [{ lat: 38.0, lon: -120.0 }, { lat: 38.0, lon: -120.002 }], roadNames: [] }],
};

function post(b: unknown) {
  return app.request(
    "/api/snap",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) },
    env,
  );
}

beforeEach(() => vi.unstubAllGlobals());

describe("POST /api/snap", () => {
  it("returns snapped geometry for a valid request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(overpassJson), { status: 200 })));
    const res = await post(body);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.segments[0].legs[0].snapped).toBe(true);
    expect(json.segments[0].legs[0].points.length).toBeGreaterThan(2);
  });

  it("returns 400 for an invalid request body", async () => {
    const res = await post({ segments: "nope" });
    expect(res.status).toBe(400);
  });

  it("returns 502 when Overpass fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
    const res = await post(body);
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace api -- snap-endpoint`. Expected: FAIL (route 404 → 200 assertion fails).

- [ ] **Step 3: Update `api/src/index.ts`** — add the imports, extend `Env`, and add the route. Change the import block and `Env` to:

```ts
import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import {
  Route,
  SnapRequest,
  buildOverpassQuery,
  computeBbox,
  parseOverpassToGraph,
  snapRoute,
  type OverpassJson,
} from "@cairn/shared";
import { buildGpx } from "./gpx";
import { ALLOWED_MEDIA, arrayBufferToBase64, extractPage, type MediaType } from "./extract";

interface Env {
  ANTHROPIC_API_KEY: string;
  OVERPASS_URL?: string;
}
```

Then add this handler (e.g. after the `/api/extract` route, before `export default app`):

```ts
app.post("/api/snap", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = SnapRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid snap request", issues: parsed.error.issues }, 400);
  }
  const anchors = parsed.data.segments.flatMap((s) => s.anchors);
  if (anchors.length === 0) {
    return c.json({ segments: parsed.data.segments.map(() => ({ legs: [] })) }, 200);
  }
  const query = buildOverpassQuery(computeBbox(anchors, 300));
  const url = c.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
  let json: OverpassJson;
  try {
    const res = await fetch(url, {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "cairn/1.0 (overland route-book to GPX converter)",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    json = (await res.json()) as OverpassJson;
  } catch (err) {
    return c.json({ error: "Overpass unavailable", detail: (err as Error).message }, 502);
  }
  return c.json(snapRoute(parsed.data, parseOverpassToGraph(json)), 200);
});
```

- [ ] **Step 4: Run to verify pass** — Run: `npm test --workspace api` (full api suite incl. the 3 new snap tests) then `npm run typecheck --workspace api`. Expected: all PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add api/src/index.ts api/test/snap-endpoint.test.ts
git commit -m "feat(api): POST /api/snap endpoint"
```

---

### Task 7: GPX writer uses `snappedTrack`

**Files:** Modify `api/src/gpx.ts`, `api/test/gpx.test.ts`.

- [ ] **Step 1: Write the failing test** — append this block inside the `describe("buildGpx", ...)` in `api/test/gpx.test.ts` (before its closing `});`):

```ts
  it("uses snappedTrack for trkpts when a segment has it", () => {
    const snappedRoute: Route = {
      name: "Snapped",
      segments: [
        {
          name: "Main",
          snappedTrack: [
            { lat: 38.1, lon: -120.1 },
            { lat: 38.2, lon: -120.2 },
            { lat: 38.3, lon: -120.3 },
          ],
          instructions: [
            {
              fwdMile: 1.0,
              direction: "SO",
              text: "anchor",
              gps: { raw: "N38°06.00' W120°06.00'", lat: 38.1, lon: -120.1 },
            },
          ],
        },
      ],
    };
    const gpx = buildGpx(snappedRoute);
    // three trkpts from the snapped track, not the single gps anchor
    expect((gpx.match(/<trkpt /g) ?? [])).toHaveLength(3);
    expect(gpx).toContain('<trkpt lat="38.200000" lon="-120.200000">');
    // waypoints still come from the gps anchor
    expect((gpx.match(/<wpt /g) ?? [])).toHaveLength(1);
  });
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace api -- gpx`. Expected: FAIL (only 1 trkpt — the writer still uses gps anchors).

- [ ] **Step 3: Update `buildTrack` in `api/src/gpx.ts`** — replace the `buildTrack` function with:

```ts
function buildTrack(segment: RouteSegment): string {
  const source =
    segment.snappedTrack && segment.snappedTrack.length > 0
      ? segment.snappedTrack
      : segment.instructions.filter((i) => i.gps !== null).map((i) => ({ lat: i.gps!.lat, lon: i.gps!.lon }));
  const points = source.map((p) => `      <trkpt lat="${fmt(p.lat)}" lon="${fmt(p.lon)}"></trkpt>`);
  return [
    "  <trk>",
    `    <name>${esc(segment.name)}</name>`,
    "    <trkseg>",
    ...points,
    "    </trkseg>",
    "  </trk>",
  ].join("\n");
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npm test --workspace api -- gpx` then `npm run typecheck --workspace api`. Expected: all gpx tests PASS (6 now); typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add api/src/gpx.ts api/test/gpx.test.ts
git commit -m "feat(api): GPX track follows snappedTrack when present"
```

---

### Task 8: Store — snap state + invalidate on edit

**Files:** Modify `web/src/store.ts`, `web/test/store.test.ts`.

- [ ] **Step 1: Write the failing test** — append inside `describe("routeStore", ...)` in `web/test/store.test.ts` (before its closing `});`):

```ts
  it("stores snapped geometry and the enabled flag", () => {
    const st = useRouteStore.getState();
    st.setSnapEnabled(true);
    st.setSnapped({ "seg-1": { legs: [{ snapped: true, points: [{ lat: 1, lon: 2 }] }] } });
    expect(useRouteStore.getState().snapEnabled).toBe(true);
    expect(useRouteStore.getState().snapped["seg-1"].legs[0].snapped).toBe(true);
  });

  it("clears snap when the route is edited", () => {
    const st = useRouteStore.getState();
    st.setSnapEnabled(true);
    st.setSnapped({ "seg-1": { legs: [] } });
    st.addSegment();
    expect(useRouteStore.getState().snapEnabled).toBe(false);
    expect(useRouteStore.getState().snapped).toEqual({});
  });
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace web -- store`. Expected: FAIL (`setSnapEnabled` not a function).

- [ ] **Step 3: Update `web/src/store.ts`** — make these edits:

(a) Add the import and the snap types near the top (after the existing `import type { Direction }`):

```ts
import type { Direction, GeoPoint } from "@cairn/shared";

export interface SegmentSnap {
  legs: { snapped: boolean; points: GeoPoint[] }[];
}
```

(b) Add snap state + actions to the `RouteState` interface (after `pages: PageImage[];`):

```ts
  snapEnabled: boolean;
  snapped: Record<string, SegmentSnap>;
  setSnapEnabled: (v: boolean) => void;
  setSnapped: (map: Record<string, SegmentSnap>) => void;
  clearSnap: () => void;
```

(c) In the store implementation, add the initial state and the three setters (next to `pages: []`):

```ts
  snapEnabled: false,
  snapped: {},
  setSnapEnabled: (v) => set({ snapEnabled: v }),
  setSnapped: (map) => set({ snapped: map }),
  clearSnap: () => set({ snapEnabled: false, snapped: {} }),
```

(d) Make every route-mutating action also clear the snap. Add `snapEnabled: false, snapped: {}` to the object each of these returns from `set`: `addSegment`, `updateSegmentName`, `removeSegment`, `moveSegment`, `addRow`, `updateRow`, `removeRow`, `moveRow`, `appendSegments`. For example `addSegment` and `updateRow` become:

```ts
  addSegment: () =>
    set((s) => ({
      segments: [...s.segments, { id: uid(), name: "", instructions: [emptyRow()] }],
      snapEnabled: false,
      snapped: {},
    })),
```
```ts
  updateRow: (segId, rowId, patch) =>
    set((s) => ({
      segments: s.segments.map((seg) =>
        seg.id === segId
          ? { ...seg, instructions: seg.instructions.map((row) => (row.id === rowId ? { ...row, ...patch } : row)) }
          : seg,
      ),
      snapEnabled: false,
      snapped: {},
    })),
```

Apply the same `snapEnabled: false, snapped: {}` addition to the `set((s) => ({ ... }))` return of `updateSegmentName`, `removeSegment`, `moveSegment`, `addRow`, `removeRow`, `moveRow`, and `appendSegments`. (Do NOT add it to `setRouteName`, `setView`, page actions, or the snap setters.)

- [ ] **Step 4: Run to verify pass** — Run: `npm test --workspace web -- store` (11 tests) then `npm run typecheck --workspace web` (exit 0).

- [ ] **Step 5: Commit**

```bash
git add web/src/store.ts web/test/store.test.ts
git commit -m "feat(web): snap state in store; edits invalidate the snap"
```

---

### Task 9: Snap client (build request, parse response)

**Files:** Create `web/src/lib/snapClient.ts`, `web/test/snapClient.test.ts`.

- [ ] **Step 1: Write the failing test** — Create `web/test/snapClient.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSnapRequest, snapResponseToStore } from "../src/lib/snapClient";
import type { EditableSegment } from "../src/store";
import type { SnapResponse } from "@cairn/shared";

const segments: EditableSegment[] = [
  {
    id: "s1",
    name: "Spur",
    instructions: [
      { id: "a", fwdMile: "0.0", direction: "", text: "start", gpsRaw: "", flagged: false, note: "" },
      { id: "b", fwdMile: "1.8", direction: "BL", text: "Bear left onto 7N76Y.", gpsRaw: "N38°28.33' W120°12.45'", flagged: false, note: "" },
      { id: "c", fwdMile: "2.8", direction: "SO", text: "ends", gpsRaw: "N38°28.49' W120°13.26'", flagged: false, note: "" },
    ],
  },
];

describe("buildSnapRequest", () => {
  it("collects valid anchors in order and extracted road names per segment", () => {
    const req = buildSnapRequest(segments);
    expect(req.segments).toHaveLength(1);
    expect(req.segments[0].anchors).toHaveLength(2); // only the two parseable gps rows
    expect(req.segments[0].anchors[0].lat).toBeCloseTo(38.4722, 4);
    expect(req.segments[0].roadNames).toContain("7N76Y");
  });
});

describe("snapResponseToStore", () => {
  it("keys the per-segment legs by segment id, in order", () => {
    const resp: SnapResponse = { segments: [{ legs: [{ snapped: true, points: [{ lat: 1, lon: 2 }] }] }] };
    const map = snapResponseToStore(segments, resp);
    expect(map["s1"].legs[0].snapped).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace web -- snapClient`. Expected: FAIL (cannot resolve `../src/lib/snapClient`).

- [ ] **Step 3: Write `web/src/lib/snapClient.ts`**

```ts
import { SnapResponse, extractRoadNames, type SnapRequest } from "@cairn/shared";
import type { EditableSegment } from "../store";
import type { SegmentSnap } from "../store";
import { parseGps } from "./anchors";

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
  const res = await fetch("/api/snap", {
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
```

- [ ] **Step 4: Run to verify pass** — Run: `npm test --workspace web -- snapClient` (2 tests) then `npm run typecheck --workspace web` (exit 0).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/snapClient.ts web/test/snapClient.test.ts
git commit -m "feat(web): snap client (build request, parse response)"
```

---

### Task 10: UI — toggle, map rendering, download

**Files:** Modify `web/src/lib/serialize.ts`, `web/test/serialize.test.ts`, `web/src/components/ReviewView.tsx`, `web/src/components/MapPanel.tsx`, `web/src/components/DownloadButton.tsx`.

- [ ] **Step 1: Write the failing test** — append inside `describe("toRoutePayload", ...)` in `web/test/serialize.test.ts` (before its closing `});`):

```ts
  it("includes snappedTrack per segment when snap data is provided", () => {
    const snapped = { s1: { legs: [{ snapped: true, points: [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }] }] } };
    const payload = toRoutePayload(state, snapped);
    expect(payload.segments[0].snappedTrack).toEqual([{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }]);
  });

  it("omits snappedTrack when there is no snap data", () => {
    expect(toRoutePayload(state).segments[0].snappedTrack).toBeUndefined();
  });
```

(The existing `state` fixture's single segment has `id: "s1"`.)

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace web -- serialize`. Expected: FAIL (`toRoutePayload` takes one arg / no `snappedTrack`).

- [ ] **Step 3: Update `web/src/lib/serialize.ts`** — replace its contents with:

```ts
import { concatLegs, type RouteInput } from "@cairn/shared";
import type { RouteState, SegmentSnap } from "../store";

export function toRoutePayload(
  state: Pick<RouteState, "name" | "segments">,
  snapped?: Record<string, SegmentSnap>,
): RouteInput {
  return {
    name: state.name,
    segments: state.segments.map((seg) => {
      const snap = snapped?.[seg.id];
      const track = snap && snap.legs.length > 0 ? concatLegs(snap.legs) : undefined;
      return {
        name: seg.name,
        snappedTrack: track,
        instructions: seg.instructions.map((row) => {
          const n = Number(row.fwdMile);
          return {
            fwdMile: row.fwdMile.trim() === "" || Number.isNaN(n) ? null : n,
            direction: row.direction === "" ? null : row.direction,
            text: row.text,
            gps: row.gpsRaw.trim() === "" ? null : { raw: row.gpsRaw.trim() },
          };
        }),
      };
    }),
  };
}
```

- [ ] **Step 4: Run to verify pass (serialize)** — Run: `npm test --workspace web -- serialize`. Expected: PASS (5 tests).

- [ ] **Step 5: Update `web/src/components/DownloadButton.tsx`** — pass the snap data into the payload. Replace its `useRouteStore` selectors and `mutationFn` body so it reads `snapped` and forwards it:

```tsx
import { useMutation } from "@tanstack/react-query";
import { useRouteStore } from "../store";
import { toRoutePayload } from "../lib/serialize";

export function DownloadButton() {
  const name = useRouteStore((s) => s.name);
  const segments = useRouteStore((s) => s.segments);
  const snapped = useRouteStore((s) => s.snapped);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/gpx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toRoutePayload({ name, segments }, snapped)),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      return res.blob();
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name || "route"}.gpx`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <div className="flex items-center gap-3">
      <button
        className="px-3 py-1.5 bg-emerald-600 text-white rounded disabled:opacity-40"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Generating…" : "Download GPX"}
      </button>
      {mutation.isError && <span className="text-sm text-red-600">{(mutation.error as Error).message}</span>}
    </div>
  );
}
```

- [ ] **Step 6: Update `web/src/components/MapPanel.tsx`** — render snapped legs when present. Replace its contents with:

```tsx
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import { LatLngBounds } from "leaflet";
import { useRouteStore } from "../store";
import { deriveAnchors } from "../lib/anchors";

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = JSON.stringify(points);
  useEffect(() => {
    if (points.length > 0) map.fitBounds(new LatLngBounds(points), { padding: [30, 30] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

export function MapPanel() {
  const segments = useRouteStore((s) => s.segments);
  const snapEnabled = useRouteStore((s) => s.snapEnabled);
  const snapped = useRouteStore((s) => s.snapped);
  const anchors = deriveAnchors(segments);
  const all: [number, number][] = anchors.flatMap((s) => s.points.map((p) => [p.lat, p.lon] as [number, number]));

  return (
    <MapContainer center={[38.47, -120.2]} zoom={11} className="h-full w-full">
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {anchors.map((seg) => {
        const snap = snapEnabled ? snapped[seg.id] : undefined;
        const straight = seg.points.map((p) => [p.lat, p.lon] as [number, number]);
        return (
          <div key={seg.id}>
            {snap
              ? snap.legs.map((leg, i) => (
                  <Polyline
                    key={i}
                    positions={leg.points.map((p) => [p.lat, p.lon] as [number, number])}
                    pathOptions={leg.snapped ? {} : { dashArray: "6", color: "#888" }}
                  />
                ))
              : straight.length > 1 && <Polyline positions={straight} />}
            {seg.points.map((p) => (
              <Marker key={p.id} position={[p.lat, p.lon]}>
                <Popup>
                  <strong>mile {p.fwdMile || "?"}</strong>
                  <br />
                  {p.text}
                </Popup>
              </Marker>
            ))}
          </div>
        );
      })}
      <FitBounds points={all} />
    </MapContainer>
  );
}
```

- [ ] **Step 7: Add the "Snap to roads" toggle to `web/src/components/ReviewView.tsx`** — import the snap client and add the control. Add these imports at the top:

```tsx
import { buildSnapRequest, requestSnap, snapResponseToStore } from "../lib/snapClient";
```

Add these store selectors inside `ReviewView` (next to the existing ones):

```tsx
  const segments = useRouteStore((s) => s.segments);
  const snapEnabled = useRouteStore((s) => s.snapEnabled);
  const setSnapEnabled = useRouteStore((s) => s.setSnapEnabled);
  const setSnapped = useRouteStore((s) => s.setSnapped);
  const clearSnap = useRouteStore((s) => s.clearSnap);
```

Add a handler inside the component (before the `return`):

```tsx
  async function onToggleSnap(checked: boolean) {
    if (!checked) {
      clearSnap();
      return;
    }
    try {
      const resp = await requestSnap(buildSnapRequest(segments));
      setSnapped(snapResponseToStore(segments, resp));
      setSnapEnabled(true);
    } catch {
      clearSnap();
      alert("Couldn't snap to roads (Overpass unavailable); showing straight lines.");
    }
  }
```

In the header JSX, add the toggle just before the `<div className="ml-auto">` that holds `<DownloadButton />`:

```tsx
        <label className="flex items-center gap-1 text-sm text-gray-700">
          <input type="checkbox" checked={snapEnabled} onChange={(e) => onToggleSnap(e.target.checked)} />
          Snap to roads
        </label>
```

- [ ] **Step 8: Run full web suite + typecheck** — Run: `npm test --workspace web` then `npm run typecheck --workspace web`. Expected: all PASS; typecheck exit 0.

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/serialize.ts web/test/serialize.test.ts web/src/components/ReviewView.tsx web/src/components/MapPanel.tsx web/src/components/DownloadButton.tsx
git commit -m "feat(web): Snap to roads toggle, snapped map rendering, snapped GPX download"
```

---

### Task 11: Verification gate

**Files:** none (full-suite + manual run).

- [ ] **Step 1: Run every workspace's tests + typechecks**

```bash
npm test --workspaces
npm run typecheck --workspace @cairn/shared
npm run typecheck --workspace cairn-api
npm run typecheck --workspace web
```
Expected: all suites green (shared, api, web); all typechecks exit 0.

- [ ] **Step 2: Web production build**

Run: `npm run build --workspace web`. Expected: builds with no errors.

- [ ] **Step 3: Live snap smoke (no key needed — Overpass is public)**

```bash
npm run dev --workspace cairn-api   # wrangler dev on :8787
```
Then POST a real two-anchor segment on a forest road and confirm a snapped polyline comes back:

```bash
curl -s -X POST http://localhost:8787/api/snap \
  -H "Content-Type: application/json" \
  -d '{"segments":[{"anchors":[{"lat":38.4722,"lon":-120.2075},{"lat":38.4748,"lon":-120.2210}],"roadNames":["7N76Y"]}]}' \
  | head -c 400
```
Expected: JSON with `segments[0].legs[0].points` containing more than two points (snapped), or `snapped:false` if that exact spot has no nearby OSM road — either is a valid result.

- [ ] **Step 4: Manual end-to-end run**

With `wrangler dev` + `vite` running: open a real multi-anchor route, toggle **Snap to roads**, confirm the line follows the roads (fallback legs render dashed/grey), then **Download GPX** and open it in a map tool to confirm the road-following track. Toggle off / edit a row and confirm the snap clears.

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "fix: address Phase 4 verification-gate findings"
```

---

## Done criteria

- `npm test --workspaces` green across shared, api, and web; all three typecheck clean; web builds.
- `POST /api/snap` returns per-leg snapped geometry (Overpass mocked in tests); a live call against public Overpass returns a snapped track.
- Toggling "Snap to roads" draws road-following legs on the map and the downloaded GPX follows the snapped track; editing the route clears the snap.

Stop here — this completes the four-phase build described in `PROMPT.md`.
