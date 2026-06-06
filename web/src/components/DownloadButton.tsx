import { useMutation } from "@tanstack/react-query";
import { useRouteStore } from "../store";
import { toRoutePayload } from "../lib/serialize";

export function DownloadButton() {
  const name = useRouteStore((s) => s.name);
  const segments = useRouteStore((s) => s.segments);
  const snapped = useRouteStore((s) => s.snapped);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/gpx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toRoutePayload({ name, segments }, snapped)),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      return res.blob();
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name || "route"}.gpx`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <div className="flex items-center gap-3">
      <button
        className="px-3 py-1.5 bg-emerald-600 text-white rounded disabled:opacity-40"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Generating…" : "Download GPX"}
      </button>
      {mutation.isError && <span className="text-sm text-red-600">{(mutation.error as Error).message}</span>}
    </div>
  );
}
