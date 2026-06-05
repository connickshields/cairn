import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, it, expect } from "vitest";
import { useRouteStore } from "../src/store";
import { RouteTable } from "../src/components/RouteTable";

beforeEach(() => useRouteStore.setState(useRouteStore.getInitialState(), true));

describe("RouteTable", () => {
  it("adds a segment when empty and shows the add-segment control", () => {
    render(<RouteTable />);
    fireEvent.click(screen.getByRole("button", { name: /add segment/i }));
    expect(useRouteStore.getState().segments).toHaveLength(1);
  });

  it("adds a row to a segment", () => {
    useRouteStore.getState().addSegment();
    render(<RouteTable />);
    fireEvent.click(screen.getByRole("button", { name: /add row/i }));
    expect(useRouteStore.getState().segments[0].instructions).toHaveLength(2);
  });

  it("edits the segment name", () => {
    useRouteStore.getState().addSegment();
    render(<RouteTable />);
    fireEvent.change(screen.getByPlaceholderText("Segment name"), { target: { value: "Main Trail" } });
    expect(useRouteStore.getState().segments[0].name).toBe("Main Trail");
  });

  it("reorders segments with the move buttons", () => {
    useRouteStore.getState().addSegment();
    useRouteStore.getState().addSegment();
    const [a, b] = useRouteStore.getState().segments;
    render(<RouteTable />);
    // segment 0's "up" is disabled; clicking segment 1's "up" swaps it above
    fireEvent.click(screen.getAllByRole("button", { name: /move segment up/i })[1]);
    expect(useRouteStore.getState().segments.map((s) => s.id)).toEqual([b.id, a.id]);
  });
});
