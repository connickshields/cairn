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
