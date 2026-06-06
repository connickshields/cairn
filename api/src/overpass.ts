import type { OverpassJson } from "@cairn/shared";

// Public Overpass mirrors, tried in order. overpass-api.de is canonical but sits behind
// Cloudflare and intermittently returns 521 from a Cloudflare Worker, so non-CF mirrors
// are tried first; it remains in the list as a fallback.
export const OVERPASS_MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

// POST the query to each endpoint until one returns OK JSON; throw if all fail.
// A configured URL (env OVERPASS_URL) is tried first, then the built-in mirrors.
export async function fetchOverpass(query: string, configuredUrl?: string): Promise<OverpassJson> {
  const urls = configuredUrl ? [configuredUrl, ...OVERPASS_MIRRORS] : OVERPASS_MIRRORS;
  let lastError = "no endpoints tried";
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // Overpass throttles/blocks requests without a User-Agent.
          "User-Agent": "cairn/1.0 (overland route-book to GPX converter)",
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        lastError = `${url} → ${res.status}`;
        continue;
      }
      return (await res.json()) as OverpassJson;
    } catch (err) {
      lastError = `${url} → ${(err as Error).message}`;
    }
  }
  throw new Error(`all Overpass endpoints failed (last: ${lastError})`);
}
