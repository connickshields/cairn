# Route Book → GPX, Phase 1 (Backend Spine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A stateless Cloudflare Worker that accepts a hand-written route JSON and returns a valid, road-followable-later GPX file.

**Architecture:** TypeScript Worker (Hono router). Four units built test-first: a zod data model, a DMS→decimal coordinate parser, a GPX-XML writer, and a single `POST /api/gpx` endpoint. The endpoint validates the body with zod (a transform runs the coordinate parser to fill decimal lat/lon from each fix's raw string) and returns GPX directly. No storage, no AI, no routing.

**Tech Stack:** TypeScript · Cloudflare Workers · Hono · zod · vitest · wrangler.

Spec: `docs/superpowers/specs/2026-06-05-route-book-gpx-phase1-design.md`

---

## File Structure

All code lives under `api/` (the future SPA will live under `web/`).

- `api/package.json` — deps and scripts (`test`, `dev`, `deploy`).
- `api/tsconfig.json` — strict TS config for the Worker.
- `api/wrangler.jsonc` — Worker config (name, entry, compatibility date).
- `api/vitest.config.ts` — vitest config (node environment).
- `api/.gitignore` — ignore `node_modules`, `.wrangler`, `dist`.
- `api/src/coords.ts` — `parseDmsCoordinate(input): LatLon`. Pure, no deps.
- `api/src/types.ts` — zod schemas + inferred types (`Direction`, `GpsFix`, `Instruction`, `RouteSegment`, `Route`). Imports the parser for the gps transform.
- `api/src/gpx.ts` — `buildGpx(route): string`. Pure, consumes the `Route` output type.
- `api/src/index.ts` — Hono app + `POST /api/gpx`. Default export = the Hono app.
- `api/test/coords.test.ts` — parser tests.
- `api/test/types.test.ts` — schema validation + transform tests.
- `api/test/gpx.test.ts` — GPX writer tests.
- `api/test/api.test.ts` — endpoint tests (via `app.request`).
- `api/test/e2e.test.ts` — full hand-written route → GPX verification gate.

**All commands below run from the `api/` directory unless stated otherwise.**

---

### Task 1: Scaffold the Worker project

**Files:**
- Create: `api/package.json`, `api/tsconfig.json`, `api/wrangler.jsonc`, `api/vitest.config.ts`, `api/.gitignore`, `api/src/index.ts`

- [ ] **Step 1: Create `api/package.json`**

```json
{
  "name": "cairn-api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "hono": "^4.6.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20241127.0",
    "fast-xml-parser": "^4.5.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "wrangler": "^3.90.0"
  }
}
```

- [ ] **Step 2: Create `api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `api/wrangler.jsonc`**

```jsonc
{
  "name": "cairn-api",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-01"
}
```

- [ ] **Step 4: Create `api/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 5: Create `api/.gitignore`**

```
node_modules/
.wrangler/
dist/
```

- [ ] **Step 6: Create `api/src/index.ts` (placeholder so install + typecheck resolve)**

```ts
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.text("cairn api"));

export default app;
```

- [ ] **Step 7: Install dependencies**

Run (from `api/`): `npm install`
Expected: completes without errors; creates `node_modules/` and `package-lock.json`.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: exits 0, no output.

- [ ] **Step 9: Commit**

```bash
git add api/package.json api/package-lock.json api/tsconfig.json api/wrangler.jsonc api/vitest.config.ts api/.gitignore api/src/index.ts
git commit -m "chore(api): scaffold cloudflare worker (hono + zod + vitest)"
```

---

### Task 2: Coordinate parser (DMS → decimal)

**Files:**
- Create: `api/src/coords.ts`
- Test: `api/test/coords.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/test/coords.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseDmsCoordinate } from "../src/coords";

describe("parseDmsCoordinate", () => {
  it("parses the sample coordinate to decimal degrees", () => {
    const { lat, lon } = parseDmsCoordinate("N38°28.59' W120°10.43'");
    expect(lat).toBeCloseTo(38.4765, 4);
    expect(lon).toBeCloseTo(-120.1738, 4);
  });

  it("makes south and west negative", () => {
    const { lat, lon } = parseDmsCoordinate("S01°30.00' E000°15.00'");
    expect(lat).toBeCloseTo(-1.5, 6);
    expect(lon).toBeCloseTo(0.25, 6);
  });

  it("tolerates extra whitespace and a prime symbol", () => {
    const { lat, lon } = parseDmsCoordinate("  N38°28.59′   W120°10.43′  ");
    expect(lat).toBeCloseTo(38.4765, 4);
    expect(lon).toBeCloseTo(-120.1738, 4);
  });

  it("throws on unparseable input", () => {
    expect(() => parseDmsCoordinate("not a coordinate")).toThrow();
  });

  it("throws when minutes are out of range", () => {
    expect(() => parseDmsCoordinate("N38°60.00' W120°10.43'")).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- coords`
Expected: FAIL — cannot resolve `../src/coords` / `parseDmsCoordinate is not a function`.

- [ ] **Step 3: Write the implementation**

Create `api/src/coords.ts`:

```ts
export interface LatLon {
  lat: number;
  lon: number;
}

// e.g. "N38°28.59' W120°10.43'" — hemisphere, degrees, decimal-minutes, prime.
const COORD_RE =
  /^\s*([NS])\s*(\d{1,3})\s*[°º]\s*(\d{1,2}(?:\.\d+)?)\s*['′]\s*([EW])\s*(\d{1,3})\s*[°º]\s*(\d{1,2}(?:\.\d+)?)\s*['′]\s*$/i;

export function parseDmsCoordinate(input: string): LatLon {
  const m = COORD_RE.exec(input);
  if (!m) {
    throw new Error(`Unparseable coordinate: ${JSON.stringify(input)}`);
  }
  const [, latH, latD, latM, lonH, lonD, lonM] = m;
  const lat = toDecimal(Number(latD), Number(latM), latH.toUpperCase() === "S");
  const lon = toDecimal(Number(lonD), Number(lonM), lonH.toUpperCase() === "W");
  if (lat < -90 || lat > 90) throw new Error(`Latitude out of range: ${lat}`);
  if (lon < -180 || lon > 180) throw new Error(`Longitude out of range: ${lon}`);
  return { lat, lon };
}

function toDecimal(degrees: number, minutes: number, negative: boolean): number {
  if (minutes >= 60) throw new Error(`Minutes out of range: ${minutes}`);
  const decimal = degrees + minutes / 60;
  return negative ? -decimal : decimal;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- coords`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add api/src/coords.ts api/test/coords.test.ts
git commit -m "feat(api): DMS decimal-minutes coordinate parser"
```

---

### Task 3: zod data model

**Files:**
- Create: `api/src/types.ts`
- Test: `api/test/types.test.ts`

The gps field accepts `{ raw }` and a transform fills `lat`/`lon` via the parser. `fwdMile`, `direction`, and `gps` are optional in input and normalize to `null`.

- [ ] **Step 1: Write the failing tests**

Create `api/test/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Route } from "../src/types";

