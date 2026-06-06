import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchOverpass, OVERPASS_MIRRORS } from "../src/overpass";

const json = { elements: [{ type: "node", id: 1, lat: 38, lon: -120 }] };

beforeEach(() => vi.unstubAllGlobals());

describe("fetchOverpass", () => {
  it("returns parsed JSON from the first endpoint that responds", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(json), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchOverpass("query");
    expect(out).toEqual(json);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls through to the next mirror when one returns a 5xx (e.g. Cloudflare 521)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("down", { status: 521 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(json), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchOverpass("query");
    expect(out).toEqual(json);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tries a configured URL first, then the built-in mirrors", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(json), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchOverpass("query", "https://custom.example/api");
    expect(fetchMock.mock.calls[0][0]).toBe("https://custom.example/api");
  });

  it("throws once every endpoint has failed", async () => {
    const fetchMock = vi.fn(async () => new Response("down", { status: 521 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchOverpass("query")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(OVERPASS_MIRRORS.length);
  });
});
