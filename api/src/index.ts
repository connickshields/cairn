import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import {
  Route,
  SnapRequest,
  buildOverpassQuery,
  computeBbox,
  parseOverpassToGraph,
  snapRoute,
  type OverpassJson,
} from "@cairn/shared";
import { buildGpx } from "./gpx";
import { ALLOWED_MEDIA, arrayBufferToBase64, extractPage, type MediaType } from "./extract";

interface Env {
  ANTHROPIC_API_KEY: string;
  OVERPASS_URL?: string;
  CAIRN_API_PASSWORD?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("cairn api"));

// Password gate for the API. Off when CAIRN_API_PASSWORD is unset; otherwise requires
// HTTP Basic auth whose password matches the secret (the username is ignored).
app.use("/api/*", async (c, next) => {
  const required = c.env?.CAIRN_API_PASSWORD;
  if (!required) return next();
  const m = /^Basic\s+(.+)$/i.exec(c.req.header("authorization") ?? "");
  let ok = false;
  if (m) {
    try {
      const decoded = atob(m[1]);
      ok = decoded.slice(decoded.indexOf(":") + 1) === required;
    } catch {
      ok = false;
    }
  }
  if (!ok) {
    return c.json({ error: "Unauthorized" }, 401, { "WWW-Authenticate": 'Basic realm="cairn"' });
  }
  return next();
});

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

app.post("/api/snap", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = SnapRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid snap request", issues: parsed.error.issues }, 400);
  }
  const anchors = parsed.data.segments.flatMap((s) => s.anchors);
  if (anchors.length === 0) {
    return c.json({ segments: parsed.data.segments.map(() => ({ legs: [] })) }, 200);
  }
  const query = buildOverpassQuery(computeBbox(anchors, 300));
  const url = c.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
  let json: OverpassJson;
  try {
    const res = await fetch(url, {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Overpass throttles/blocks requests without a User-Agent — set one.
        "User-Agent": "cairn/1.0 (overland route-book to GPX converter)",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    json = (await res.json()) as OverpassJson;
  } catch (err) {
    return c.json({ error: "Overpass unavailable", detail: (err as Error).message }, 502);
  }
  return c.json(snapRoute(parsed.data, parseOverpassToGraph(json)), 200);
});

export default app;