const validRoute = {
  name: "Calaveras Dome Trail",
  segments: [
    {
      name: "Spur to the top of Calaveras Dome",
      instructions: [
        { fwdMile: 0.0, text: "Continue to the north and pass through seasonal closure gate." },
        { fwdMile: 0.2, direction: "SO", text: "Track on left." },
        {
          fwdMile: 1.8,
          direction: "BL",
          text: "Track on right is 7N19. Bear left onto 7N76Y.",
          gps: { raw: "N38°28.33' W120°12.45'" },
        },
      ],
    },
  ],
};

describe("Route schema", () => {
  it("accepts a valid route and fills decimal lat/lon from raw gps", () => {
    const parsed = Route.parse(validRoute);
    const gps = parsed.segments[0].instructions[2].gps;
    expect(gps).not.toBeNull();
    expect(gps!.raw).toBe("N38°28.33' W120°12.45'");
    expect(gps!.lat).toBeCloseTo(38.4722, 4);
    expect(gps!.lon).toBeCloseTo(-120.2075, 4);
  });

  it("normalizes omitted optional fields to null", () => {
    const parsed = Route.parse(validRoute);
    const first = parsed.segments[0].instructions[0];
    expect(first.direction).toBeNull();
    expect(first.gps).toBeNull();
  });

  it("rejects an unknown direction code", () => {
    const bad = structuredClone(validRoute);
    (bad.segments[0].instructions[1] as any).direction = "XX";
    expect(Route.safeParse(bad).success).toBe(false);
  });

  it("rejects a malformed gps raw string", () => {
    const bad = structuredClone(validRoute);
    (bad.segments[0].instructions[2] as any).gps = { raw: "garbage" };
    expect(Route.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- types`
Expected: FAIL — cannot resolve `../src/types`.

- [ ] **Step 3: Write the implementation**

Create `api/src/types.ts`:

```ts
import { z } from "zod";
import { parseDmsCoordinate } from "./coords";

export const Direction = z.enum(["SO", "BL", "BR", "TL", "TR", "UT"]);
export type Direction = z.infer<typeof Direction>;

export interface GpsFix {
  raw: string;
  lat: number;
  lon: number;
}

// Input is just { raw }; the transform fills decimal lat/lon via the parser.
const GpsFixInput = z
  .object({ raw: z.string() })
  .transform((value, ctx): GpsFix => {
    try {
      const { lat, lon } = parseDmsCoordinate(value.raw);
      return { raw: value.raw, lat, lon };
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: (err as Error).message,
      });
      return z.NEVER;
    }
  });

export const Instruction = z.object({
  fwdMile: z.number().nullish().transform((v) => v ?? null),
  direction: Direction.nullish().transform((v) => v ?? null),
  text: z.string(),
  gps: GpsFixInput.nullish().transform((v) => v ?? null),
});
export type Instruction = z.infer<typeof Instruction>;

export const RouteSegment = z.object({
  name: z.string(),
  instructions: z.array(Instruction),
});
export type RouteSegment = z.infer<typeof RouteSegment>;

export const Route = z.object({
  name: z.string(),
  segments: z.array(RouteSegment),
});
export type Route = z.infer<typeof Route>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- types`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add api/src/types.ts api/test/types.test.ts
git commit -m "feat(api): zod route data model with gps parsing transform"
```

---

### Task 4: GPX writer

**Files:**
- Create: `api/src/gpx.ts`
- Test: `api/test/gpx.test.ts`

Emits one `<trk>` per segment (trkpts = gps anchors in order) and one `<wpt>` per gps-bearing instruction (`desc` = text, `cmt` = mileage). Consumes the `Route` output type (gps already has decimal lat/lon).

- [ ] **Step 1: Write the failing tests**

Create `api/test/gpx.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { buildGpx } from "../src/gpx";
import type { Route } from "../src/types";

const route: Route = {
  name: "Test Trail",
  segments: [
    {
      name: "Main",
      instructions: [
        { fwdMile: 0.0, direction: null, text: "Start; go north.", gps: null },
        {
          fwdMile: 1.8,
          direction: "BL",
          text: "Bear left onto 7N76Y.",
          gps: { raw: "N38°28.33' W120°12.45'", lat: 38.472167, lon: -120.2075 },
        },
        {
          fwdMile: 2.8,
          direction: "SO",
          text: "Track on left ends & <done>.",
          gps: { raw: "N38°28.49' W120°13.26'", lat: 38.474833, lon: -120.221 },
        },
      ],
    },
  ],
};

describe("buildGpx", () => {
  const gpx = buildGpx(route);

  it("is a GPX 1.1 document", () => {
    expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(gpx).toContain('<gpx version="1.1"');
  });

  it("is well-formed XML that parses back to a gpx root", () => {
    expect(XMLValidator.validate(gpx)).toBe(true);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(gpx);
    expect(parsed.gpx).toBeDefined();
    expect(parsed.gpx.trk.name).toBe("Main");
  });

  it("emits one track named after the segment with the gps anchors as trkpts", () => {
    expect(gpx).toContain("<name>Main</name>");
    const trkpts = gpx.match(/<trkpt /g) ?? [];
    expect(trkpts).toHaveLength(2);
    expect(gpx).toContain('<trkpt lat="38.472167" lon="-120.207500">');
  });

  it("emits a waypoint per gps-bearing instruction with text in desc and mileage in cmt", () => {
    const wpts = gpx.match(/<wpt /g) ?? [];
    expect(wpts).toHaveLength(2);
    expect(gpx).toContain("<desc>Bear left onto 7N76Y.</desc>");
    expect(gpx).toContain("<cmt>mile 1.8</cmt>");
  });

  it("escapes XML special characters in an emitted waypoint's text", () => {
    expect(gpx).toContain("Track on left ends &amp; &lt;done&gt;.");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- gpx`
Expected: FAIL — cannot resolve `../src/gpx`.

- [ ] **Step 3: Write the implementation**

Create `api/src/gpx.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- gpx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add api/src/gpx.ts api/test/gpx.test.ts
git commit -m "feat(api): GPX 1.1 writer (tracks + waypoints)"
```

---

### Task 5: `POST /api/gpx` endpoint

**Files:**
- Modify: `api/src/index.ts`
- Test: `api/test/api.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/test/api.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import app from "../src/index";

const payload = {
  name: "Test Trail",
  segments: [
    {
      name: "Main",
      instructions: [
        {
          fwdMile: 1.8,
          direction: "BL",
          text: "Bear left onto 7N76Y.",
          gps: { raw: "N38°28.33' W120°12.45'" },
        },
      ],
    },
  ],
};

async function post(body: unknown): Promise<Response> {
  return app.request("/api/gpx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/gpx", () => {
  it("returns a GPX download for a valid route", async () => {
    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/gpx+xml");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    const text = await res.text();
    expect(text).toContain('<gpx version="1.1"');
    expect(text).toContain("<desc>Bear left onto 7N76Y.</desc>");
  });

  it("returns 400 for an invalid route", async () => {
    const res = await post({ name: "x", segments: "not an array" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when a gps raw string is malformed", async () => {
    const bad = structuredClone(payload);
    (bad.segments[0].instructions[0] as any).gps = { raw: "garbage" };
    const res = await post(bad);
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-JSON body", async () => {
    const res = await app.request("/api/gpx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- api`
Expected: FAIL — `/api/gpx` route does not exist (404), so the 200 assertion fails.

- [ ] **Step 3: Write the implementation**

Replace the contents of `api/src/index.ts`:

```ts
import { Hono } from "hono";
import { Route } from "./types";
import { buildGpx } from "./gpx";

const app = new Hono();

app.get("/", (c) => c.text("cairn api"));

app.post("/api/gpx", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (body === null) {
    return c.json({ error: "Body must be valid JSON" }, 400);
  }
  const parsed = Route.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid route", issues: parsed.error.issues }, 400);
  }
  const gpx = buildGpx(parsed.data);
  return new Response(gpx, {
    status: 200,
    headers: {
      "Content-Type": "application/gpx+xml",
      "Content-Disposition": 'attachment; filename="route.gpx"',
    },
  });
});

export default app;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- api`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add api/src/index.ts api/test/api.test.ts
git commit -m "feat(api): stateless POST /api/gpx endpoint"
```

---

### Task 6: End-to-end verification gate

Proves the spec's gate: a hand-written route (real data from `example_page.png`) produces valid GPX through the live worker.

**Files:**
- Create: `api/test/e2e.test.ts`

- [ ] **Step 1: Write the end-to-end test**

Create `api/test/e2e.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import app from "../src/index";

// Real rows from the "Spur to the top of Calaveras Dome" sub-section.
const calaverasSpur = {
  name: "Calaveras Dome Trail",
  segments: [
    {
      name: "Spur to the top of Calaveras Dome",
      instructions: [
        { fwdMile: 0.0, text: "Continue to the north and pass through seasonal closure gate." },
        { fwdMile: 0.2, direction: "SO", text: "Track on left." },
        { fwdMile: 0.5, direction: "SO", text: "Cross over Moore Creek." },
        {
          fwdMile: 1.8,
          direction: "BL",
          text: "Track on right is 7N19. Bear left onto 7N76Y.",
          gps: { raw: "N38°28.33' W120°12.45'" },
        },
        { fwdMile: 2.3, direction: "SO", text: "Track on right. Road turns from gravel to graded dirt." },
        {
          fwdMile: 2.8,
          direction: "SO",
          text: "Track on left ends after 0.2 miles.",
          gps: { raw: "N38°28.49' W120°13.26'" },
        },
      ],
    },
  ],
};

describe("end-to-end GPX generation", () => {
  it("turns the Calaveras spur into valid GPX with two anchors", async () => {
    const res = await app.request("/api/gpx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(calaverasSpur),
    });
    expect(res.status).toBe(200);
    const gpx = await res.text();

    expect(gpx).toContain("<name>Spur to the top of Calaveras Dome</name>");
    expect((gpx.match(/<trkpt /g) ?? [])).toHaveLength(2);
    expect((gpx.match(/<wpt /g) ?? [])).toHaveLength(2);
    expect(gpx).toContain("<desc>Track on left ends after 0.2 miles.</desc>");
    expect(gpx).toContain('<trkpt lat="38.472167" lon="-120.207500">');
  });
});
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS — all suites (coords, types, gpx, api, e2e) green.

- [ ] **Step 3: Manual smoke test against the live worker (optional but recommended)**

Run (from `api/`): `npm run dev` in one terminal, then in another:

```bash
curl -s -X POST http://localhost:8787/api/gpx \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke","segments":[{"name":"Main","instructions":[{"fwdMile":1.8,"direction":"BL","text":"Bear left onto 7N76Y.","gps":{"raw":"N38°28.33'\'' W120°12.45'\''"}}]}]}' \
  -o /tmp/route.gpx
```

Expected: `/tmp/route.gpx` contains a `<gpx>` document with one `<trkpt>` and one `<wpt>`. Optionally open it in a map tool (Gaia/Garmin BaseCamp/gpx.studio) to confirm it loads and the anchor lands in the right spot.

- [ ] **Step 4: Commit**

```bash
git add api/test/e2e.test.ts
git commit -m "test(api): end-to-end GPX verification gate"
```

---

## Done criteria

- `npm test` is green (coords, types, gpx, api, e2e).
- `npm run typecheck` passes.
- `POST /api/gpx` with a hand-written route returns a downloadable, valid GPX with one `<trk>` per segment, gps anchors as `<trkpt>`s, and a `<wpt>` per gps-bearing instruction carrying its verbatim text and mileage.

Stop here. Phase 2 (frontend shell + upload + review UI + map preview) does not begin until the user confirms.
