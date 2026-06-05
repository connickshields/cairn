# Phase 2 Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A React + Vite browser app where you upload page photos, hand-transcribe a multi-segment route into an editable table, watch it draw live on a map, and download the GPX from the Phase 1 Worker.

**Architecture:** Repo becomes an npm workspace. A shared package (`@cairn/shared`) holds the coordinate parser + zod data model (moved out of `api/`). The `web/` app keeps an editable route model in a Zustand store; pure helpers convert it to map anchors and to the `/api/gpx` payload. Vite proxies `/api` to `wrangler dev` (no CORS).

**Tech Stack:** TypeScript · npm workspaces · React + Vite · Tailwind · Zustand · react-leaflet · TanStack Query · vitest + React Testing Library. (Reordering is via ▲/▼ buttons wired to tested store actions; drag-and-drop is a deferred polish.)

Spec: `docs/superpowers/specs/2026-06-05-phase2-frontend-design.md`

---

## File Structure

```
package.json                      root, npm workspaces
packages/shared/
  package.json                    name @cairn/shared, exports ./src/index.ts
  tsconfig.json
  src/index.ts                    re-exports coords + types
  src/coords.ts                   (moved from api) parseDmsCoordinate
  src/types.ts                    (moved from api) zod model + RouteInput
  test/coords.test.ts             (moved from api)
  test/types.test.ts              (moved from api)
api/                              existing Worker, imports @cairn/shared
web/
  package.json
  index.html, vite.config.ts, tsconfig.json, tailwind.config.js, postcss.config.js
  src/main.tsx, src/App.tsx, src/index.css
  src/store.ts                    Zustand editable route store
  src/lib/anchors.ts              parseGps + deriveAnchors (pure)
  src/lib/serialize.ts            toRoutePayload (pure)
  src/components/UploadView.tsx
  src/components/ReviewView.tsx
  src/components/RouteTable.tsx
  src/components/SegmentBlock.tsx
  src/components/InstructionRow.tsx
  src/components/GpsCell.tsx
  src/components/MapPanel.tsx
  src/components/PagesPanel.tsx
  src/components/DownloadButton.tsx
  test/*.test.ts(x)
```

**Commands run from the directory named in each task.** The shared package is consumed as TS source (no build) — Vite, esbuild/wrangler, and tsc all resolve `@cairn/shared` → its `src/index.ts` via the workspace symlink.

---

### Task 1: npm workspace root + `@cairn/shared` package

**Files:**
- Create: `package.json` (root), `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`
- Move: `api/src/coords.ts` → `packages/shared/src/coords.ts`; `api/src/types.ts` → `packages/shared/src/types.ts`; `api/test/coords.test.ts` → `packages/shared/test/coords.test.ts`; `api/test/types.test.ts` → `packages/shared/test/types.test.ts`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "cairn",
  "private": true,
  "workspaces": ["packages/*", "api", "web"]
}
```

- [ ] **Step 2: Create `packages/shared/package.json`**

```json
{
  "name": "@cairn/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^4.0.0"
  }
}
```

- [ ] **Step 3: Create `packages/shared/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 4: Move the four files** (preserve git history)

Run (from repo root):
```bash
mkdir -p packages/shared/src packages/shared/test
git mv api/src/coords.ts packages/shared/src/coords.ts
git mv api/src/types.ts packages/shared/src/types.ts
git mv api/test/coords.test.ts packages/shared/test/coords.test.ts
git mv api/test/types.test.ts packages/shared/test/types.test.ts
```

- [ ] **Step 4b: Move the supply-chain cutoff to the workspace root**

