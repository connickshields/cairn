import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, it, expect } from "vitest";
import { useRouteStore } from "../src/store";
import { PagesPanel } from "../src/components/PagesPanel";

beforeEach(() => useRouteStore.setState(useRouteStore.getInitialState(), true));

describe("PagesPanel", () => {
  it("shows an empty hint when there are no pages", () => {
    render(<PagesPanel />);
    expect(screen.getByText(/no pages/i)).toBeInTheDocument();
  });

  it("renders thumbnails and enlarges the clicked page", () => {
    useRouteStore.getState().addPages([
      { id: "p1", name: "one.jpg", url: "blob:1" },
      { id: "p2", name: "two.jpg", url: "blob:2" },
    ]);
    render(<PagesPanel />);
    const thumbs = screen.getAllByRole("button", { name: /page thumbnail/i });
    expect(thumbs).toHaveLength(2);
    fireEvent.click(thumbs[1]);
    expect(screen.getByAltText("two.jpg enlarged")).toBeInTheDocument();
  });
});
