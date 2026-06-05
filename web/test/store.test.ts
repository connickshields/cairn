import { beforeEach, describe, it, expect } from "vitest";
import { useRouteStore } from "../src/store";

function reset() {
  useRouteStore.setState(useRouteStore.getInitialState(), true);
}

describe("routeStore", () => {
  beforeEach(reset);

  it("starts on the upload view with no segments", () => {
    const s = useRouteStore.getState();
    expect(s.view).toBe("upload");
    expect(s.segments).toEqual([]);
  });

  it("adds a segment with one empty row", () => {
    useRouteStore.getState().addSegment();
    const seg = useRouteStore.getState().segments[0];
    expect(seg.name).toBe("");
    expect(seg.instructions).toHaveLength(1);
    expect(seg.instructions[0].text).toBe("");
  });

  it("updates a row field by id", () => {
    useRouteStore.getState().addSegment();
    const { id: segId, instructions } = useRouteStore.getState().segments[0];
    useRouteStore.getState().updateRow(segId, instructions[0].id, { text: "Track on left." });
    expect(useRouteStore.getState().segments[0].instructions[0].text).toBe("Track on left.");
  });

  it("adds and removes rows", () => {
    useRouteStore.getState().addSegment();
    const segId = useRouteStore.getState().segments[0].id;
    useRouteStore.getState().addRow(segId);
    expect(useRouteStore.getState().segments[0].instructions).toHaveLength(2);
    const rowId = useRouteStore.getState().segments[0].instructions[0].id;
    useRouteStore.getState().removeRow(segId, rowId);
    expect(useRouteStore.getState().segments[0].instructions).toHaveLength(1);
  });

  it("moves a row within a segment", () => {
    useRouteStore.getState().addSegment();
    const segId = useRouteStore.getState().segments[0].id;
    useRouteStore.getState().addRow(segId);
    const s = useRouteStore.getState().segments[0].instructions;
    useRouteStore.getState().updateRow(segId, s[0].id, { text: "first" });
    useRouteStore.getState().updateRow(segId, s[1].id, { text: "second" });
    useRouteStore.getState().moveRow(segId, 0, 1);
    const after = useRouteStore.getState().segments[0].instructions.map((i) => i.text);
    expect(after).toEqual(["second", "first"]);
  });

  it("adds, renames, moves, and removes segments", () => {
    const st = useRouteStore.getState();
    st.addSegment();
    st.addSegment();
    const [a, b] = useRouteStore.getState().segments;
    st.updateSegmentName(a.id, "Main");
    st.moveSegment(0, 1);
    expect(useRouteStore.getState().segments.map((s) => s.id)).toEqual([b.id, a.id]);
    st.removeSegment(b.id);
    expect(useRouteStore.getState().segments).toHaveLength(1);
  });

  it("tracks pages and the current view", () => {
    const st = useRouteStore.getState();
    st.addPages([{ id: "p1", name: "page1.jpg", url: "blob:1" }]);
    expect(useRouteStore.getState().pages).toHaveLength(1);
    st.setView("review");
    expect(useRouteStore.getState().view).toBe("review");
  });

  it("appends extracted segments", () => {
    const st = useRouteStore.getState();
    st.appendSegments([
      {
        id: "seg-x",
        name: "Spur",
        instructions: [
          { id: "r1", fwdMile: "1.8", direction: "BL", text: "Bear left.", gpsRaw: "N38°28.33' W120°12.45'", flagged: true, note: "smudged" },
        ],
      },
    ]);
    const seg = useRouteStore.getState().segments[0];
    expect(seg.name).toBe("Spur");
    expect(seg.instructions[0].flagged).toBe(true);
    expect(seg.instructions[0].note).toBe("smudged");
  });

  it("gives manually-added rows default flagged/note", () => {
    useRouteStore.getState().addSegment();
    const row = useRouteStore.getState().segments[0].instructions[0];
    expect(row.flagged).toBe(false);
    expect(row.note).toBe("");
  });
});
