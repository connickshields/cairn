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
