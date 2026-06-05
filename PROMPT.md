# Project: Overland Route Book → GPX Converter (Web App)

## Goal
Build a web application where a user uploads photos of printed overland/4x4
route guides (early-2000s FunTreks/Wells-style mileage tables), reviews the
extracted route data in the browser, and downloads a GPX file. The GPX must
contain a real road-following track (snapped to OSM road geometry), not just
straight lines between waypoints.

## Source data format (important — read carefully)
The books use a standardized table layout. Each route is a sequence of rows:
- **Forward mileage** (e.g. `▼ 1.9`): cumulative distance driving the route forward.
- **Reverse mileage** (e.g. `2.2 ▲`): cumulative distance from the other direction.
- **Direction code**: a 2-letter abbreviation —
  - `SO` = Straight Over (continue ahead)
  - `BL` = Bear Left
  - `BR` = Bear Right
  - `TL` = Turn Left
  - `TR` = Turn Right
  - `UT` = U-turn (may appear)
- **Description**: free text. References named forest roads (e.g. `7N09`,
  `7N16`, `Route 6H`), features (creek crossings, cattle guards, gates,
  campsites), and instructions ("Zero trip meter", "Follow the sign to West Point").
- **GPS fixes**: appear periodically as highlighted rows in
  degrees-decimal-minutes format, e.g. `GPS: N38°28.59' W120°10.43'`.
  These are the anchor points and are the most important data to capture exactly.

Pages are **two-column**. Routes also split into named sub-sections like
"Spur to the top of Calaveras Dome" and "Continuation of Main Trail" — these are
separate path segments, not one continuous line.

The forward and reverse rows are interleaved (forward number top-left of a row,
reverse number bottom-left). Capture both but key the route ordering off the
forward mileage.

## Architecture (build in this order)

### Phase 1 — Backend core + GPX generation (do this FIRST, no AI needed)
1. Set up a backend API (FastAPI). Define a shared data model: `RouteSegment`
   (a named sub-section) containing ordered `Instruction` rows, each with
   `fwd_mile`, `rev_mile`, `direction`, `text`, and optional `gps` (lat/lon).
   Use Pydantic models so the same schema serves the API and validation.
2. A DMS-decimal-minutes → decimal-degrees parser. Input like `N38°28.59'` →
   `38.4765`. W and S are negative. Write unit tests with the sample coords
   (`N38°28.59' W120°10.43'` → `38.4765, -120.1738`).
3. A GPX writer using `gpxpy`: emit one `<trk>` per segment with the GPS
   anchors as `<trkpt>`s, and a `<wpt>` for every instruction that has a GPS
   fix or is a notable feature (gate, junction, creek), carrying the original
   text in `<desc>` and the mileage in `<cmt>`.
4. Expose endpoints:
   - `POST /api/routes` — accept a route JSON (the data model), return an id.
   - `GET /api/routes/{id}/gpx` — return the generated GPX as a download.
   **Verify end-to-end GPX generation works from a hand-written JSON payload
   before touching extraction, the frontend, or routing.**

### Phase 2 — Frontend shell + upload + review UI
1. React + Vite + TypeScript frontend. Tailwind for styling. Keep it a SPA
   talking to the FastAPI backend.
2. **Upload view**: drag-and-drop / file-picker for one or more page images,
   with thumbnails and the ability to reorder pages (page order = route order).
3. **Review view** (the most important screen): a side-by-side layout — the
   uploaded page image on one side, an editable table of extracted instructions
   on the other. Every field is editable; GPS-fix rows are highlighted; rows
   flagged low-confidence by extraction are visually marked. The user can add,
   delete, and reorder rows and segment boundaries. Coordinate typos caught here
   prevent garbage downstream, so make this screen genuinely usable.
4. **Map preview**: render the current route on a Leaflet map (react-leaflet)
   with OSM tiles — waypoints as markers, the path as a polyline. Updates live
   as the user edits the table.
5. **Download button**: posts the reviewed route to the backend and downloads
   the resulting GPX.

### Phase 3 — Extraction (vision model)
1. Backend endpoint `POST /api/extract` that accepts uploaded image(s) and
   returns the structured route JSON. Use the Anthropic API (Claude vision).
   DO NOT use Tesseract — the two-column layout, rotated reverse-mileage
   triangles, and inverted GPS bars break traditional OCR.
2. Prompt the model to: read columns in correct order; preserve sub-section
   headers as segment boundaries; convert GPS strings to decimal in a separate
   field but ALSO keep the raw string; mark any uncertain cell with a
   `"confidence"` note so the frontend can flag it.
3. Process one page per request for accuracy; concatenate multi-page results in
   upload order on the backend.
4. Wire extraction into the flow: upload → extract → land the user on the review
   view pre-populated with results. Never auto-download; always route through
   human review.

### Phase 4 — Road-snapping (routing)
1. Add a routing service that snaps the ordered GPS anchors to real road
   geometry. Default target: **self-hosted Valhalla** via Docker, using
   `trace_route` (Meili map-matching).
2. Forest roads are usually `highway=track` / `highway=unclassified` in OSM and
   get penalized by default profiles. Configure a **custom costing profile that
   favors tracks and unpaved roads** so the router doesn't avoid the trail.
3. Where the description names a road (`7N09` etc.), query Overpass for ways
   whose `ref`/`name` matches, to validate/disambiguate forks. Optional
   enhancement, not a hard dependency.
4. Make the routing backend pluggable behind an interface, with a trivial
   **straight-line backend as the default** so the app works with zero routing
   infrastructure. Add a toggle in the UI for "snap to roads" once Valhalla is
   wired in; the map preview should reflect whichever mode is active.
5. Cache OSM data locally (Geofabrik state extract) rather than hitting public
   APIs repeatedly.

## Tech stack
- **Backend**: Python 3.11+, FastAPI, Pydantic, `gpxpy`, `anthropic` SDK,
  `httpx` for routing/Overpass, `pytest`. Dependency mgmt with `uv`.
- **Frontend**: React + Vite + TypeScript, Tailwind, react-leaflet (OSM tiles),
  TanStack Query for API calls.
- **Routing**: Valhalla in Docker (provide `docker-compose.yml` + README note on
  grabbing a Geofabrik extract).
- Provide a single `docker-compose.yml` that brings up backend, frontend (dev),
  and optionally Valhalla.

## Constraints & principles
- Make each phase independently runnable and testable. Phase 1 must produce
  valid GPX with NO AI, NO frontend, NO routing engine — verifiable via the API
  alone.
- The review UI is the heart of the product. Prioritize its usability over
  features elsewhere; a human must be able to correct extraction errors easily.
- Keep the routing backend behind an interface; ship the straight-line backend
  first, add Valhalla second. Same for the UI toggle.
- Never silently fabricate coordinates — if a GPS fix can't be read, leave it
  null and surface it as a flagged row in the review UI.
- Store the original instruction text verbatim in the GPX; the book's
  navigational notes are valuable and should survive into the output.
- Don't hardcode the Anthropic API key; read it from an env var and document it.

## First task
Scaffold the monorepo (e.g. `/backend` and `/frontend`), then implement and test
**Phase 1 only** (data model + coordinate parser + GPX writer + the two API
endpoints). Show me valid GPX returned from the API for a small hand-written
JSON payload before moving on. Don't start Phase 2 until I confirm.
