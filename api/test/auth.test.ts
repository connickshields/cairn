import { describe, it, expect } from "vitest";
import app from "../src/index";

const route = { name: "t", segments: [] };
const PW = "test-pw"; // dummy fixture, not a real credential
const basic = (user: string, pass: string) => "Basic " + btoa(`${user}:${pass}`);

function gpx(headers: Record<string, string>, env: Record<string, unknown>) {
  return app.request(
    "/api/gpx",
    { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(route) },
    env,
  );
}

describe("API password gate", () => {
  it("allows any request when CAIRN_API_PASSWORD is unset", async () => {
    expect((await gpx({}, {})).status).toBe(200);
  });

  it("rejects missing or wrong credentials when the password is set", async () => {
    expect((await gpx({}, { CAIRN_API_PASSWORD: PW })).status).toBe(401);
    expect((await gpx({ Authorization: basic("", "wrong") }, { CAIRN_API_PASSWORD: PW })).status).toBe(401);
  });

  it("accepts correct Basic credentials, ignoring the username", async () => {
    expect((await gpx({ Authorization: basic("", PW) }, { CAIRN_API_PASSWORD: PW })).status).toBe(200);
    expect((await gpx({ Authorization: basic("cairn", PW) }, { CAIRN_API_PASSWORD: PW })).status).toBe(200);
  });

  it("sends a WWW-Authenticate challenge on 401", async () => {
    const res = await gpx({}, { CAIRN_API_PASSWORD: PW });
    expect(res.headers.get("WWW-Authenticate")).toContain("Basic");
  });
});
