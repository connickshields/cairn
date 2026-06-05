import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.text("cairn api"));

export default app;
