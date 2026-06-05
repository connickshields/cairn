import { useState } from "react";
import { useRouteStore } from "../store";

export function PagesPanel() {
  const pages = useRouteStore((s) => s.pages);
  const [selected, setSelected] = useState(0);

  if (pages.length === 0) {
    return <div className="p-4 text-sm text-gray-500">No pages uploaded.</div>;
  }
  const current = pages[Math.min(selected, pages.length - 1)];

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 overflow-x-auto p-2 border-b">
        {pages.map((p, i) => (
          <button
            key={p.id}
            aria-label="page thumbnail"
            className={`shrink-0 border rounded ${i === selected ? "ring-2 ring-blue-500" : ""}`}
            onClick={() => setSelected(i)}
          >
            <img src={p.url} alt={p.name} className="h-16 w-12 object-cover" />
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-2 flex items-start justify-center">
        <img src={current.url} alt={`${current.name} enlarged`} className="max-w-full" />
      </div>
    </div>
  );
}
