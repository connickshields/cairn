# Phase 3 Vision Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /api/extract` (Claude Opus 4.8 vision → structured route JSON) and wire the frontend so "Extract with AI" fills the review table per page, with low-confidence rows flagged for the human.

**Architecture:** A new shared zod `ExtractedPage` schema (no transforms) feeds both the Worker's structured-output call and the frontend mapping. The Worker base64-encodes one page image and calls the Anthropic SDK's `messages.parse()` with that schema. The frontend downsizes each image, POSTs it per page via an injectable orchestrator that appends results to the Zustand store, and the review table highlights flagged rows. The model returns raw GPS strings only; decimals are computed by our existing parser.

**Tech Stack:** TypeScript · Cloudflare Workers · Hono · `@anthropic-ai/sdk` (structured outputs + adaptive thinking) · zod · React + Vite · vitest.

Spec: `docs/superpowers/specs/2026-06-05-phase3-extraction-design.md`

---

## File Structure

```
packages/shared/
  src/extract.ts            ExtractedPage / ExtractedSegment / ExtractedInstruction zod + types
  src/index.ts              (modify) re-export ./extract
  test/extract.test.ts
api/
  package.json              (modify) add @anthropic-ai/sdk
  .dev.vars.example         documents ANTHROPIC_API_KEY for local dev
  src/extract.ts            EXTRACTION_SYSTEM, arrayBufferToBase64, extractPage(client,...)
  src/index.ts              (modify) Env binding + POST /api/extract
  test/extract.test.ts      base64 + extractPage (fake client)
  test/extract-endpoint.test.ts   route behavior (extractPage mocked)
web/
  src/store.ts              (modify) EditableInstruction.flagged/note, emptyRow, appendSegments
  src/lib/extractMap.ts     extractedPageToSegments
  src/lib/image.ts          computeDownsize (pure) + downscaleImage (canvas, untested)
  src/lib/extractRun.ts     runExtraction orchestrator + extractPageViaApi
  src/components/UploadView.tsx       (modify) "Extract with AI" button
  src/components/InstructionRow.tsx   (modify) flagged marker + dismiss
  test/extractMap.test.ts
  test/image.test.ts
  test/extractRun.test.ts
  test/store.test.ts        (modify) appendSegments
  test/anchors.test.ts      (modify) fixture gains flagged/note
.gitignore                  (modify) ignore .dev.vars
```

**Commands run from the repo root with the workspace flag.** Dependencies for `web` and `@cairn/shared` are already installed; the only new install is `@anthropic-ai/sdk` in `api` (Task 2).

---

### Task 1: Shared `ExtractedPage` schema

**Files:**
- Create: `packages/shared/src/extract.ts`, `packages/shared/test/extract.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test** — Create `packages/shared/test/extract.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ExtractedPage } from "../src/extract";

const validPage = {
  segments: [
    {
      name: "Spur to the top of Calaveras Dome",
      instructions: [
        { fwdMile: 0.0, direction: null, text: "Continue north.", gpsRaw: null, lowConfidence: false, note: null },
        {
          fwdMile: 1.8,
          direction: "BL",
          text: "Bear left onto 7N76Y.",
          gpsRaw: "N38°28.33' W120°12.45'",
          lowConfidence: true,
          note: "mileage smudged",
        },
      ],
    },
  ],
};

