import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch } from "../src/lib/apiClient";

const PW = "test-pw"; // dummy fixture, not a real credential

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("attaches Basic auth from the stored password", async () => {
    localStorage.setItem("cairn-api-password", PW);
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("/api/gpx", { method: "POST" });
    const headers = fetchMock.mock.calls[0][1]!.headers as Headers;
    expect(headers.get("Authorization")).toBe("Basic " + btoa(":" + PW));
  });

  it("clears the stored password and throws on 401", async () => {
    localStorage.setItem("cairn-api-password", "wrong");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    await expect(apiFetch("/api/gpx")).rejects.toThrow(/unauthorized/i);
    expect(localStorage.getItem("cairn-api-password")).toBeNull();
  });
});
