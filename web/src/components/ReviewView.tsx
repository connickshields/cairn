import { useState } from "react";
import { useRouteStore } from "../store";
import { RouteTable } from "./RouteTable";
import { MapPanel } from "./MapPanel";
import { PagesPanel } from "./PagesPanel";
import { DownloadButton } from "./DownloadButton";
import { buildSnapRequest, requestSnap, snapResponseToStore } from "../lib/snapClient";

export function ReviewView() {
  const name = useRouteStore((s) => s.name);
  const setRouteName = useRouteStore((s) => s.setRouteName);
  const setView = useRouteStore((s) => s.setView);
  const segments = useRouteStore((s) => s.segments);
  const snapEnabled = useRouteStore((s) => s.snapEnabled);
  const setSnapEnabled = useRouteStore((s) => s.setSnapEnabled);
  const setSnapped = useRouteStore((s) => s.setSnapped);
  const clearSnap = useRouteStore((s) => s.clearSnap);
  const [tab, setTab] = useState<"map" | "pages">("map");

  async function onToggleSnap(checked: boolean) {
    if (!checked) {
      clearSnap();
      return;
    }
    try {
      const resp = await requestSnap(buildSnapRequest(segments));
      setSnapped(snapResponseToStore(segments, resp));
      setSnapEnabled(true);
    } catch {
      clearSnap();
      alert("Couldn't snap to roads (Overpass unavailable); showing straight lines.");
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center gap-3 border-b px-4 py-2">
        <button className="text-sm text-gray-600" onClick={() => setView("upload")}>
          ← Upload
        </button>
        <input
          aria-label="Route name"
          placeholder="Route name"
          className="font-semibold border rounded px-2 py-1"
          value={name}
          onChange={(e) => setRouteName(e.target.value)}
        />
        <label className="ml-auto flex items-center gap-1 text-sm text-gray-700">
          <input type="checkbox" checked={snapEnabled} onChange={(e) => onToggleSnap(e.target.checked)} />
          Snap to roads
        </label>
        <div>
          <DownloadButton />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="w-3/5 overflow-auto p-4 border-r">
          <RouteTable />
        </div>
        <div className="w-2/5 flex flex-col min-h-0">
          <div className="flex border-b text-sm">
            <button
              className={`px-3 py-2 ${tab === "map" ? "border-b-2 border-blue-600 font-medium" : "text-gray-500"}`}
              onClick={() => setTab("map")}
            >
              Map
            </button>
            <button
              className={`px-3 py-2 ${tab === "pages" ? "border-b-2 border-blue-600 font-medium" : "text-gray-500"}`}
              onClick={() => setTab("pages")}
            >
              Pages
            </button>
          </div>
          <div className="flex-1 min-h-0">{tab === "map" ? <MapPanel /> : <PagesPanel />}</div>
        </div>
      </div>
    </div>
  );
}
