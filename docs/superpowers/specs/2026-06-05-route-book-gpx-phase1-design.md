# Phase 1 Design — Route Book → GPX (Backend Spine)

Date: 2026-06-05
Status: Approved for implementation

## Product context (the whole point)

Convert photos of printed overland/4x4 route guides (early-2000s FunTreks/Wells-style
mileage tables) into GPX tracks that load on a Garmin/Gaia and can actually be driven.

The books encode a route as a **mileage table**, not a coordinate path: a handful of
exact GPS fixes scattered along the route, and between them cumulative mileage, turn
codes (SO/BL/BR/TL/TR/UT), and named forest roads. The job is to reconstruct a drivable
track from sparse anchors plus turn-by-turn instructions — the printed book never
contained the full geometry.

### Decisions that frame everything

- **Personal tool**, for the author. Success = GPS anchors dead-on, the line between them
  plausible enough to follow on the trail.
- **Validation is pure human-in-the-loop.** We render the track; the human compares it to
  the physical book and says "yes." No VLM shape-matching, no numeric mileage-tolerance
  checks. (Both were considered and cut as YAGNI — the human's eyes against the page are
  the most reliable validator available.)
- **Cloudflare Workers** is the target runtime. This overrides the original prompt's
  Python/FastAPI/Pydantic/gpxpy/uv stack in favor of the native Workers stack (see below).
- **Storage is unnecessary.** Ephemeral need only — "store just long enough to get GPX
  out" — collapses to *no storage at all*: a stateless endpoint that takes a route and
  returns the file.

### Build order

Approach A — **output spine first**. Build and verify the part everything depends on (data
model + coordinate parser + GPX writer + endpoint) against hand-written JSON, with no AI,
no UI, no routing. Rationale: the data model *is* the problem — if it doesn't carry
raw-GPS + decimal + per-row cumulative mileage + segment structure, nothing downstream can
succeed. And we never want to debug extraction and GPX format at the same time. The next
slice after Phase 1 is the render-and-approve loop (straight-line track on a Leaflet map),
which is the validation mechanism.

## Scope of Phase 1

In: zod data model, DMS→decimal coordinate parser, GPX writer, one stateless endpoint,
tests for each.

Out (later phases): image upload, the editable review UI, the Leaflet map preview, vision
extraction, and road-snapping/routing.

## Stack

- TypeScript on Cloudflare Workers
- **Hono** — routing/framework
- **zod** — schema validation + inferred types (the Pydantic analog)
- **vitest** — testing
- GPX emitted as XML directly (GPX is simple XML; no gpxpy equivalent needed)
- Worker lives in `api/`; the future SPA will live in `web/`.

## Units

Built test-first in this order: data model → parser → GPX writer → endpoint.

### 1. Data model (zod schemas)

```
Direction = enum("SO" | "BL" | "BR" | "TL" | "TR" | "UT")

GpsFix {
  raw: string        // verbatim, e.g. "N38°28.59' W120°10.43'"
  lat: number
  lon: number
}

Instruction {            // one table row, forward (black) view only
  fwdMile: number | null // per-segment cumulative forward mileage; route-ordering key
  direction: Direction | null  // null when the row has no turn code (e.g. "Continue...")
  text: string           // verbatim description
  gps: GpsFix | null
}

RouteSegment {
  name: string                 // e.g. "Spur to the top of Calaveras Dome"
  instructions: Instruction[]  // ordered by fwdMile
}

Route {
  name: string
  segments: RouteSegment[]
}
```

We keep each fix's `raw` string *and* decimal `lat`/`lon` so later phases can re-validate
without re-parsing. **Input shape:** the endpoint accepts a GPS fix as just `{ raw }`; a
zod transform runs the coordinate parser to fill `lat`/`lon` (malformed raw → 400). This
makes the parser load-bearing in the Phase 1 flow and keeps hand-written JSON minimal. Deliberately NOT in Phase 1 (YAGNI): no `confidence` field (Phase 3
extraction concern), no notable-feature flag.

**Source-data note (verified against `example_page.png`):** each book row actually encodes
two instructions — a **forward** (black) view and a **reverse** (blue) view — with
different turn codes and wording for the same junction. This is a forward-driving personal
tool, so we capture the **forward view only** and drop the reverse view *and* reverse
mileage; the GPX line drives in either direction regardless. Sub-sections restart mileage
at `0.0` (so `fwdMile` is per-segment cumulative) and some (e.g. spurs) are forward-only.
Many rows have no turn code, so `direction` is nullable.

### 2. Coordinate parser

Decimal-minutes → decimal-degrees. `"N38°28.59' W120°10.43'"` → `(38.4765, -120.1738)`.
Formula: `degrees + minutes / 60`; S and W are negative. Tolerant of symbol/spacing
variants (`°`, `′` vs `'`, extra whitespace). Validates ranges (lat ±90, lon ±180) and
throws on malformed input rather than guessing or fabricating a coordinate.

Tests: the sample above, an S/W-negative case, and malformed input that must throw.

### 3. GPX writer

One `<trk>` per segment (track name = segment name). A simplification falls out of Phase 1:
a GPX point needs coordinates, and the only rows with coordinates are GPS-fix rows, so:

- **trkpts** = the segment's GPS anchors in `fwdMile` order → the (straight-line, for now)
  track geometry.
- **wpts** = those same anchors, each carrying `desc` = verbatim instruction `text`,
  `cmt` = mileage (e.g. `"mile 1.9"`).

"A wpt for every notable feature" is deferred until we have coordinates for non-GPS rows or
add an explicit flag — there is nothing to place a feature-without-coords *at* yet.

Tests: round-trip the emitted XML (parse it back) and assert trk/trkpt/wpt counts, names,
coordinates, and desc/cmt contents.

### 4. Endpoint (Hono)

- `POST /api/gpx` — body is a `Route` JSON. Validate with zod (400 on invalid). Generate
  GPX and return it directly: `Content-Type: application/gpx+xml`, `Content-Disposition:
  attachment`. Stateless — nothing stored, no id, nothing to expire.

The frontend (later) holds the reviewed route in memory and POSTs it to trigger the
download.

Tests (vitest): valid route → 200 + valid GPX body; invalid route → 400.

## Verification gate

POST a hand-written `Route` JSON, get valid GPX back, and confirm it opens in a map tool —
before any extraction, frontend, or routing work begins.

## Forward-looking notes (not Phase 1 work)

- **Phase 3 (extraction):** Claude vision via a `fetch` from the Worker — fits cleanly.
- **Phase 4 (routing):** road-snapping stays on-platform rather than using self-hosted
  Valhalla. Our problem is tiny per request (one trail, small bounding box, low volume),
  so we don't need a full routing engine: at request time, fetch the road network for the
  anchors' bounding box from the **Overpass API** (JSON), build a small in-memory graph,
  and run **map-matching (HMM/Viterbi) + shortest-path** in pure TypeScript. "Favor
  unpaved tracks" becomes edge weights; the book's turn codes can disambiguate forks.
  Cache each bbox's roads in **R2 or D1** to avoid hammering Overpass (D1 with a bbox
  index is the "no runtime Overpass dependency" upgrade). Routing stays pluggable behind
  an interface with a straight-line default, so Phase 1–3 are unaffected.
- Cloudflare deployment shape: Worker (`api/`) + Pages/Assets for the SPA (`web/`).
