import { useRouteStore, type EditableInstruction } from "../store";
import { DirectionSelect } from "./DirectionSelect";
import { GpsCell } from "./GpsCell";
import { parseGps } from "../lib/anchors";

export function InstructionRow({
  segId,
  row,
  index,
  count,
}: {
  segId: string;
  row: EditableInstruction;
  index?: number;
  count?: number;
}) {
  const updateRow = useRouteStore((s) => s.updateRow);
  const removeRow = useRouteStore((s) => s.removeRow);
  const moveRow = useRouteStore((s) => s.moveRow);
  const isAnchor = parseGps(row.gpsRaw).status === "ok";

  return (
    <tr className={isAnchor ? "bg-amber-50" : ""}>
      <td className="px-1">
        <input
          aria-label="Mile"
          className="border rounded px-1 py-0.5 text-sm w-12"
          value={row.fwdMile}
          onChange={(e) => updateRow(segId, row.id, { fwdMile: e.target.value })}
        />
      </td>
      <td className="px-1">
        <DirectionSelect value={row.direction} onChange={(v) => updateRow(segId, row.id, { direction: v })} />
      </td>
      <td className="px-1">
        <input
          placeholder="Description"
          className="border rounded px-1 py-0.5 text-sm w-full"
          value={row.text}
          onChange={(e) => updateRow(segId, row.id, { text: e.target.value })}
        />
      </td>
      <td className="px-1 w-52">
        <GpsCell value={row.gpsRaw} onChange={(v) => updateRow(segId, row.id, { gpsRaw: v })} />
      </td>
      <td className="px-1 whitespace-nowrap">
        {index !== undefined && count !== undefined && (
          <>
            <button
              aria-label="Move row up"
              disabled={index === 0}
              className="disabled:opacity-30"
              onClick={() => moveRow(segId, index, index - 1)}
            >
              ▲
            </button>
            <button
              aria-label="Move row down"
              disabled={index === count - 1}
              className="disabled:opacity-30"
              onClick={() => moveRow(segId, index, index + 1)}
            >
              ▼
            </button>
          </>
        )}
        <button aria-label="Delete row" onClick={() => removeRow(segId, row.id)}>
          🗑
        </button>
      </td>
    </tr>
  );
}
