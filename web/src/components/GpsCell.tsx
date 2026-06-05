import { parseGps } from "../lib/anchors";

export function GpsCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed = parseGps(value);
  return (
    <div className="flex flex-col gap-0.5">
      <input
        placeholder="Paste GPS"
        className={`border rounded px-1 py-0.5 text-sm w-full ${
          parsed.status === "error" ? "border-red-500" : ""
        }`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {parsed.status === "ok" && (
        <span className="text-xs text-emerald-600">
          📍 {parsed.lat.toFixed(4)}, {parsed.lon.toFixed(4)}
        </span>
      )}
      {parsed.status === "error" && <span className="text-xs text-red-500">⚠ can't read coordinate</span>}
    </div>
  );
}
