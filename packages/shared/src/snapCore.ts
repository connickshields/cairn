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
