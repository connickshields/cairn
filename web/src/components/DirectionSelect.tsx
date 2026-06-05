import type { Direction } from "@cairn/shared";

const OPTIONS: Direction[] = ["SO", "BL", "BR", "TL", "TR", "UT"];

export function DirectionSelect({
  value,
  onChange,
}: {
  value: Direction | "";
  onChange: (v: Direction | "") => void;
}) {
  return (
    <select
      aria-label="Direction"
      className="border rounded px-1 py-0.5 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value as Direction | "")}
    >
      <option value="">—</option>
      {OPTIONS.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}
