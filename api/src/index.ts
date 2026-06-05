import { Hono } from "hono";
import { Route } from "@cairn/shared";
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
