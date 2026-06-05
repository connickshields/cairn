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
