import { useRouteStore } from "../store";
import { SegmentBlock } from "./SegmentBlock";

export function RouteTable() {
  const segments = useRouteStore((s) => s.segments);
  const addSegment = useRouteStore((s) => s.addSegment);

  return (
    <div>
      {segments.map((segment, i) => (
        <SegmentBlock key={segment.id} segment={segment} index={i} count={segments.length} />
      ))}
      <button className="text-sm font-medium text-blue-700" onClick={addSegment}>
        + Add segment
      </button>
    </div>
  );
}
