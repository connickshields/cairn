import { useState } from "react";
import { useRouteStore } from "../store";
import { runExtraction, extractPageViaApi } from "../lib/extractRun";
import { buildSnapRequest, requestSnap, snapResponseToStore } from "../lib/snapClient";
import { Spinner } from "./Spinner";

type Status =
  | { kind: "idle" }
  | { kind: "extracting"; done: number; total: number }
  | { kind: "snapping" };

export function UploadView() {
  const pages = useRouteStore((s) => s.pages);
  const addPages = useRouteStore((s) => s.addPages);
  const removePage = useRouteStore((s) => s.removePage);
  const appendSegments = useRouteStore((s) => s.appendSegments);
  const setView = useRouteStore((s) => s.setView);
  const setSnapped = useRouteStore((s) => s.setSnapped);
  const setSnapEnabled = useRouteStore((s) => s.setSnapEnabled);
  const clearSnap = useRouteStore((s) => s.clearSnap);

  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [failed, setFailed] = useState<string[]>([]);
  const busy = status.kind !== "idle";

  function onFiles(files: FileList | null) {
    if (!files) return;
    addPages(
      Array.from(files).map((f) => ({ id: crypto.randomUUID(), name: f.name, url: URL.createObjectURL(f) })),
    );
  }

  // Snap to roads automatically once extraction finishes. Reads the freshly
  // appended segments from the store. Failures fall back to straight lines
  // silently — the user can retry from the review's "Snap to roads" toggle.
  async function autoSnap() {
    const segments = useRouteStore.getState().segments;
    const req = buildSnapRequest(segments);
    if (!req.segments.some((s) => s.anchors.length > 0)) return;
    setStatus({ kind: "snapping" });
    try {
      const resp = await requestSnap(req);
      setSnapped(snapResponseToStore(segments, resp));
      setSnapEnabled(true);
    } catch {
      clearSnap();
    }
  }

  async function onExtract() {
    setFailed([]);
    setStatus({ kind: "extracting", done: 0, total: pages.length });
    await runExtraction(pages, {
      extractPage: extractPageViaApi,
      appendSegments,
      onProgress: (done, total) => setStatus({ kind: "extracting", done, total }),
      onPageError: (page) => setFailed((f) => [...f, page.name]),
    });
    await autoSnap();
    setStatus({ kind: "idle" });
    setView("review");
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold mb-4">Upload page photos</h2>
      <label className="block border-2 border-dashed rounded p-8 text-center cursor-pointer text-gray-600">
        <span>Add page images</span>
        <input
          aria-label="Add page images"
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </label>

      <div className="flex flex-wrap gap-3 mt-4">
        {pages.map((p) => (
          <div key={p.id} className="relative">
            <img src={p.url} alt={p.name} className="h-24 w-20 object-cover border rounded" />
            <button
              aria-label={`remove ${p.name}`}
              className="absolute top-0 right-0 bg-white rounded-bl px-1 text-red-600"
              onClick={() => removePage(p.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {status.kind === "extracting" && (
        <p className="mt-4 text-sm text-gray-600">
          <Spinner
            label={`Reading page ${Math.min(status.done + 1, status.total)} of ${status.total}…`}
          />
        </p>
      )}
      {status.kind === "snapping" && (
        <p className="mt-4 text-sm text-gray-600">
          <Spinner label="Snapping route to roads…" />
        </p>
      )}
      {failed.length > 0 && (
        <p className="mt-2 text-sm text-red-600">Could not extract: {failed.join(", ")}</p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-40"
          disabled={pages.length === 0 || busy}
          onClick={onExtract}
        >
          {busy ? <Spinner label="Processing…" ring="border-blue-300 border-t-white" /> : "Extract with AI"}
        </button>
        <button
          className="px-4 py-2 border rounded disabled:opacity-40"
          disabled={pages.length === 0 || busy}
          onClick={() => setView("review")}
        >
          Continue without extracting →
        </button>
      </div>
    </div>
  );
}
