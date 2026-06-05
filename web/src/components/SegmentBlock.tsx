import { useRouteStore, type EditableSegment } from "../store";
import { InstructionRow } from "./InstructionRow";

export function SegmentBlock({
  segment,
  index,
  count,
}: {
  segment: EditableSegment;
  index: number;
  count: number;
}) {
  const updateSegmentName = useRouteStore((s) => s.updateSegmentName);
  const removeSegment = useRouteStore((s) => s.removeSegment);
  const moveSegment = useRouteStore((s) => s.moveSegment);
  const addRow = useRouteStore((s) => s.addRow);

  return (
    <div className="mb-6 border rounded p-2">
      <div className="flex items-center gap-2 mb-2">
        <button
          aria-label="Move segment up"
          disabled={index === 0}
          className="disabled:opacity-30"
          onClick={() => moveSegment(index, index - 1)}
        >
          ▲
        </button>
        <button
          aria-label="Move segment down"
          disabled={index === count - 1}
          className="disabled:opacity-30"
          onClick={() => moveSegment(index, index + 1)}
        >
          ▼
        </button>
        <input
          placeholder="Segment name"
          className="flex-1 font-semibold border rounded px-2 py-1"
          value={segment.name}
          onChange={(e) => updateSegmentName(segment.id, e.target.value)}
        />
        <button className="text-sm text-red-600" onClick={() => removeSegment(segment.id)}>
          🗑 segment
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="w-14">Mile</th>
            <th className="w-16">Dir</th>
            <th>Description</th>
            <th className="w-52">GPS</th>
            <th className="w-16"></th>
          </tr>
        </thead>
        <tbody>
          {segment.instructions.map((row, i) => (
            <InstructionRow
              key={row.id}
              segId={segment.id}
              row={row}
              index={i}
              count={segment.instructions.length}
            />
          ))}
        </tbody>
      </table>
      <button className="mt-2 text-sm text-blue-600" onClick={() => addRow(segment.id)}>
        + Add row
      </button>
    </div>
  );
}