describe("ExtractedPage schema", () => {
  it("accepts a valid extracted page", () => {
    const parsed = ExtractedPage.parse(validPage);
    expect(parsed.segments[0].instructions[1].lowConfidence).toBe(true);
    expect(parsed.segments[0].instructions[1].gpsRaw).toBe("N38°28.33' W120°12.45'");
  });

  it("rejects an unknown direction code", () => {
    const bad = JSON.parse(JSON.stringify(validPage));
    bad.segments[0].instructions[1].direction = "XX";
    expect(ExtractedPage.safeParse(bad).success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const bad = JSON.parse(JSON.stringify(validPage));
    delete bad.segments[0].instructions[0].lowConfidence;
    expect(ExtractedPage.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace @cairn/shared -- extract`. Expected: FAIL (cannot resolve `../src/extract`).

- [ ] **Step 3: Write `packages/shared/src/extract.ts`**

```ts
// zod/v4 (not the v3 the rest of @cairn/shared uses) so this schema can be passed directly
// to the Anthropic SDK's zodOutputFormat, which requires v4. Transform-free, so v4 is trivial
// here. Direction codes are inlined (a v4 object can't embed the v3 `Direction` enum).
import { z } from "zod/v4";

export const ExtractedDirection = z.enum(["SO", "BL", "BR", "TL", "TR", "UT"]);

export const ExtractedInstruction = z.object({
  fwdMile: z.number().nullable(),
  direction: ExtractedDirection.nullable(),
  text: z.string(),
  gpsRaw: z.string().nullable(),
  lowConfidence: z.boolean(),
  note: z.string().nullable(),
});
export type ExtractedInstruction = z.infer<typeof ExtractedInstruction>;

export const ExtractedSegment = z.object({
  name: z.string(),
  instructions: z.array(ExtractedInstruction),
});
export type ExtractedSegment = z.infer<typeof ExtractedSegment>;

export const ExtractedPage = z.object({
  segments: z.array(ExtractedSegment),
});
export type ExtractedPage = z.infer<typeof ExtractedPage>;
```

- [ ] **Step 4: Re-export from `packages/shared/src/index.ts`** — change it to:

```ts
export * from "./coords";
export * from "./types";
export * from "./extract";
```

- [ ] **Step 5: Run to verify pass** — Run: `npm test --workspace @cairn/shared -- extract` (3 tests) then `npm run typecheck --workspace @cairn/shared` (exit 0).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/extract.ts packages/shared/src/index.ts packages/shared/test/extract.test.ts
git commit -m "feat(shared): ExtractedPage schema for vision extraction"
```

---

### Task 2: Install the Anthropic SDK + API key plumbing

**Files:**
- Modify: `api/package.json`, `.gitignore`
- Create: `api/.dev.vars.example`

- [ ] **Step 1: Install the SDK** — Run (from repo root): `npm install @anthropic-ai/sdk --workspace api`. (The `.npmrc` 7-day cutoff applies; this resolves the latest `@anthropic-ai/sdk` published on or before 2026-05-29.) Expected: it's added to `api/package.json` `dependencies` and the root lock updates.

- [ ] **Step 2: Create `api/.dev.vars.example`**

```
# Copy to api/.dev.vars (gitignored) and fill in your key for local `wrangler dev`.
# In production: wrangler secret put ANTHROPIC_API_KEY
ANTHROPIC_API_KEY=
```

- [ ] **Step 3: Ignore `.dev.vars`** — append to `.gitignore` (root):

```
# Local Worker secrets
.dev.vars
```

- [ ] **Step 4: Enable `nodejs_compat`** — the SDK imports Node built-ins (`node:stream`, `node:fs/promises`), so the Workers runtime won't start without the flag. Add it to `api/wrangler.jsonc` so the file reads:

```jsonc
{
  "name": "cairn-api",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-01",
  "compatibility_flags": ["nodejs_compat"]
}
```

(Unit tests run in Node and won't catch this — only a live `wrangler dev` boot does, in the Task 10 gate.)

- [ ] **Step 5: Sanity build** — Run: `npm run typecheck --workspace api`. Expected: exit 0 (no source changes yet).

- [ ] **Step 6: Commit**

```bash
git add api/package.json api/.dev.vars.example api/wrangler.jsonc .gitignore package-lock.json
git commit -m "chore(api): add @anthropic-ai/sdk and ANTHROPIC_API_KEY plumbing"
```

---

### Task 3: Extraction core (`api/src/extract.ts`)

**Files:**
- Create: `api/src/extract.ts`, `api/test/extract.test.ts`

`extractPage` takes an injected `client` (the Anthropic SDK instance) so it's testable with a fake — no network, no module mocking.

- [ ] **Step 1: Write the failing test** — Create `api/test/extract.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { arrayBufferToBase64, extractPage } from "../src/extract";

describe("arrayBufferToBase64", () => {
  it("encodes bytes to base64", () => {
    const buf = new Uint8Array([72, 105]).buffer; // "Hi"
    expect(arrayBufferToBase64(buf)).toBe("SGk=");
  });
});

describe("extractPage", () => {
  const sample = { segments: [{ name: "Main", instructions: [] }] };

  function fakeClient(parsed: unknown) {
    return { messages: { parse: vi.fn(async () => ({ parsed_output: parsed })) } } as any;
  }

  it("calls the model with claude-opus-4-8 and returns parsed_output", async () => {
    const client = fakeClient(sample);
    const out = await extractPage({ client, imageBase64: "AAAA", mediaType: "image/png" });
    expect(out).toEqual(sample);
    const args = client.messages.parse.mock.calls[0][0];
    expect(args.model).toBe("claude-opus-4-8");
    expect(args.messages[0].content[0]).toMatchObject({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "AAAA" },
    });
  });

  it("throws when the model returns no structured output", async () => {
    const client = fakeClient(null);
    await expect(extractPage({ client, imageBase64: "AAAA", mediaType: "image/png" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace api -- extract` (matches both extract files; only `extract.test.ts` exists now). Expected: FAIL (cannot resolve `../src/extract`).

- [ ] **Step 3: Write `api/src/extract.ts`**

```ts
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ExtractedPage, type ExtractedPage as ExtractedPageT } from "@cairn/shared";

export const ALLOWED_MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type MediaType = (typeof ALLOWED_MEDIA)[number];

export const EXTRACTION_SYSTEM = [
  "You read a single scanned page from a printed overland/4x4 route guide and return its rows as structured data.",
  "",
  "The page is two-column. Read the LEFT column top-to-bottom, then the RIGHT column top-to-bottom.",
  "Each row has: a forward mileage (a small number next to a down-triangle ▼), an optional 2-letter direction code, and a description.",
  "Direction codes: SO (straight over), BL (bear left), BR (bear right), TL (turn left), TR (turn right), UT (u-turn). If a row has no code, use null.",
  "Capture the FORWARD view only (the black text and the ▼ mileage). IGNORE the reverse view (the blue text and the up-triangle ▲ mileage).",
  "Bold standalone headers (e.g. 'Spur to the top of Calaveras Dome', 'Continuation of Main Trail') are SEGMENT boundaries: start a new segment with that name. Rows before the first header belong to a segment with name \"\".",
  "GPS fixes appear as highlighted full-width bars like 'GPS: N38°28.59' W120°10.43''. Put the coordinate EXACTLY as printed into gpsRaw (do NOT convert to decimal). Rows without a fix have gpsRaw null.",
  "Set lowConfidence true and give a short note for any cell you are unsure about (smudged number, ambiguous code, hard-to-read coordinate). Otherwise lowConfidence false and note null.",
  "Transcribe descriptions verbatim. Do not invent rows or coordinates.",
].join("\n");

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function extractPage(opts: {
  client: Anthropic;
  imageBase64: string;
  mediaType: MediaType;
}): Promise<ExtractedPageT> {
  const res = await opts.client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(ExtractedPage) },
    system: EXTRACTION_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: opts.mediaType, data: opts.imageBase64 } },
          { type: "text", text: "Extract every row from this route-guide page into the schema." },
        ],
      },
    ],
  });
  if (!res.parsed_output) throw new Error("Extraction returned no structured output");
  return res.parsed_output;
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npm test --workspace api -- extract` then `npm run typecheck --workspace api`. Expected: the `arrayBufferToBase64` + `extractPage` tests PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add api/src/extract.ts api/test/extract.test.ts
git commit -m "feat(api): vision extraction core (prompt + structured-output call)"
```

---

### Task 4: `POST /api/extract` endpoint

**Files:**
- Modify: `api/src/index.ts`
- Create: `api/test/extract-endpoint.test.ts`

- [ ] **Step 1: Write the failing test** — Create `api/test/extract-endpoint.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sample = { segments: [{ name: "Main", instructions: [] }] };

// vi.mock is hoisted above imports, so any variable its factory references must be
// created with vi.hoisted (a plain top-level const would not be initialized yet).
const { extractPageMock } = vi.hoisted(() => ({ extractPageMock: vi.fn() }));

vi.mock("../src/extract", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, extractPage: extractPageMock };
});

import app from "../src/index";

const env = { ANTHROPIC_API_KEY: "test-key" };

beforeEach(() => {
  extractPageMock.mockReset();
  extractPageMock.mockResolvedValue(sample);
});

describe("POST /api/extract", () => {
  it("returns the extracted page for an image body", async () => {
    const res = await app.request(
      "/api/extract",
      { method: "POST", headers: { "Content-Type": "image/png" }, body: new Uint8Array([1, 2, 3]) },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(sample);
    expect(extractPageMock).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when the content-type is not an image", async () => {
    const res = await app.request(
      "/api/extract",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for an empty image body", async () => {
    const res = await app.request(
      "/api/extract",
      { method: "POST", headers: { "Content-Type": "image/png" }, body: new Uint8Array([]) },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 502 when extraction throws", async () => {
    extractPageMock.mockRejectedValueOnce(new Error("api down"));
    const res = await app.request(
      "/api/extract",
      { method: "POST", headers: { "Content-Type": "image/png" }, body: new Uint8Array([1, 2, 3]) },
      env,
    );
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace api -- extract-endpoint`. Expected: FAIL — the `/api/extract` route does not exist (404), so the 200 assertion fails.

- [ ] **Step 3: Update `api/src/index.ts`** — replace its contents with:

```ts
import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import { Route } from "@cairn/shared";
import { buildGpx } from "./gpx";
import { ALLOWED_MEDIA, arrayBufferToBase64, extractPage, type MediaType } from "./extract";

interface Env {
  ANTHROPIC_API_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

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

app.post("/api/extract", async (c) => {
  const contentType = c.req.header("content-type") ?? "";
  const mediaType = ALLOWED_MEDIA.find((m) => contentType.startsWith(m)) as MediaType | undefined;
  if (!mediaType) {
    return c.json({ error: "Body must be an image (jpeg, png, webp, or gif)" }, 400);
  }
  const buf = await c.req.arrayBuffer();
  if (buf.byteLength === 0) {
    return c.json({ error: "Empty image body" }, 400);
  }
  const client = new Anthropic({ apiKey: c.env.ANTHROPIC_API_KEY });
  try {
    const page = await extractPage({ client, imageBase64: arrayBufferToBase64(buf), mediaType });
    return c.json(page, 200);
  } catch (err) {
    return c.json({ error: "Extraction failed", detail: (err as Error).message }, 502);
  }
});

export default app;
```

- [ ] **Step 4: Run to verify pass** — Run: `npm test --workspace api` (full api suite: gpx, api, e2e, extract, extract-endpoint) then `npm run typecheck --workspace api`. Expected: all PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add api/src/index.ts api/test/extract-endpoint.test.ts
git commit -m "feat(api): POST /api/extract endpoint"
```

---

### Task 5: Store — flagged/note + `appendSegments`

**Files:**
- Modify: `web/src/store.ts`, `web/test/store.test.ts`, `web/test/anchors.test.ts`

- [ ] **Step 1: Write the failing test** — append this block inside the `describe("routeStore", ...)` in `web/test/store.test.ts` (after the existing tests, before the closing `});`):

```ts
  it("appends extracted segments", () => {
    const st = useRouteStore.getState();
    st.appendSegments([
      {
        id: "seg-x",
        name: "Spur",
        instructions: [
          { id: "r1", fwdMile: "1.8", direction: "BL", text: "Bear left.", gpsRaw: "N38°28.33' W120°12.45'", flagged: true, note: "smudged" },
        ],
      },
    ]);
    const seg = useRouteStore.getState().segments[0];
    expect(seg.name).toBe("Spur");
    expect(seg.instructions[0].flagged).toBe(true);
    expect(seg.instructions[0].note).toBe("smudged");
  });

  it("gives manually-added rows default flagged/note", () => {
    useRouteStore.getState().addSegment();
    const row = useRouteStore.getState().segments[0].instructions[0];
    expect(row.flagged).toBe(false);
    expect(row.note).toBe("");
  });
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace web -- store`. Expected: FAIL (`appendSegments` is not a function / `flagged` undefined).

- [ ] **Step 3: Update `web/src/store.ts`** — make three edits:

(a) Add `flagged`/`note` to the interface:

```ts
export interface EditableInstruction {
  id: string;
  fwdMile: string;
  direction: Direction | "";
  text: string;
  gpsRaw: string;
  flagged: boolean;
  note: string;
}
```

(b) Update `emptyRow` to default them:

```ts
function emptyRow(): EditableInstruction {
  return { id: uid(), fwdMile: "", direction: "", text: "", gpsRaw: "", flagged: false, note: "" };
}
```

(c) Add `appendSegments` to the `RouteState` interface (next to the other segment actions):

```ts
  appendSegments: (segments: EditableSegment[]) => void;
```

and to the store implementation (next to `addSegment`):

```ts
  appendSegments: (segments) => set((s) => ({ segments: [...s.segments, ...segments] })),
```

- [ ] **Step 4: Fix the `anchors.test.ts` fixture** — in `web/test/anchors.test.ts`, the `segs` fixture builds typed `EditableSegment[]`; add `flagged: false, note: ""` to each of its four instruction objects so they satisfy `EditableInstruction`. The instructions become:

```ts
        { id: "a", fwdMile: "0.0", direction: "", text: "start", gpsRaw: "", flagged: false, note: "" },
        { id: "b", fwdMile: "1.8", direction: "BL", text: "anchor1", gpsRaw: "N38°28.33' W120°12.45'", flagged: false, note: "" },
        { id: "c", fwdMile: "2.8", direction: "SO", text: "bad", gpsRaw: "garbage", flagged: false, note: "" },
        { id: "d", fwdMile: "3.0", direction: "SO", text: "anchor2", gpsRaw: "N38°28.49' W120°13.26'", flagged: false, note: "" },
```

- [ ] **Step 5: Run to verify pass** — Run: `npm test --workspace web -- store anchors` then `npm run typecheck --workspace web`. Expected: store (9 tests) + anchors (4 tests) PASS; typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/store.ts web/test/store.test.ts web/test/anchors.test.ts
git commit -m "feat(web): store gains flagged/note + appendSegments"
```

---

### Task 6: Extraction → editable mapping

**Files:**
- Create: `web/src/lib/extractMap.ts`, `web/test/extractMap.test.ts`

- [ ] **Step 1: Write the failing test** — Create `web/test/extractMap.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractedPageToSegments } from "../src/lib/extractMap";
import type { ExtractedPage } from "@cairn/shared";

const page: ExtractedPage = {
  segments: [
    {
      name: "Spur",
      instructions: [
        { fwdMile: 0, direction: null, text: "Continue north.", gpsRaw: null, lowConfidence: false, note: null },
        { fwdMile: 1.8, direction: "BL", text: "Bear left.", gpsRaw: "N38°28.33' W120°12.45'", lowConfidence: true, note: "smudged" },
      ],
    },
  ],
};

describe("extractedPageToSegments", () => {
  it("maps the extracted page to editable segments with ids", () => {
    const segs = extractedPageToSegments(page);
    expect(segs).toHaveLength(1);
    expect(segs[0].id).toBeTruthy();
    expect(segs[0].name).toBe("Spur");

    const [a, b] = segs[0].instructions;
    expect(a).toMatchObject({ fwdMile: "0", direction: "", text: "Continue north.", gpsRaw: "", flagged: false, note: "" });
    expect(b).toMatchObject({ fwdMile: "1.8", direction: "BL", gpsRaw: "N38°28.33' W120°12.45'", flagged: true, note: "smudged" });
    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace web -- extractMap`. Expected: FAIL (cannot resolve `../src/lib/extractMap`).

- [ ] **Step 3: Write `web/src/lib/extractMap.ts`**

```ts
import type { ExtractedPage } from "@cairn/shared";
import type { EditableInstruction, EditableSegment } from "../store";

const uid = () => crypto.randomUUID();

export function extractedPageToSegments(page: ExtractedPage): EditableSegment[] {
  return page.segments.map((seg) => ({
    id: uid(),
    name: seg.name,
    instructions: seg.instructions.map(
      (i): EditableInstruction => ({
        id: uid(),
        fwdMile: i.fwdMile === null ? "" : String(i.fwdMile),
        direction: i.direction ?? "",
        text: i.text,
        gpsRaw: i.gpsRaw ?? "",
        flagged: i.lowConfidence,
        note: i.note ?? "",
      }),
    ),
  }));
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npm test --workspace web -- extractMap` (1 test) then `npm run typecheck --workspace web` (exit 0).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/extractMap.ts web/test/extractMap.test.ts
git commit -m "feat(web): map extracted page to editable segments"
```

---

### Task 7: Image downsize helper

**Files:**
- Create: `web/src/lib/image.ts`, `web/test/image.test.ts`

`computeDownsize` is pure and tested. `downscaleImage` uses the canvas/DOM and is exercised in the manual gate (not unit-tested).

- [ ] **Step 1: Write the failing test** — Create `web/test/image.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeDownsize } from "../src/lib/image";

describe("computeDownsize", () => {
  it("leaves images at or under the cap unchanged", () => {
    expect(computeDownsize(1600, 1200, 2200)).toEqual({ width: 1600, height: 1200 });
  });
  it("scales the long edge down to the cap, preserving aspect ratio", () => {
    expect(computeDownsize(4400, 2200, 2200)).toEqual({ width: 2200, height: 1100 });
  });
  it("handles a tall image", () => {
    expect(computeDownsize(2000, 4000, 2000)).toEqual({ width: 1000, height: 2000 });
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace web -- image`. Expected: FAIL (cannot resolve `../src/lib/image`).

- [ ] **Step 3: Write `web/src/lib/image.ts`**

```ts
export function computeDownsize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height };
  const scale = maxEdge / long;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Browser-only: fetch the page image, downscale via canvas, return JPEG bytes.
// Not unit-tested (canvas/DOM); covered by the manual verification gate.
export async function downscaleImage(sourceUrl: string, maxEdge = 2200): Promise<Blob> {
  const bitmap = await createImageBitmap(await (await fetch(sourceUrl)).blob());
  const { width, height } = computeDownsize(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.9),
  );
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npm test --workspace web -- image` (3 tests) then `npm run typecheck --workspace web` (exit 0).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/image.ts web/test/image.test.ts
git commit -m "feat(web): image downsize helper for extraction uploads"
```

---

### Task 8: Extraction orchestrator

**Files:**
- Create: `web/src/lib/extractRun.ts`, `web/test/extractRun.test.ts`

`runExtraction` takes injected deps so it's unit-testable without network or canvas. `extractPageViaApi` (the real `extractPage` dep) is browser-only and covered by the manual gate.

- [ ] **Step 1: Write the failing test** — Create `web/test/extractRun.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { runExtraction } from "../src/lib/extractRun";
import type { PageImage } from "../src/store";
import type { ExtractedPage } from "@cairn/shared";

const pages: PageImage[] = [
  { id: "p1", name: "1.jpg", url: "blob:1" },
  { id: "p2", name: "2.jpg", url: "blob:2" },
];

function pageResult(name: string): ExtractedPage {
  return { segments: [{ name, instructions: [] }] };
}

describe("runExtraction", () => {
  it("extracts each page in order and appends results", async () => {
    const appendSegments = vi.fn();
    const onProgress = vi.fn();
    const onPageError = vi.fn();
    const extractPage = vi.fn(async (p: PageImage) => pageResult(p.id));

    await runExtraction(pages, { extractPage, appendSegments, onProgress, onPageError });

    expect(extractPage.mock.calls.map((c) => c[0].id)).toEqual(["p1", "p2"]);
    expect(appendSegments).toHaveBeenCalledTimes(2);
    expect(onPageError).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });

  it("flags a failed page and continues", async () => {
    const appendSegments = vi.fn();
    const onPageError = vi.fn();
    const extractPage = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(pageResult("p2"));

    await runExtraction(pages, { extractPage, appendSegments, onProgress: vi.fn(), onPageError });

    expect(onPageError).toHaveBeenCalledTimes(1);
    expect(appendSegments).toHaveBeenCalledTimes(1); // only the second page succeeded
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace web -- extractRun`. Expected: FAIL (cannot resolve `../src/lib/extractRun`).

- [ ] **Step 3: Write `web/src/lib/extractRun.ts`**

```ts
import { ExtractedPage } from "@cairn/shared";
import type { EditableSegment, PageImage } from "../store";
import { extractedPageToSegments } from "./extractMap";
import { downscaleImage } from "./image";

export interface ExtractDeps {
  extractPage: (page: PageImage) => Promise<ExtractedPage>;
  appendSegments: (segments: EditableSegment[]) => void;
  onProgress: (done: number, total: number) => void;
  onPageError: (page: PageImage, error: unknown) => void;
}

export async function runExtraction(pages: PageImage[], deps: ExtractDeps): Promise<void> {
  for (let i = 0; i < pages.length; i++) {
    deps.onProgress(i, pages.length);
    try {
      const page = await deps.extractPage(pages[i]);
      deps.appendSegments(extractedPageToSegments(page));
    } catch (error) {
      deps.onPageError(pages[i], error);
    }
  }
  deps.onProgress(pages.length, pages.length);
}

// Real dependency for runExtraction: downscale the page image and POST it.
export async function extractPageViaApi(page: PageImage): Promise<ExtractedPage> {
  const blob = await downscaleImage(page.url);
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": blob.type },
    body: blob,
  });
  if (!res.ok) throw new Error(`Extract failed: ${res.status}`);
  return ExtractedPage.parse(await res.json());
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npm test --workspace web -- extractRun` (2 tests) then `npm run typecheck --workspace web` (exit 0).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/extractRun.ts web/test/extractRun.test.ts
git commit -m "feat(web): per-page extraction orchestrator"
```

---

### Task 9: UI — "Extract with AI" button + flagged-row marker

**Files:**
- Modify: `web/src/components/UploadView.tsx`, `web/src/components/InstructionRow.tsx`, `web/test/InstructionRow.test.tsx`

- [ ] **Step 1: Write the failing test** — append this block inside the `describe("InstructionRow", ...)` in `web/test/InstructionRow.test.tsx` (before its closing `});`):

```ts
  it("marks a flagged row and dismisses the flag", () => {
    const { segId } = seedRow();
    const base = useRouteStore.getState().segments[0].instructions[0];
    const row = { ...base, flagged: true, note: "smudged mileage" };
    render(<InstructionRow segId={segId} row={row} />);
    expect(screen.getByLabelText(/low confidence/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /dismiss flag/i }));
    expect(useRouteStore.getState().segments[0].instructions[0].flagged).toBe(false);
  });
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace web -- InstructionRow`. Expected: FAIL (no low-confidence marker / dismiss button).

- [ ] **Step 3: Update `web/src/components/InstructionRow.tsx`** — add the flagged marker as the row's first cell and an amber border. Replace the opening `<tr ...>` and the Mile `<td>` with:

```tsx
    <tr className={`${isAnchor ? "bg-amber-50" : ""} ${row.flagged ? "border-l-4 border-amber-500" : ""}`}>
      <td className="px-1">
        {row.flagged && (
          <span className="inline-flex items-center gap-1">
            <span aria-label="low confidence" title={row.note || "Low confidence"}>
              ⚠
            </span>
            <button
              aria-label="dismiss flag"
              className="text-gray-400"
              onClick={() => updateRow(segId, row.id, { flagged: false })}
            >
              ✓
            </button>
          </span>
        )}
        <input
          aria-label="Mile"
          className="border rounded px-1 py-0.5 text-sm w-12"
          value={row.fwdMile}
          onChange={(e) => updateRow(segId, row.id, { fwdMile: e.target.value })}
        />
      </td>
```

(The rest of the component — Direction, Description, GPS, reorder/delete cells — is unchanged.)

- [ ] **Step 4: Run to verify pass (InstructionRow)** — Run: `npm test --workspace web -- InstructionRow`. Expected: PASS (4 tests).

- [ ] **Step 5: Wire "Extract with AI" into `web/src/components/UploadView.tsx`** — replace the file with:

```tsx
import { useState } from "react";
import { useRouteStore } from "../store";
import { runExtraction, extractPageViaApi } from "../lib/extractRun";

export function UploadView() {
  const pages = useRouteStore((s) => s.pages);
  const addPages = useRouteStore((s) => s.addPages);
  const removePage = useRouteStore((s) => s.removePage);
  const appendSegments = useRouteStore((s) => s.appendSegments);
  const setView = useRouteStore((s) => s.setView);

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);

  function onFiles(files: FileList | null) {
    if (!files) return;
    addPages(
      Array.from(files).map((f) => ({ id: crypto.randomUUID(), name: f.name, url: URL.createObjectURL(f) })),
    );
  }

  async function onExtract() {
    setFailed([]);
    setProgress({ done: 0, total: pages.length });
    await runExtraction(pages, {
      extractPage: extractPageViaApi,
      appendSegments,
      onProgress: (done, total) => setProgress({ done, total }),
      onPageError: (page) => setFailed((f) => [...f, page.name]),
    });
    setProgress(null);
    setView("review");
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold mb-4">Upload page photos</h2>
      <label className="block border-2 border-dashed rounded p-8 text-center cursor-pointer text-gray-600">
        <span>Add page images</span>
        <input
          aria-label="Add page images"
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </label>

      <div className="flex flex-wrap gap-3 mt-4">
        {pages.map((p) => (
          <div key={p.id} className="relative">
            <img src={p.url} alt={p.name} className="h-24 w-20 object-cover border rounded" />
            <button
              aria-label={`remove ${p.name}`}
              className="absolute top-0 right-0 bg-white rounded-bl px-1 text-red-600"
              onClick={() => removePage(p.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {progress && (
        <p className="mt-4 text-sm text-gray-600">
          Extracting page {Math.min(progress.done + 1, progress.total)} of {progress.total}…
        </p>
      )}
      {failed.length > 0 && (
        <p className="mt-2 text-sm text-red-600">Could not extract: {failed.join(", ")}</p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-40"
          disabled={pages.length === 0 || progress !== null}
          onClick={onExtract}
        >
          {progress ? "Extracting…" : "Extract with AI"}
        </button>
        <button
          className="px-4 py-2 border rounded disabled:opacity-40"
          disabled={pages.length === 0 || progress !== null}
          onClick={() => setView("review")}
        >
          Continue without extracting →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Update the existing UploadView test** — the fallback button is renamed to "Continue without extracting →", so `web/test/UploadView.test.tsx`'s selector `/continue to review/i` no longer matches. Update that test's click to `/continue without extracting/i` (it still asserts the fallback button switches to the review view). Run: `npm test --workspace web -- UploadView`. Expected: PASS (2 tests).

- [ ] **Step 7: Run full web suite + typecheck** — Run: `npm test --workspace web` then `npm run typecheck --workspace web`. Expected: all PASS; typecheck exit 0.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/UploadView.tsx web/src/components/InstructionRow.tsx web/test/InstructionRow.test.tsx web/test/UploadView.test.tsx
git commit -m "feat(web): Extract with AI button + flagged-row marker"
```

---

### Task 10: Verification gate

**Files:** none (full-suite + manual run).

- [ ] **Step 1: Run every workspace's tests + typechecks**

Run (from repo root):
```bash
npm test --workspaces
npm run typecheck --workspace @cairn/shared
npm run typecheck --workspace cairn-api
npm run typecheck --workspace web
```
Expected: all suites green (shared, api, web); all typechecks exit 0.

- [ ] **Step 2: Web production build**

Run: `npm run build --workspace web`. Expected: builds with no errors.

- [ ] **Step 3: Manual end-to-end run**

```bash
# api/.dev.vars must contain a real ANTHROPIC_API_KEY (cp api/.dev.vars.example api/.dev.vars and fill it)
npm run dev --workspace cairn-api      # wrangler dev on :8787 (loads .dev.vars)
npm run dev --workspace web            # vite on :5173
```
In the browser at the Vite URL:
1. Upload one or more real route-guide page photos.
2. Click **Extract with AI** → watch the per-page progress.
3. Land on the review screen pre-populated; confirm low-confidence rows show the ⚠ marker + amber border with the note on hover, and dismiss works.
4. Correct any errors, confirm the Map tab matches the book, set a route name, and **Download GPX** — a valid file downloads.

Expected: extraction populates the table, flags appear, and the downloaded GPX matches the corrected route.

- [ ] **Step 4: Commit any final fixes** (if Step 3 surfaced issues)

```bash
git add -A
git commit -m "fix(web): address Phase 3 verification-gate findings"
```

---

## Done criteria

- `npm test --workspaces` green across shared, api, and web; all three typecheck clean.
- `POST /api/extract` turns a page image into a validated `ExtractedPage` via Claude Opus 4.8 structured outputs (the Anthropic call is mocked in tests).
- Local run: upload → Extract with AI → review pre-populated with flagged rows → correct → Download GPX.

Stop here. Phase 4 (road-snapping) does not begin until the user confirms.
