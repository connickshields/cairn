import { ExtractedPage } from "@cairn/shared";
import type { EditableSegment, PageImage } from "../store";
import { extractedPageToSegments } from "./extractMap";
import { downscaleImage } from "./image";

export interface ExtractDeps {
  extractPage: (page: PageImage) => Promise<ExtractedPage>;
  appendSegments: (segments: EditableSegment[]) => void;
  onProgress: (done: number, total: number) => void;
  onPageError: (page: PageImage, error: unknown) => void;
}

export async function runExtraction(pages: PageImage[], deps: ExtractDeps): Promise<void> {
  for (let i = 0; i < pages.length; i++) {
    deps.onProgress(i, pages.length);
    try {
      const page = await deps.extractPage(pages[i]);
      deps.appendSegments(extractedPageToSegments(page));
    } catch (error) {
      deps.onPageError(pages[i], error);
    }
  }
  deps.onProgress(pages.length, pages.length);
}

// Real dependency for runExtraction: downscale the page image and POST it.
export async function extractPageViaApi(page: PageImage): Promise<ExtractedPage> {
  const blob = await downscaleImage(page.url);
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": blob.type },
    body: blob,
  });
  if (!res.ok) throw new Error(`Extract failed: ${res.status}`);
  return ExtractedPage.parse(await res.json());
}
