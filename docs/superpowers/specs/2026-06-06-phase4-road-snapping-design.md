# Phase 4 Design — Road Snapping

Date: 2026-06-06
Status: Approved for implementation

## Context

Phases 1–3 produce a route of ordered GPS anchors and draw/export **straight lines**
between them. Phase 4 snaps those anchors to real OSM road geometry so the track follows
the forest roads, on the Cloudflare Worker (not self-hosted Valhalla — see the Phase 1
spec's forward-looking note). Human-in-the-loop review remains the validator: the user
toggles snapping, eyeballs the result on the map against the book, and downloads.

### Decisions that frame Phase 4

- **Matching = snap + shortest-path, biased by road names.** Snap each anchor to the
  nearest road, Dijkstra between consecutive anchors over a track-favoring weighted graph,
  and bias edges toward the OSM ways whose `ref`/`name` matches the road the book names for
  that segment. (Not full HMM/Viterbi map-matching.)
- **Road data: Overpass per request, no cache.** Each snap fetches the anchors' bounding
  box from the Overpass API. Simplest; a failed fetch falls back to straight lines.
  R2/D1 caching is a later enhancement.
- **Snapped geometry is an optional field on the existing `Route`** (`snappedTrack` per
  segment), not a separate download path.
- **Editing the route clears the snap** and flips the toggle off — the geometry is stale;
  re-snap on demand.
- **No formal multi-backend routing interface** (YAGNI). "Straight-line" is simply *not
  snapping*; there is one snap backend (Overpass). The snap core is a clean, injectable
  module.

## Architecture — `POST /api/snap`

Snapping returns geometry that both the map preview and the GPX need, so it is its own
endpoint (not folded into `/api/gpx`).

- **Request** (`SnapRequest`): `{ segments: [{ anchors: {lat,lon}[], roadNames: string[] }] }`
  — one entry per route segment, with that segment's ordered anchors and the road
  designations mentioned in its instructions.
- **Response** (`SnapResponse`): `{ segments: [{ legs: { snapped: boolean, points: {lat,lon}[] }[] }] }`
  — per segment, one entry per leg (the span between two consecutive anchors), each with its
  own geometry and a snapped/fallback flag. `legs.length === max(anchors.length - 1, 0)`.
  The full segment track is the de-duplicated concatenation of the legs' points; the map can
  style each leg independently (dashed for `snapped: false`).
- The handler validates the body, computes the combined bbox, fetches Overpass once for the
  whole route, builds one graph, and snaps each segment against it. The Overpass `fetch` is
  injected so the handler/core is testable without network.
- **Errors:** Overpass fetch failure → `502`. The frontend then shows a message and reverts
  the toggle.

## The snapping pipeline (pure, injectable)

1. **Bbox** of all anchors across all segments, padded by a small margin.
2. **Fetch roads** in the bbox from Overpass (Overpass QL → JSON): ways with
   `highway` in the drivable+track set (`track`, `unclassified`, `service`, `residential`,
   `tertiary`, `secondary`, `primary`, plus `road`), returning node geometry and the
   `ref`/`name`/`highway`/`surface` tags.
3. **Build a graph:** nodes = way vertices keyed by OSM node id (shared ids form junctions);
   edges = consecutive vertices along each way (bidirectional). Edge weight =
   haversine length × `costFactor`.
   - `costFactor`: `1.0` for `track`/`unclassified`/`service`/`residential`/`road`; `1.5`
     for `tertiary`; `2.0` for `secondary`/`primary` (paved is allowed but discouraged so
     the router doesn't detour onto pavement). `surface` in (`unpaved`/`dirt`/`gravel`/
     `ground`) nudges the factor down by `0.8×`.
   - **Name bias:** if the edge's way `ref` or `name` matches any name in the segment's
     `roadNames` (normalized, case-insensitive), multiply weight by `0.3` (strong
     preference). Applied per-segment at routing time, not baked into the shared graph.
4. **Snap** each anchor to the nearest graph node within a max radius (e.g. 150 m). If none,
   the anchor is unsnapped.
5. **Route each leg:** Dijkstra from snapped-A to snapped-B; the leg polyline is the node
   coordinates along the path (plus the exact anchor endpoints). Concatenate legs into the
   segment `track` (de-duplicating the shared junction point).
6. **Per-leg fallback:** an unsnappable anchor or no path → that leg is a straight line
   `[anchorA, anchorB]`, `snapped: false`. All-failed or Overpass-down → the whole segment
   falls back to its straight anchor polyline.

### Road-name extraction

A pure helper pulls road designations from instruction text: Forest-Service refs
(`\b\d+N\d+[A-Z]?\b`, e.g. `7N09`, `7N76Y`), highway/route refs (`Route \w+`, `\bI-\d+\b`,
`\bUS-?\d+\b`, `\b[A-Z]{1,2}-?\d+\b`). The frontend collects the union across a segment's
rows and sends it as `roadNames`.

## GPX integration

The `Route` payload to `/api/gpx` gains an optional per-segment `snappedTrack: {lat,lon}[]`.

- When a segment has `snappedTrack`, the GPX writer emits those points as the segment's
  `<trkpt>`s (dense, road-following). When absent, it emits the GPS anchors in `fwdMile`
  order (today's straight behavior).
- `<wpt>`s remain the GPS-bearing instructions (text + mileage) regardless.

## Frontend (`web/`)

- **"Snap to roads" toggle** in the Review header. Off = straight (current). On → build a
  `SnapRequest` from the store (per segment: valid anchors in order + road names extracted
  from that segment's rows), `POST /api/snap`, store the returned geometry per segment.
- **MapPanel:** when snapped geometry exists, draw the snapped polyline per segment; legs
  with `snapped: false` draw straight in a muted/dashed style so the user sees what didn't
  snap. Markers (anchors) unchanged.
- **Editing invalidates:** any row/segment mutation clears the stored snapped geometry and
  sets the toggle off.
- **Download:** when snapped geometry exists, include `snappedTrack` per segment in the
  `/api/gpx` payload so the GPX matches the map.
- **Errors:** a `502`/failed snap shows "Couldn't snap to roads (Overpass unavailable);
  showing straight lines" and leaves the toggle off.

## Shared / data model

- `Route` (zod v3, the `/api/gpx` input) gains optional `segments[].snappedTrack` —
  an array of `{ lat, lon }`. Backward compatible (absent = straight).
- `SnapRequest` / `SnapResponse` schemas + a `LatLon` point type live in `@cairn/shared`
  (zod), reused by the Worker and the frontend.
- The snapping pipeline modules (graph build, snap, Dijkstra, costing, name extraction,
  Overpass query builder + JSON parser) live in `@cairn/shared` so they are pure and unit
  tested; the Worker endpoint wires them with a real Overpass `fetch`.

## Testing

All pure or mocked — no live Overpass:

- Road-name extraction from sample instruction text.
- Bbox computation (incl. padding) over anchors.
- Overpass-JSON → graph build (synthetic JSON): nodes, edges, junction sharing, tags.
- `costFactor` by highway/surface; name-bias discount.
- Nearest-node snap within/over the radius.
- Dijkstra shortest path over a synthetic weighted graph; name bias changes the chosen path
  at a fork; track assembly + de-dup.
- Per-leg fallback (unsnappable anchor; no path) → straight leg, `snapped: false`.
- `/api/snap` endpoint with the Overpass fetch mocked: valid → `SnapResponse`; bad body →
  400; Overpass error → 502.
- GPX writer: a segment with `snappedTrack` → trkpts from it; without → from anchors.
- Frontend: store snapped state + invalidate-on-edit; MapPanel snapped-vs-straight
  derivation; download payload includes `snappedTrack`.

## Dev & verification

- `wrangler dev` + `vite`; no new secret (Overpass needs no key). Use a public Overpass
  endpoint (e.g. `https://overpass-api.de/api/interpreter`), configurable via an env var
  with that default.
- Manual gate: extract/enter a real trail with several GPS anchors on named forest roads,
  toggle **Snap to roads**, confirm the line follows the roads (and any unsnapped legs are
  visibly straight), download the GPX, and open it in a map tool to confirm the
  road-following track.

## Out of scope (later)

- R2/D1 caching of Overpass results; HMM/Viterbi map-matching; elevation; turn-by-turn
  validation against the book's cumulative mileage; deployment.
