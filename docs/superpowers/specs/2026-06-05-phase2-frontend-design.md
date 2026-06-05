# Phase 2 Design — Frontend (Upload · Review · Map · Download)

Date: 2026-06-05
Status: Approved for implementation

## Context

Phase 1 shipped the API spine: a stateless Cloudflare Worker with a DMS coordinate
parser, a zod `Route` data model, a GPX 1.1 writer, and `POST /api/gpx` (route JSON →
GPX download). Phase 2 builds the browser app that produces those route JSONs.

### Decisions that frame Phase 2

- **No AI extraction yet** (that is Phase 3). In Phase 2 the user **transcribes by hand**
  into the editable table, using the uploaded page photos as reference. The review UI we
  build is exactly the one Phase 3 will pre-fill with extraction output.
- **A route spans multiple page images.** Uploaded images are reference material, not the
  star of the screen, and there can be many. In Phase 2 they are held **in-memory only**
  (object URLs) and are **never uploaded anywhere** — page order is reference now, and
  becomes extraction order in Phase 3.
- **Table + map are the primary panels**; images are secondary reference.
- Validation remains **human-in-the-loop**: render the track, the user eyeballs it against
  the physical book. No VLM, no numeric checks (carried over from Phase 1).

## Repo structure — becomes an npm workspace

```
/ (npm workspaces: ["packages/*", "api", "web"])
  packages/shared/   @cairn/shared — coordinate parser + zod data model/types
  api/               existing Worker, imports @cairn/shared
  web/               new React + Vite + TS frontend
```

**Phase 1 refactor (the only Phase 1 code touched):** move `api/src/coords.ts` and
`api/src/types.ts` (and their tests) into `packages/shared`. `api/` updates imports to
`@cairn/shared` and keeps `buildGpx` (API-specific). The shared package is consumed as
**TypeScript source, no build step** — Vite, esbuild/wrangler, and `tsc` all handle TS, so
`@cairn/shared` exports its `src` entry directly. One source of truth, zero drift between
the parser/types the API validates with and the ones the frontend uses.

`@cairn/shared` exports: `parseDmsCoordinate`, `LatLon`, `Direction`, `GpsFix`,
`Instruction`, `RouteSegment`, `Route` (zod schemas + inferred types).

## Stack

React + Vite + TypeScript · Tailwind · react-leaflet (OSM tiles) · TanStack Query (GPX
POST) · Zustand (edit store). Reordering is via ▲/▼ buttons wired to store actions
(drag-and-drop deferred). Lives in `web/`.

## Views & flow

Lightweight **view-state navigation** (no react-router): the store holds `view: "upload" |
"review"`. Two screens:

### Upload view
- Drag-and-drop + file picker for one or more page images.
- Thumbnails with reorder (dnd-kit); page order = route/reference order.
- Images stored as in-memory object URLs only; not sent to any backend in Phase 2.
- "Continue to review" advances the view.

### Review view — layout C
Wide editable **Table** on the left (always-primary work surface); a right panel that
**tabs** between **Map** and **Pages**, each getting full height when active.

**Table** (grouped by segment):
- Segment block: editable segment name, delete-segment, drag handle; "+ Add segment".
- Row columns: drag handle · **Mile** (number) · **Direction** (dropdown:
  SO/BL/BR/TL/TR/UT or blank) · **Description** (text) · **GPS** (paste raw string) ·
  delete. "+ Add row" within each segment.
- GPS cell parses the raw string live via the shared parser → shows `lat, lon`. GPS-bearing
  rows are **highlighted** (they are the track anchors). Unparseable → red, no plotted
  point (never fabricate a coordinate).
- Reorder rows (within a segment) and segments via ▲/▼ controls. Cross-segment row moves
  are out of scope for Phase 2 (delete + re-add); drag-and-drop is a later polish.

**Map tab** (react-leaflet, OSM tiles):
- Per segment: a polyline through that segment's GPS anchors in `fwdMile` order
  (straight lines — matches Phase 1's GPX; road-snapping is Phase 4), plus markers at each
  anchor with a popup showing the instruction text and mileage.
- Auto-fit bounds to all anchors. Updates live as the store changes. Rows without a valid
  GPS fix do not appear (consistent with the GPX).

**Pages tab**: thumbnail filmstrip of all uploaded images + an enlarged viewer for the
selected page.

**Download GPX button**: serializes the store to a `Route` JSON (each gps as `{ raw }`),
POSTs to `/api/gpx`, and downloads the returned file (filename derived from the route
name). The backend re-parses raw → the authoritative GPX.

## Components & data flow

Focused files (each one clear responsibility):
- `UploadView`, `PageThumbnail`
- `ReviewView` (layout shell + tab state)
- `RouteTable` → `SegmentBlock` → `InstructionRow`, with `DirectionSelect` and `GpsCell`
- `MapPanel` (react-leaflet), `PagesPanel` (filmstrip + viewer)
- `DownloadButton`
- `routeStore` (Zustand): the route (`name`, `segments`) + `view`; actions for
  add/edit/delete/reorder of rows and segments, and view switching
- `api` (TanStack Query mutation hook posting to `/api/gpx`)

Data flow: editing mutates the Zustand store (client-only). `MapPanel` derives anchors by
parsing each row's raw GPS with the shared `parseDmsCoordinate` (unparseable → omitted +
row flagged). `DownloadButton` serializes the store to a `Route` payload and POSTs it;
optionally pre-validates client-side with the shared zod `Route` schema for friendly errors
before sending.

## Dev setup

`vite` (web) + `wrangler dev` (api) run together; Vite proxies `/api` → the Worker, so the
browser sees a same origin and **no CORS is needed**. Production can likewise be same-origin
(Cloudflare Pages + a Worker route), so CORS stays out of the codebase.

## Testing

vitest + React Testing Library in `web/`:
- `routeStore` actions: add/edit/delete/reorder rows and segments; view switching.
- `GpsCell` / parse-state rendering: valid → lat/lon shown + row highlighted;
  unparseable → red, not plotted.
- Map-anchor derivation: only valid GPS rows become anchors, ordered by `fwdMile`.
- Download serialization: store → `Route` payload with gps as `{ raw }`.

`packages/shared` keeps the coordinate-parser tests (moved from Phase 1). `api/` tests
continue to pass after the import refactor.

## Out of scope (later phases)

- Vision extraction and confidence flags (Phase 3) — the table's low-confidence marking and
  the `confidence` data field come with extraction.
- Road-snapping / map-matching and the "snap to roads" toggle (Phase 4) — Phase 2 draws
  straight lines between anchors.
- Deployment to Cloudflare (Pages + `wrangler deploy`) — local dev only for now.

## Verification gate

Run `vite` + `wrangler dev`: upload a couple of page images, hand-enter a multi-segment
route with GPS fixes (e.g. the Calaveras Dome spur), watch the map draw the anchors and
polyline live, then click Download and get a valid GPX that matches what Phase 1 produces
for the same data.
