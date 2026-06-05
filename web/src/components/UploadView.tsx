import { useRouteStore } from "../store";

export function UploadView() {
  const pages = useRouteStore((s) => s.pages);
  const addPages = useRouteStore((s) => s.addPages);
  const removePage = useRouteStore((s) => s.removePage);
  const setView = useRouteStore((s) => s.setView);

  function onFiles(files: FileList | null) {
    if (!files) return;
    addPages(
      Array.from(files).map((f) => ({ id: crypto.randomUUID(), name: f.name, url: URL.createObjectURL(f) })),
    );
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

      <button
        className="mt-6 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-40"
        disabled={pages.length === 0}
        onClick={() => setView("review")}
      >
        Continue to review →
      </button>
    </div>
  );
}
