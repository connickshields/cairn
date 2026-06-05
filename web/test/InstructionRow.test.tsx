import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, it, expect } from "vitest";
import { useRouteStore } from "../src/store";
import { InstructionRow } from "../src/components/InstructionRow";

function seedRow() {
  useRouteStore.setState(useRouteStore.getInitialState(), true);
  useRouteStore.getState().addSegment();
  const seg = useRouteStore.getState().segments[0];
  return { segId: seg.id, row: seg.instructions[0] };
}

describe("InstructionRow", () => {
  beforeEach(() => seedRow());

  it("edits text into the store", () => {
    const { segId } = seedRow();
    const row = useRouteStore.getState().segments[0].instructions[0];
    render(<InstructionRow segId={segId} row={row} />);
    fireEvent.change(screen.getByPlaceholderText("Description"), { target: { value: "Track on left." } });
    expect(useRouteStore.getState().segments[0].instructions[0].text).toBe("Track on left.");
  });

  it("shows parsed coordinates for a valid gps string", () => {
    const { segId } = seedRow();
    const row = useRouteStore.getState().segments[0].instructions[0];
    render(<InstructionRow segId={segId} row={row} />);
    fireEvent.change(screen.getByPlaceholderText("Paste GPS"), {
      target: { value: "N38°28.33' W120°12.45'" },
    });
    const updated = useRouteStore.getState().segments[0].instructions[0];
    render(<InstructionRow segId={segId} row={updated} />);
    expect(screen.getAllByText(/38\.4722/)[0]).toBeInTheDocument();
  });

  it("flags an unparseable gps string", () => {
    const { segId } = seedRow();
    const row = { ...useRouteStore.getState().segments[0].instructions[0], gpsRaw: "garbage" };
    render(<InstructionRow segId={segId} row={row} />);
    expect(screen.getByText(/can't read/i)).toBeInTheDocument();
  });
});