With workspaces, all installs run from the repo root, so the 7-day publish-age cutoff
`.npmrc` must live at the root (npm only reads the cwd's `.npmrc`). The per-package lock is
superseded by a single root lock.

Run (from repo root):
```bash
git mv api/.npmrc .npmrc
git rm api/package-lock.json
```

- [ ] **Step 5: Fix the moved test imports**

In `packages/shared/test/coords.test.ts` and `packages/shared/test/types.test.ts` the imports `from "../src/coords"` and `from "../src/types"` are still correct (same relative layout). No change needed — verify they read `from "../src/coords"` / `from "../src/types"`.

- [ ] **Step 6: Create `packages/shared/src/index.ts`**

```ts
export * from "./coords";
export * from "./types";
```

- [ ] **Step 7: Add `RouteInput` export to `packages/shared/src/types.ts`**

Append to the end of `packages/shared/src/types.ts`:

```ts
// The accepted INPUT shape (gps as { raw }), distinct from the parsed output type.
export type RouteInput = z.input<typeof Route>;
```

- [ ] **Step 8: Install workspaces and run shared tests**

Run (from repo root):
```bash
npm install
npm test --workspace @cairn/shared
```
Expected: install links the workspaces; shared tests PASS (9 tests: 5 coords + 4 types).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: extract coords + zod model into @cairn/shared workspace package

Move api/.npmrc to repo root so the 7-day publish-age cutoff applies to all
workspace installs; drop the per-package lock in favor of the root lock."
```

---

### Task 2: Point `api/` at `@cairn/shared`

**Files:**
- Modify: `api/package.json`, `api/src/gpx.ts`, `api/src/index.ts`, `api/test/gpx.test.ts`

- [ ] **Step 1: Add the workspace dep to `api/package.json`**

In `api/package.json`, add to `dependencies` (and remove the now-unused `zod`, which lives in `@cairn/shared`):

```json
  "dependencies": {
    "@cairn/shared": "*",
    "hono": "^4.6.0"
  },
```

- [ ] **Step 2: Update `api/src/gpx.ts` import**

Change the first line of `api/src/gpx.ts` from:
```ts
import type { Instruction, Route, RouteSegment } from "./types";
```
to:
```ts
import type { Instruction, Route, RouteSegment } from "@cairn/shared";
```

- [ ] **Step 3: Update `api/src/index.ts` import**

Change in `api/src/index.ts`:
```ts
import { Route } from "./types";
```
to:
```ts
import { Route } from "@cairn/shared";
```

- [ ] **Step 4: Update `api/test/gpx.test.ts` import**

Change in `api/test/gpx.test.ts`:
```ts
import type { Route } from "../src/types";
```
to:
```ts
import type { Route } from "@cairn/shared";
```

- [ ] **Step 5: Reinstall and run the api suite + typecheck**

Run (from repo root):
```bash
npm install
npm test --workspace cairn-api
npm run typecheck --workspace cairn-api
```
Expected: api tests PASS (gpx 5 + api 4 + e2e 1 = 10 tests); typecheck exits 0. (`coords`/`types` tests now live in `@cairn/shared`.)

- [ ] **Step 6: Commit**

```bash
git add api/package.json api/src/gpx.ts api/src/index.ts api/test/gpx.test.ts package-lock.json
git commit -m "refactor(api): import data model from @cairn/shared"
```

---

### Task 3: Scaffold the `web/` app

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/postcss.config.js`, `web/tailwind.config.js`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/index.css`, `web/test/smoke.test.tsx`

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@cairn/shared": "*",
    "@tanstack/react-query": "^5.59.0",
    "leaflet": "^1.9.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-leaflet": "^4.2.1",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.0",
    "@types/leaflet": "^1.9.12",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `web/vite.config.ts`** (proxy `/api` → wrangler dev on 8787)

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
```

- [ ] **Step 4: Create `web/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Create `web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>cairn</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create Tailwind config files**

`web/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

`web/postcss.config.js`:
```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 7: Create `web/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Create `web/src/App.tsx`** (placeholder, replaced in Task 10)

```tsx
export default function App() {
  return <h1 className="p-4 text-xl font-semibold">cairn</h1>;
}
```

- [ ] **Step 9: Create `web/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import "leaflet/dist/leaflet.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 10: Create `web/test/smoke.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import App from "../src/App";

test("renders the app title", () => {
  render(<App />);
  expect(screen.getByText("cairn")).toBeInTheDocument();
});
```

- [ ] **Step 11: Install, test, typecheck**

Run (from repo root):
```bash
npm install
npm test --workspace web
npm run typecheck --workspace web
```
Expected: smoke test PASSES (1 test); typecheck exits 0.

- [ ] **Step 12: Commit**

```bash
git add web/ package-lock.json
git commit -m "feat(web): scaffold react + vite + tailwind app with /api proxy"
```

---

### Task 4: Editable route store (Zustand)

**Files:**
- Create: `web/src/store.ts`, `web/test/store.test.ts`

The store holds an **editable** model (string fields + stable ids), distinct from the validated `@cairn/shared` types.

- [ ] **Step 1: Write the failing tests** — Create `web/test/store.test.ts`:

```ts
import { beforeEach, describe, it, expect } from "vitest";
import { useRouteStore } from "../src/store";

function reset() {
  useRouteStore.setState(useRouteStore.getInitialState(), true);
}

describe("routeStore", () => {
  beforeEach(reset);

  it("starts on the upload view with no segments", () => {
    const s = useRouteStore.getState();
    expect(s.view).toBe("upload");
    expect(s.segments).toEqual([]);
  });

  it("adds a segment with one empty row", () => {
    useRouteStore.getState().addSegment();
    const seg = useRouteStore.getState().segments[0];
    expect(seg.name).toBe("");
    expect(seg.instructions).toHaveLength(1);
    expect(seg.instructions[0].text).toBe("");
  });

  it("updates a row field by id", () => {
    useRouteStore.getState().addSegment();
    const { id: segId, instructions } = useRouteStore.getState().segments[0];
    useRouteStore.getState().updateRow(segId, instructions[0].id, { text: "Track on left." });
    expect(useRouteStore.getState().segments[0].instructions[0].text).toBe("Track on left.");
  });

  it("adds and removes rows", () => {
    useRouteStore.getState().addSegment();
    const segId = useRouteStore.getState().segments[0].id;
    useRouteStore.getState().addRow(segId);
    expect(useRouteStore.getState().segments[0].instructions).toHaveLength(2);
    const rowId = useRouteStore.getState().segments[0].instructions[0].id;
    useRouteStore.getState().removeRow(segId, rowId);
    expect(useRouteStore.getState().segments[0].instructions).toHaveLength(1);
  });

  it("moves a row within a segment", () => {
    useRouteStore.getState().addSegment();
    const segId = useRouteStore.getState().segments[0].id;
    useRouteStore.getState().addRow(segId);
    const s = useRouteStore.getState().segments[0].instructions;
    useRouteStore.getState().updateRow(segId, s[0].id, { text: "first" });
    useRouteStore.getState().updateRow(segId, s[1].id, { text: "second" });
    useRouteStore.getState().moveRow(segId, 0, 1);
    const after = useRouteStore.getState().segments[0].instructions.map((i) => i.text);
    expect(after).toEqual(["second", "first"]);
  });

  it("adds, renames, moves, and removes segments", () => {
    const st = useRouteStore.getState();
    st.addSegment();
    st.addSegment();
    const [a, b] = useRouteStore.getState().segments;
    st.updateSegmentName(a.id, "Main");
    st.moveSegment(0, 1);
    expect(useRouteStore.getState().segments.map((s) => s.id)).toEqual([b.id, a.id]);
    st.removeSegment(b.id);
    expect(useRouteStore.getState().segments).toHaveLength(1);
  });

  it("tracks pages and the current view", () => {
    const st = useRouteStore.getState();
    st.addPages([{ id: "p1", name: "page1.jpg", url: "blob:1" }]);
    expect(useRouteStore.getState().pages).toHaveLength(1);
    st.setView("review");
    expect(useRouteStore.getState().view).toBe("review");
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace web -- store`. Expected: FAIL (cannot resolve `../src/store`).

- [ ] **Step 3: Write `web/src/store.ts`**

```ts
import { create } from "zustand";
import type { Direction } from "@cairn/shared";

export interface EditableInstruction {
  id: string;
  fwdMile: string;
  direction: Direction | "";
  text: string;
  gpsRaw: string;
}

export interface EditableSegment {
  id: string;
  name: string;
  instructions: EditableInstruction[];
}

export interface PageImage {
  id: string;
  name: string;
  url: string;
}

export interface RouteState {
  view: "upload" | "review";
  name: string;
  segments: EditableSegment[];
  pages: PageImage[];
  setView: (view: "upload" | "review") => void;
  setRouteName: (name: string) => void;
  addPages: (pages: PageImage[]) => void;
  removePage: (id: string) => void;
  movePage: (from: number, to: number) => void;
  addSegment: () => void;
  updateSegmentName: (segId: string, name: string) => void;
  removeSegment: (segId: string) => void;
  moveSegment: (from: number, to: number) => void;
  addRow: (segId: string) => void;
  updateRow: (segId: string, rowId: string, patch: Partial<EditableInstruction>) => void;
  removeRow: (segId: string, rowId: string) => void;
  moveRow: (segId: string, from: number, to: number) => void;
}

const uid = () => crypto.randomUUID();

function emptyRow(): EditableInstruction {
  return { id: uid(), fwdMile: "", direction: "", text: "", gpsRaw: "" };
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export const useRouteStore = create<RouteState>((set) => ({
  view: "upload",
  name: "",
  segments: [],
  pages: [],

  setView: (view) => set({ view }),
  setRouteName: (name) => set({ name }),

  addPages: (pages) => set((s) => ({ pages: [...s.pages, ...pages] })),
  removePage: (id) => set((s) => ({ pages: s.pages.filter((p) => p.id !== id) })),
  movePage: (from, to) => set((s) => ({ pages: move(s.pages, from, to) })),

  addSegment: () =>
    set((s) => ({ segments: [...s.segments, { id: uid(), name: "", instructions: [emptyRow()] }] })),
  updateSegmentName: (segId, name) =>
    set((s) => ({ segments: s.segments.map((seg) => (seg.id === segId ? { ...seg, name } : seg)) })),
  removeSegment: (segId) => set((s) => ({ segments: s.segments.filter((seg) => seg.id !== segId) })),
  moveSegment: (from, to) => set((s) => ({ segments: move(s.segments, from, to) })),

  addRow: (segId) =>
    set((s) => ({
      segments: s.segments.map((seg) =>
        seg.id === segId ? { ...seg, instructions: [...seg.instructions, emptyRow()] } : seg,
      ),
    })),
  updateRow: (segId, rowId, patch) =>
    set((s) => ({
      segments: s.segments.map((seg) =>
        seg.id === segId
          ? {
              ...seg,
              instructions: seg.instructions.map((row) =>
                row.id === rowId ? { ...row, ...patch } : row,
              ),
            }
          : seg,
      ),
    })),
  removeRow: (segId, rowId) =>
    set((s) => ({
      segments: s.segments.map((seg) =>
        seg.id === segId
          ? { ...seg, instructions: seg.instructions.filter((row) => row.id !== rowId) }
          : seg,
      ),
    })),
  moveRow: (segId, from, to) =>
    set((s) => ({
      segments: s.segments.map((seg) =>
        seg.id === segId ? { ...seg, instructions: move(seg.instructions, from, to) } : seg,
      ),
    })),
}));
```

- [ ] **Step 4: Run to verify pass** — Run: `npm test --workspace web -- store`. Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/store.ts web/test/store.test.ts
git commit -m "feat(web): editable route store (zustand)"
```

---

### Task 5: Pure helpers — gps parsing, map anchors, payload serialization

**Files:**
- Create: `web/src/lib/anchors.ts`, `web/src/lib/serialize.ts`, `web/test/anchors.test.ts`, `web/test/serialize.test.ts`

- [ ] **Step 1: Write the failing tests** — Create `web/test/anchors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseGps, deriveAnchors } from "../src/lib/anchors";
import type { EditableSegment } from "../src/store";

describe("parseGps", () => {
  it("reports empty for blank input", () => {
    expect(parseGps("")).toEqual({ status: "empty" });
    expect(parseGps("   ")).toEqual({ status: "empty" });
  });
  it("parses a valid coordinate", () => {
    const r = parseGps("N38°28.33' W120°12.45'");
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.lat).toBeCloseTo(38.4722, 4);
      expect(r.lon).toBeCloseTo(-120.2075, 4);
    }
  });
  it("reports error for garbage", () => {
    expect(parseGps("nope").status).toBe("error");
  });
});

describe("deriveAnchors", () => {
  const segs: EditableSegment[] = [
    {
      id: "s1",
      name: "Main",
      instructions: [
        { id: "a", fwdMile: "0.0", direction: "", text: "start", gpsRaw: "" },
        { id: "b", fwdMile: "1.8", direction: "BL", text: "anchor1", gpsRaw: "N38°28.33' W120°12.45'" },
        { id: "c", fwdMile: "2.8", direction: "SO", text: "bad", gpsRaw: "garbage" },
        { id: "d", fwdMile: "3.0", direction: "SO", text: "anchor2", gpsRaw: "N38°28.49' W120°13.26'" },
      ],
    },
  ];

  it("keeps only rows with a valid gps, in order, per segment", () => {
    const out = deriveAnchors(segs);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Main");
    expect(out[0].points.map((p) => p.text)).toEqual(["anchor1", "anchor2"]);
    expect(out[0].points[0].lat).toBeCloseTo(38.4722, 4);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace web -- anchors`. Expected: FAIL (cannot resolve `../src/lib/anchors`).

- [ ] **Step 3: Write `web/src/lib/anchors.ts`**

```ts
import { parseDmsCoordinate } from "@cairn/shared";
import type { EditableSegment } from "../store";

export type GpsParse =
  | { status: "empty" }
  | { status: "ok"; lat: number; lon: number }
  | { status: "error" };

export function parseGps(raw: string): GpsParse {
  if (raw.trim() === "") return { status: "empty" };
  try {
    const { lat, lon } = parseDmsCoordinate(raw);
    return { status: "ok", lat, lon };
  } catch {
    return { status: "error" };
  }
}

export interface AnchorPoint {
  id: string;
  lat: number;
  lon: number;
  text: string;
  fwdMile: string;
}

export interface SegmentAnchors {
  id: string;
  name: string;
  points: AnchorPoint[];
}

export function deriveAnchors(segments: EditableSegment[]): SegmentAnchors[] {
  return segments.map((seg) => ({
    id: seg.id,
    name: seg.name,
    points: seg.instructions.flatMap((row) => {
      const g = parseGps(row.gpsRaw);
      if (g.status !== "ok") return [];
      return [{ id: row.id, lat: g.lat, lon: g.lon, text: row.text, fwdMile: row.fwdMile }];
    }),
  }));
}
```

- [ ] **Step 4: Write the failing serialize tests** — Create `web/test/serialize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Route } from "@cairn/shared";
import { toRoutePayload } from "../src/lib/serialize";
import type { RouteState } from "../src/store";

const state = {
  name: "Calaveras",
  segments: [
    {
      id: "s1",
      name: "Spur",
      instructions: [
        { id: "a", fwdMile: "0.0", direction: "", text: "Continue north.", gpsRaw: "" },
        { id: "b", fwdMile: "1.8", direction: "BL", text: "Bear left.", gpsRaw: "N38°28.33' W120°12.45'" },
      ],
    },
  ],
} as unknown as RouteState;

describe("toRoutePayload", () => {
  it("maps the editable model to the API input shape", () => {
    const payload = toRoutePayload(state);
    expect(payload).toEqual({
      name: "Calaveras",
      segments: [
        {
          name: "Spur",
          instructions: [
            { fwdMile: null, direction: null, text: "Continue north.", gps: null },
            { fwdMile: 1.8, direction: "BL", text: "Bear left.", gps: { raw: "N38°28.33' W120°12.45'" } },
          ],
        },
      ],
    });
  });

  it("produces a payload that the shared Route schema accepts", () => {
    expect(Route.safeParse(toRoutePayload(state)).success).toBe(true);
  });

  it("treats non-numeric mileage as null", () => {
    const bad = { ...state, segments: [{ ...state.segments[0], instructions: [{ id: "x", fwdMile: "abc", direction: "", text: "t", gpsRaw: "" }] }] } as unknown as RouteState;
    expect(toRoutePayload(bad).segments[0].instructions[0].fwdMile).toBeNull();
  });
});
```

- [ ] **Step 5: Write `web/src/lib/serialize.ts`**

```ts
import type { RouteInput } from "@cairn/shared";
import type { RouteState } from "../store";

export function toRoutePayload(state: Pick<RouteState, "name" | "segments">): RouteInput {
  return {
    name: state.name,
    segments: state.segments.map((seg) => ({
      name: seg.name,
      instructions: seg.instructions.map((row) => {
        const n = Number(row.fwdMile);
        return {
          fwdMile: row.fwdMile.trim() === "" || Number.isNaN(n) ? null : n,
          direction: row.direction === "" ? null : row.direction,
          text: row.text,
          gps: row.gpsRaw.trim() === "" ? null : { raw: row.gpsRaw.trim() },
        };
      }),
    })),
  };
}
```

- [ ] **Step 6: Run both test files** — Run: `npm test --workspace web -- anchors serialize`. Expected: PASS (anchors 4 + serialize 3 = 7 tests).

- [ ] **Step 7: Commit**

```bash
git add web/src/lib web/test/anchors.test.ts web/test/serialize.test.ts
git commit -m "feat(web): pure helpers for gps parsing, map anchors, payload serialization"
```

---

### Task 6: GpsCell, DirectionSelect, InstructionRow

**Files:**
- Create: `web/src/components/GpsCell.tsx`, `web/src/components/DirectionSelect.tsx`, `web/src/components/InstructionRow.tsx`, `web/test/InstructionRow.test.tsx`

- [ ] **Step 1: Write the failing test** — Create `web/test/InstructionRow.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, it, expect } from "vitest";
import { useRouteStore } from "../src/store";
import { InstructionRow } from "../src/components/InstructionRow";

function seedRow() {
  useRouteStore.setState(useRouteStore.getInitialState(), true);
  useRouteStore.getState().addSegment();
  const seg = useRouteStore.getState().segments[0];
  return { segId: seg.id, row: seg.instructions[0] };
}

describe("InstructionRow", () => {
  beforeEach(() => seedRow());

  it("edits text into the store", () => {
    const { segId } = seedRow();
    const row = useRouteStore.getState().segments[0].instructions[0];
    render(<InstructionRow segId={segId} row={row} />);
    fireEvent.change(screen.getByPlaceholderText("Description"), { target: { value: "Track on left." } });
    expect(useRouteStore.getState().segments[0].instructions[0].text).toBe("Track on left.");
  });

  it("shows parsed coordinates for a valid gps string", () => {
    const { segId } = seedRow();
    const row = useRouteStore.getState().segments[0].instructions[0];
    render(<InstructionRow segId={segId} row={row} />);
    fireEvent.change(screen.getByPlaceholderText("Paste GPS"), {
      target: { value: "N38°28.33' W120°12.45'" },
    });
    const updated = useRouteStore.getState().segments[0].instructions[0];
    render(<InstructionRow segId={segId} row={updated} />);
    expect(screen.getAllByText(/38\.4722/)[0]).toBeInTheDocument();
  });

  it("flags an unparseable gps string", () => {
    const { segId } = seedRow();
    const row = { ...useRouteStore.getState().segments[0].instructions[0], gpsRaw: "garbage" };
    render(<InstructionRow segId={segId} row={row} />);
    expect(screen.getByText(/can't read/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace web -- InstructionRow`. Expected: FAIL (cannot resolve components).

- [ ] **Step 3: Write `web/src/components/DirectionSelect.tsx`**

```tsx
import type { Direction } from "@cairn/shared";

const OPTIONS: Direction[] = ["SO", "BL", "BR", "TL", "TR", "UT"];

export function DirectionSelect({
  value,
  onChange,
}: {
  value: Direction | "";
  onChange: (v: Direction | "") => void;
}) {
  return (
    <select
      aria-label="Direction"
      className="border rounded px-1 py-0.5 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value as Direction | "")}
    >
      <option value="">—</option>
      {OPTIONS.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 4: Write `web/src/components/GpsCell.tsx`**

```tsx
import { parseGps } from "../lib/anchors";

export function GpsCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed = parseGps(value);
  return (
    <div className="flex flex-col gap-0.5">
      <input
        placeholder="Paste GPS"
        className={`border rounded px-1 py-0.5 text-sm w-full ${
          parsed.status === "error" ? "border-red-500" : ""
        }`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {parsed.status === "ok" && (
        <span className="text-xs text-emerald-600">
          📍 {parsed.lat.toFixed(4)}, {parsed.lon.toFixed(4)}
        </span>
      )}
      {parsed.status === "error" && <span className="text-xs text-red-500">⚠ can't read coordinate</span>}
    </div>
  );
}
```

- [ ] **Step 5: Write `web/src/components/InstructionRow.tsx`**

```tsx
import { useRouteStore, type EditableInstruction } from "../store";
import { DirectionSelect } from "./DirectionSelect";
import { GpsCell } from "./GpsCell";
import { parseGps } from "../lib/anchors";

export function InstructionRow({
  segId,
  row,
  index,
  count,
}: {
  segId: string;
  row: EditableInstruction;
  index?: number;
  count?: number;
}) {
  const updateRow = useRouteStore((s) => s.updateRow);
  const removeRow = useRouteStore((s) => s.removeRow);
  const moveRow = useRouteStore((s) => s.moveRow);
  const isAnchor = parseGps(row.gpsRaw).status === "ok";

  return (
    <tr className={isAnchor ? "bg-amber-50" : ""}>
      <td className="px-1">
        <input
          aria-label="Mile"
          className="border rounded px-1 py-0.5 text-sm w-12"
          value={row.fwdMile}
          onChange={(e) => updateRow(segId, row.id, { fwdMile: e.target.value })}
        />
      </td>
      <td className="px-1">
        <DirectionSelect value={row.direction} onChange={(v) => updateRow(segId, row.id, { direction: v })} />
      </td>
      <td className="px-1">
        <input
          placeholder="Description"
          className="border rounded px-1 py-0.5 text-sm w-full"
          value={row.text}
          onChange={(e) => updateRow(segId, row.id, { text: e.target.value })}
        />
      </td>
      <td className="px-1 w-52">
        <GpsCell value={row.gpsRaw} onChange={(v) => updateRow(segId, row.id, { gpsRaw: v })} />
      </td>
      <td className="px-1 whitespace-nowrap">
        {index !== undefined && count !== undefined && (
          <>
            <button
              aria-label="Move row up"
              disabled={index === 0}
              className="disabled:opacity-30"
              onClick={() => moveRow(segId, index, index - 1)}
            >
              ▲
            </button>
            <button
              aria-label="Move row down"
              disabled={index === count - 1}
              className="disabled:opacity-30"
              onClick={() => moveRow(segId, index, index + 1)}
            >
              ▼
            </button>
          </>
        )}
        <button aria-label="Delete row" onClick={() => removeRow(segId, row.id)}>
          🗑
        </button>
      </td>
    </tr>
  );
}
```

- [ ] **Step 6: Run to verify pass** — Run: `npm test --workspace web -- InstructionRow`. Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add web/src/components/GpsCell.tsx web/src/components/DirectionSelect.tsx web/src/components/InstructionRow.tsx web/test/InstructionRow.test.tsx
git commit -m "feat(web): instruction row with direction select and live gps parsing"
```

---

### Task 7: SegmentBlock and RouteTable (add/delete/reorder)

**Files:**
- Create: `web/src/components/SegmentBlock.tsx`, `web/src/components/RouteTable.tsx`, `web/test/RouteTable.test.tsx`

Reorder is via ▲/▼ buttons wired to the store's `moveRow`/`moveSegment` (tested in Task 4). `InstructionRow` (Task 6) already renders the row ▲/▼ when given `index`/`count`; here `SegmentBlock` passes those and adds its own segment ▲/▼. Cross-segment row moves are out of scope for Phase 2 (delete + re-add); drag-and-drop is a deferred polish.

- [ ] **Step 1: Write the failing test** — Create `web/test/RouteTable.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, it, expect } from "vitest";
import { useRouteStore } from "../src/store";
import { RouteTable } from "../src/components/RouteTable";

beforeEach(() => useRouteStore.setState(useRouteStore.getInitialState(), true));

describe("RouteTable", () => {
  it("adds a segment when empty and shows the add-segment control", () => {
    render(<RouteTable />);
    fireEvent.click(screen.getByRole("button", { name: /add segment/i }));
    expect(useRouteStore.getState().segments).toHaveLength(1);
  });

  it("adds a row to a segment", () => {
    useRouteStore.getState().addSegment();
    render(<RouteTable />);
    fireEvent.click(screen.getByRole("button", { name: /add row/i }));
    expect(useRouteStore.getState().segments[0].instructions).toHaveLength(2);
  });

  it("edits the segment name", () => {
    useRouteStore.getState().addSegment();
    render(<RouteTable />);
    fireEvent.change(screen.getByPlaceholderText("Segment name"), { target: { value: "Main Trail" } });
    expect(useRouteStore.getState().segments[0].name).toBe("Main Trail");
  });

  it("reorders segments with the move buttons", () => {
    useRouteStore.getState().addSegment();
    useRouteStore.getState().addSegment();
    const [a, b] = useRouteStore.getState().segments;
    render(<RouteTable />);
    // segment 0's "up" is disabled; clicking segment 1's "up" swaps it above
    fireEvent.click(screen.getAllByRole("button", { name: /move segment up/i })[1]);
    expect(useRouteStore.getState().segments.map((s) => s.id)).toEqual([b.id, a.id]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace web -- RouteTable`. Expected: FAIL.

- [ ] **Step 3: Write `web/src/components/SegmentBlock.tsx`**

```tsx
import { useRouteStore, type EditableSegment } from "../store";
import { InstructionRow } from "./InstructionRow";

export function SegmentBlock({
  segment,
  index,
  count,
}: {
  segment: EditableSegment;
  index: number;
  count: number;
}) {
  const updateSegmentName = useRouteStore((s) => s.updateSegmentName);
  const removeSegment = useRouteStore((s) => s.removeSegment);
  const moveSegment = useRouteStore((s) => s.moveSegment);
  const addRow = useRouteStore((s) => s.addRow);

  return (
    <div className="mb-6 border rounded p-2">
      <div className="flex items-center gap-2 mb-2">
        <button
          aria-label="Move segment up"
          disabled={index === 0}
          className="disabled:opacity-30"
          onClick={() => moveSegment(index, index - 1)}
        >
          ▲
        </button>
        <button
          aria-label="Move segment down"
          disabled={index === count - 1}
          className="disabled:opacity-30"
          onClick={() => moveSegment(index, index + 1)}
        >
          ▼
        </button>
        <input
          placeholder="Segment name"
          className="flex-1 font-semibold border rounded px-2 py-1"
          value={segment.name}
          onChange={(e) => updateSegmentName(segment.id, e.target.value)}
        />
        <button className="text-sm text-red-600" onClick={() => removeSegment(segment.id)}>
          🗑 segment
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="w-14">Mile</th>
            <th className="w-16">Dir</th>
            <th>Description</th>
            <th className="w-52">GPS</th>
            <th className="w-16"></th>
          </tr>
        </thead>
        <tbody>
          {segment.instructions.map((row, i) => (
            <InstructionRow
              key={row.id}
              segId={segment.id}
              row={row}
              index={i}
              count={segment.instructions.length}
            />
          ))}
        </tbody>
      </table>
      <button className="mt-2 text-sm text-blue-600" onClick={() => addRow(segment.id)}>
        + Add row
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Write `web/src/components/RouteTable.tsx`**

```tsx
import { useRouteStore } from "../store";
import { SegmentBlock } from "./SegmentBlock";

export function RouteTable() {
  const segments = useRouteStore((s) => s.segments);
  const addSegment = useRouteStore((s) => s.addSegment);

  return (
    <div>
      {segments.map((segment, i) => (
        <SegmentBlock key={segment.id} segment={segment} index={i} count={segments.length} />
      ))}
      <button className="text-sm font-medium text-blue-700" onClick={addSegment}>
        + Add segment
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Run to verify pass** — Run: `npm test --workspace web -- RouteTable`. Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add web/src/components/SegmentBlock.tsx web/src/components/RouteTable.tsx web/test/RouteTable.test.tsx
git commit -m "feat(web): route table and segment blocks with add/delete"
```

---

### Task 8: MapPanel and PagesPanel

**Files:**
- Create: `web/src/components/MapPanel.tsx`, `web/src/components/PagesPanel.tsx`, `web/test/PagesPanel.test.tsx`

MapPanel rendering depends on Leaflet (DOM/canvas), so we do NOT unit-test its rendering — its data logic (`deriveAnchors`) is already tested in Task 5. PagesPanel is plain DOM and IS tested.

- [ ] **Step 1: Write the failing test** — Create `web/test/PagesPanel.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, it, expect } from "vitest";
import { useRouteStore } from "../src/store";
import { PagesPanel } from "../src/components/PagesPanel";

beforeEach(() => useRouteStore.setState(useRouteStore.getInitialState(), true));

describe("PagesPanel", () => {
  it("shows an empty hint when there are no pages", () => {
    render(<PagesPanel />);
    expect(screen.getByText(/no pages/i)).toBeInTheDocument();
  });

  it("renders thumbnails and enlarges the clicked page", () => {
    useRouteStore.getState().addPages([
      { id: "p1", name: "one.jpg", url: "blob:1" },
      { id: "p2", name: "two.jpg", url: "blob:2" },
    ]);
    render(<PagesPanel />);
    const thumbs = screen.getAllByRole("button", { name: /page thumbnail/i });
    expect(thumbs).toHaveLength(2);
    fireEvent.click(thumbs[1]);
    expect(screen.getByAltText("two.jpg enlarged")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace web -- PagesPanel`. Expected: FAIL.

- [ ] **Step 3: Write `web/src/components/PagesPanel.tsx`**

```tsx
import { useState } from "react";
import { useRouteStore } from "../store";

export function PagesPanel() {
  const pages = useRouteStore((s) => s.pages);
  const [selected, setSelected] = useState(0);

  if (pages.length === 0) {
    return <div className="p-4 text-sm text-gray-500">No pages uploaded.</div>;
  }
  const current = pages[Math.min(selected, pages.length - 1)];

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 overflow-x-auto p-2 border-b">
        {pages.map((p, i) => (
          <button
            key={p.id}
            aria-label="page thumbnail"
            className={`shrink-0 border rounded ${i === selected ? "ring-2 ring-blue-500" : ""}`}
            onClick={() => setSelected(i)}
          >
            <img src={p.url} alt={p.name} className="h-16 w-12 object-cover" />
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-2 flex items-start justify-center">
        <img src={current.url} alt={`${current.name} enlarged`} className="max-w-full" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `web/src/components/MapPanel.tsx`**

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
  const anchors = deriveAnchors(segments);
  const all: [number, number][] = anchors.flatMap((s) => s.points.map((p) => [p.lat, p.lon] as [number, number]));

  return (
    <MapContainer center={[38.47, -120.2]} zoom={11} className="h-full w-full">
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {anchors.map((seg) => {
        const line = seg.points.map((p) => [p.lat, p.lon] as [number, number]);
        return (
          <div key={seg.id}>
            {line.length > 1 && <Polyline positions={line} />}
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

> **Leaflet + Vite marker-icon gotcha:** Leaflet's default marker icons resolve to broken
> URLs under bundlers, so markers may render invisibly. If that happens during the Task 11
> manual gate, add this to `web/src/main.tsx` (and add `"vite/client"` to the `types` array
> in `web/tsconfig.json` so the PNG imports typecheck):
> ```ts
> import L from "leaflet";
> import icon2x from "leaflet/dist/images/marker-icon-2x.png";
> import icon from "leaflet/dist/images/marker-icon.png";
> import shadow from "leaflet/dist/images/marker-shadow.png";
> L.Icon.Default.mergeOptions({ iconRetinaUrl: icon2x, iconUrl: icon, shadowUrl: shadow });
> ```

- [ ] **Step 5: Run to verify pass** — Run: `npm test --workspace web -- PagesPanel`. Expected: PASS (2 tests). Then `npm run typecheck --workspace web` — exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/MapPanel.tsx web/src/components/PagesPanel.tsx web/test/PagesPanel.test.tsx
git commit -m "feat(web): live map panel and multi-page reference panel"
```

---

### Task 9: UploadView

Page order is reference-only in Phase 2 (it does not affect the GPX), so the upload view
supports add + remove but **not** reordering — page reordering UI is deferred (the
`movePage` store action exists for when it matters in Phase 3). This keeps Phase 2 focused.

**Files:**
- Create: `web/src/components/UploadView.tsx`, `web/test/UploadView.test.tsx`

- [ ] **Step 1: Write the failing test** — Create `web/test/UploadView.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { useRouteStore } from "../src/store";
import { UploadView } from "../src/components/UploadView";

beforeEach(() => {
  useRouteStore.setState(useRouteStore.getInitialState(), true);
  // jsdom lacks createObjectURL
  Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:fake"), writable: true });
});

describe("UploadView", () => {
  it("adds selected files as pages", () => {
    render(<UploadView />);
    const file = new File(["x"], "page1.jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText(/add page images/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(useRouteStore.getState().pages).toHaveLength(1);
    expect(useRouteStore.getState().pages[0].name).toBe("page1.jpg");
  });

  it("continue button switches to the review view", () => {
    useRouteStore.getState().addPages([{ id: "p1", name: "a.jpg", url: "blob:1" }]);
    render(<UploadView />);
    fireEvent.click(screen.getByRole("button", { name: /continue to review/i }));
    expect(useRouteStore.getState().view).toBe("review");
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace web -- UploadView`. Expected: FAIL.

- [ ] **Step 3: Write `web/src/components/UploadView.tsx`**

```tsx
import { useRouteStore } from "../store";

export function UploadView() {
  const pages = useRouteStore((s) => s.pages);
  const addPages = useRouteStore((s) => s.addPages);
  const removePage = useRouteStore((s) => s.removePage);
  const setView = useRouteStore((s) => s.setView);

  function onFiles(files: FileList | null) {
    if (!files) return;
    addPages(
      Array.from(files).map((f) => ({ id: crypto.randomUUID(), name: f.name, url: URL.createObjectURL(f) })),
    );
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

      <button
        className="mt-6 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-40"
        disabled={pages.length === 0}
        onClick={() => setView("review")}
      >
        Continue to review →
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npm test --workspace web -- UploadView`. Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/UploadView.tsx web/test/UploadView.test.tsx
git commit -m "feat(web): upload view with page thumbnails"
```

---

### Task 10: ReviewView, DownloadButton, and App wiring

**Files:**
- Create: `web/src/components/ReviewView.tsx`, `web/src/components/DownloadButton.tsx`, `web/test/DownloadButton.test.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Write the failing test** — Create `web/test/DownloadButton.test.tsx`:

```tsx
import type { ReactNode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouteStore } from "../src/store";
import { DownloadButton } from "../src/components/DownloadButton";

function wrap(ui: ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  useRouteStore.setState(useRouteStore.getInitialState(), true);
  useRouteStore.getState().setRouteName("Calaveras");
  useRouteStore.getState().addSegment();
});

describe("DownloadButton", () => {
  it("posts the serialized route to /api/gpx", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("<gpx></gpx>", { status: 200, headers: { "Content-Type": "application/gpx+xml" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:fake"), writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), writable: true });

    render(wrap(<DownloadButton />));
    fireEvent.click(screen.getByRole("button", { name: /download gpx/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/gpx");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body).name).toBe("Calaveras");
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npm test --workspace web -- DownloadButton`. Expected: FAIL.

- [ ] **Step 3: Write `web/src/components/DownloadButton.tsx`**

```tsx
import { useMutation } from "@tanstack/react-query";
import { useRouteStore } from "../store";
import { toRoutePayload } from "../lib/serialize";

export function DownloadButton() {
  const name = useRouteStore((s) => s.name);
  const segments = useRouteStore((s) => s.segments);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/gpx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toRoutePayload({ name, segments })),
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

- [ ] **Step 4: Run to verify pass** — Run: `npm test --workspace web -- DownloadButton`. Expected: PASS (1 test).

- [ ] **Step 5: Write `web/src/components/ReviewView.tsx`** (layout C — wide table left, tabbed Map/Pages right)

```tsx
import { useState } from "react";
import { useRouteStore } from "../store";
import { RouteTable } from "./RouteTable";
import { MapPanel } from "./MapPanel";
import { PagesPanel } from "./PagesPanel";
import { DownloadButton } from "./DownloadButton";

export function ReviewView() {
  const name = useRouteStore((s) => s.name);
  const setRouteName = useRouteStore((s) => s.setRouteName);
  const setView = useRouteStore((s) => s.setView);
  const [tab, setTab] = useState<"map" | "pages">("map");

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center gap-3 border-b px-4 py-2">
        <button className="text-sm text-gray-600" onClick={() => setView("upload")}>
          ← Upload
        </button>
        <input
          aria-label="Route name"
          placeholder="Route name"
          className="font-semibold border rounded px-2 py-1"
          value={name}
          onChange={(e) => setRouteName(e.target.value)}
        />
        <div className="ml-auto">
          <DownloadButton />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="w-3/5 overflow-auto p-4 border-r">
          <RouteTable />
        </div>
        <div className="w-2/5 flex flex-col min-h-0">
          <div className="flex border-b text-sm">
            <button
              className={`px-3 py-2 ${tab === "map" ? "border-b-2 border-blue-600 font-medium" : "text-gray-500"}`}
              onClick={() => setTab("map")}
            >
              Map
            </button>
            <button
              className={`px-3 py-2 ${tab === "pages" ? "border-b-2 border-blue-600 font-medium" : "text-gray-500"}`}
              onClick={() => setTab("pages")}
            >
              Pages
            </button>
          </div>
          <div className="flex-1 min-h-0">{tab === "map" ? <MapPanel /> : <PagesPanel />}</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Replace `web/src/App.tsx`** with the view switch

```tsx
import { useRouteStore } from "./store";
import { UploadView } from "./components/UploadView";
import { ReviewView } from "./components/ReviewView";

export default function App() {
  const view = useRouteStore((s) => s.view);
  return view === "upload" ? <UploadView /> : <ReviewView />;
}
```

- [ ] **Step 7: Fix the smoke test** — `web/test/smoke.test.tsx` asserted the old "cairn" title. Replace its body with:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach } from "vitest";
import { useRouteStore } from "../src/store";
import App from "../src/App";

beforeEach(() => useRouteStore.setState(useRouteStore.getInitialState(), true));

test("starts on the upload view", () => {
  render(<App />);
  expect(screen.getByText(/upload page photos/i)).toBeInTheDocument();
});
```

- [ ] **Step 8: Run full web suite + typecheck** — Run: `npm test --workspace web` then `npm run typecheck --workspace web`. Expected: all PASS; typecheck exit 0.

- [ ] **Step 9: Commit**

```bash
git add web/src/components/ReviewView.tsx web/src/components/DownloadButton.tsx web/src/App.tsx web/test/DownloadButton.test.tsx web/test/smoke.test.tsx
git commit -m "feat(web): review view (layout C) + download + app navigation"
```

---

### Task 11: Verification gate

Prove the whole app end to end against the live Worker.

**Files:** none (manual + full-suite run).

- [ ] **Step 1: Run every workspace's tests + typecheck**

Run (from repo root):
```bash
npm test --workspaces
npm run typecheck --workspace @cairn/shared
npm run typecheck --workspace cairn-api
npm run typecheck --workspace web
```
Expected: all suites green (shared, api, web); all typechecks exit 0.

- [ ] **Step 2: Manual end-to-end run**

In two terminals:
```bash
# terminal 1 (repo root)
npm run dev --workspace cairn-api      # wrangler dev on :8787
# terminal 2 (repo root)
npm run dev --workspace web            # vite on :5173
```
Then in the browser at the Vite URL:
1. Upload 1–2 page images → thumbnails appear → Continue to review.
2. Add a segment named "Spur to the top of Calaveras Dome"; add rows and type:
   - `1.8 / BL / Track on right is 7N19. Bear left onto 7N76Y. / N38°28.33' W120°12.45'`
   - `2.8 / SO / Track on left ends after 0.2 miles. / N38°28.49' W120°13.26'`
3. Confirm the GPS rows highlight and the Map tab draws two markers + a line, auto-fit.
4. Set a route name, click **Download GPX**, confirm a `.gpx` file downloads containing both `<trkpt>`s and `<wpt>`s.

Expected: the downloaded GPX matches what Phase 1 produces for the same data.

- [ ] **Step 3: Commit any final fixes** (if Step 2 surfaced issues)

```bash
git add -A
git commit -m "fix(web): address verification-gate findings"
```

---

## Done criteria

- `npm test --workspaces` green across shared, api, and web.
- All three workspaces typecheck clean.
- Local run: upload → hand-transcribe a multi-segment route → live map → Download GPX produces a valid file matching Phase 1 output.

Stop here. Phase 3 (vision extraction) does not begin until the user confirms.
