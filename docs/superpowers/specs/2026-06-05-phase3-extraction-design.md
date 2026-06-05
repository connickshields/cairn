# Phase 3 Design — Vision Extraction

Date: 2026-06-05
Status: Approved for implementation

## Context

Phases 1–2 shipped the API spine (coordinate parser, zod `Route` model, GPX writer,
`POST /api/gpx`) and the browser app (upload page photos → hand-transcribe into the review
table → live map → download GPX). Phase 3 replaces hand-transcription with **Claude vision
extraction**: the user uploads page photos, clicks "Extract with AI", and lands on the same
review screen pre-populated with the extracted route to correct.

The review screen remains the safety net — extraction only needs to get close; the human
fixes the rest. Validation stays human-in-the-loop (eyeball the rendered track against the
book); no VLM cross-check, no numeric checks.

### Decisions that frame Phase 3

- **One page per request.** The frontend drives extraction, calling `POST /api/extract`
  once per page in upload order and appending results to the store, with progress feedback.
  Resilient (one bad page doesn't sink the rest); fits Worker limits.
- **Model: Opus 4.8** (`claude-opus-4-8`) — most capable on dense two-column mileage
  tables, rotated reverse-triangles, and inverted GPS bars; high-resolution vision.
  Adaptive thinking at `high` effort.
- **Structured outputs.** Use the Anthropic SDK's `messages.parse()` with a zod schema
  (`zodOutputFormat`) so the reply is schema-constrained and validated — not freeform JSON.
- **Model returns raw GPS strings only.** Decimal lat/lon is computed deterministically by
  our own parser (carried from Phase 1 — never trust the model's coordinate arithmetic).
- **Forward (black) view only**, matching the Phase 1 data model. The reverse (blue) view
  is not captured.
- **Per-row confidence.** The model marks an uncertain instruction row `lowConfidence` with
  a short `note`; the review table highlights flagged rows.
- **Images leave the browser** in this phase (sent to the Worker, forwarded to the
  Anthropic API). Expected for a personal tool with the user's own API key.

## Backend — `POST /api/extract`

Lives in the existing Worker (`api/`).

- **Input:** one page image as the raw request body, with its `Content-Type`
  (e.g. `image/jpeg`, `image/png`). The Worker reads the bytes, base64-encodes them, and
  builds an image content block.
- **Call:** `messages.parse()` (or `messages.create` with `output_config.format`) —
  `model: "claude-opus-4-8"`, `thinking: { type: "adaptive" }`,
  `output_config: { effort: "high", format: zodOutputFormat(ExtractedPage) }`, a system
  prompt with the extraction instructions, and a user turn containing the image block plus a
  brief "extract this page" text block. Reasonable `max_tokens` headroom (~8000).
- **System prompt instructs the model to:** read both columns top-to-bottom in the correct
  order; treat bold sub-section headers (e.g. "Spur to the top of Calaveras Dome",
  "Continuation of Main Trail") as **segment boundaries**; capture the **forward (black)
  view only** — forward mileage, the 2-letter direction code (or none), and the verbatim
  description; return each GPS fix's **raw string** exactly as printed (e.g.
  `N38°28.59' W120°10.43'`) and do not convert it; leave `gpsRaw` null when a row has no
  fix; and set `lowConfidence: true` with a short `note` for any cell it is unsure about
  (smudged mileage, ambiguous code, unreadable coordinate).
- **Output:** the parsed `ExtractedPage` JSON for that page.
- **Errors:** 400 when the body is missing/empty or the content-type isn't an image; on an
  Anthropic API error, return a 502 with a short message (the frontend flags the page and
  continues).
- **Secret:** `ANTHROPIC_API_KEY` from the Worker env (`c.env.ANTHROPIC_API_KEY`), set via
  `wrangler secret put` in prod and a gitignored `.dev.vars` locally. Never hardcoded.

## Shared — extraction schema (`@cairn/shared`)

A plain zod schema (no transforms), distinct from the GPX `Route` contract, exported for
the Worker (output format) and the web app (mapping type):

```
ExtractedInstruction {
  fwdMile: number | null
  direction: Direction | null
  text: string
  gpsRaw: string | null
  lowConfidence: boolean
  note: string | null
}
ExtractedSegment { name: string; instructions: ExtractedInstruction[] }
ExtractedPage { segments: ExtractedSegment[] }
```

`Direction` is the existing enum. Structured-outputs JSON schema doesn't allow numeric/length
constraints, but this schema uses only types, the enum, and nullables — all supported.

## Frontend wiring (`web/`)

- **UploadView:** add a primary **"Extract with AI"** button. The Phase 2 **"Continue
  without extracting"** path stays as a fallback (manual entry still works).
- **Image downsize:** before sending, downscale each image to ≤~2200px on the long edge via
  a canvas (preserving aspect ratio) — keeps small table text legible, stays within vision
  limits, trims token cost. Images at or under the cap are sent unchanged.
- **Extraction orchestrator** (a hook): for each page in upload order, POST the (downsized)
  image bytes to `/api/extract`; map the returned `ExtractedPage` to editable segments/rows
  and **append** to the store; surface progress ("Page 2 of 5…"). A page that errors is
  flagged and skipped; the run continues. When done (or on first results), switch to the
  review view — **never auto-download**.
- **Mapping** (`ExtractedPage` → editable): `fwdMile` number→string (""/value),
  `direction` → `Direction | ""`, `text` verbatim, `gpsRaw` → `gpsRaw` (""/value),
  `lowConfidence` → `flagged`, `note` → `note`.
- **Store:** `EditableInstruction` gains `flagged: boolean` and `note: string` (defaults
  `false`/`""` for manually-added rows). Add an `appendSegments(segments)` bulk-load action.
- **Review table:** flagged rows get a ⚠ marker and an amber left border, the `note` shown
  on hover, and a one-click dismiss (clears `flagged`). The existing unreadable-GPS red
  state still applies. Segments append per page in upload order; if a segment continues
  across a page break the user merges/edits in review (no automatic cross-page merging).

## Testing

Plumbing only — vision accuracy is not unit-testable.

- **Mapping** (`web`): pure `extractedPageToSegments` — number/enum/null handling,
  flagged/note propagation. TDD.
- **Store** (`web`): `appendSegments` adds segments with ids; flagged/note round-trip.
- **Orchestrator** (`web`): with `fetch` mocked — iterates pages in order, appends results,
  reports progress, flags-and-continues on a failed page, switches to review.
- **Endpoint** (`api`): with the Anthropic call mocked — base64-encodes the image, calls
  with `claude-opus-4-8` and the `ExtractedPage` format, returns the parsed page; 400 on a
  missing/non-image body; 502 on an Anthropic error.
- **Image downsize** (`web`): a pure helper that computes target dimensions from source
  dimensions and the max long-edge cap (the canvas draw itself is exercised manually).

## Dev & verification

- Set `ANTHROPIC_API_KEY` in `api/.dev.vars` (gitignored); run `wrangler dev` + `vite`.
- Manual gate: upload a real multi-page route, click "Extract with AI", watch pages fill the
  table with flagged rows where the model was unsure, correct them, confirm the map matches
  the book, and download a valid GPX.

## Out of scope (later)

- Road-snapping / map-matching and the "snap to roads" toggle (Phase 4).
- Cross-page segment auto-merging, batch/parallel page extraction, and prompt-caching the
  system prompt across pages — possible optimizations, not needed for a first cut.
- Deployment (Cloudflare Pages + `wrangler deploy`).
