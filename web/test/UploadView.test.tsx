import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { useRouteStore } from "../src/store";
import { UploadView } from "../src/components/UploadView";

beforeEach(() => {
  useRouteStore.setState(useRouteStore.getInitialState(), true);
  // jsdom lacks createObjectURL
  Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:fake"), writable: true });
});

describe("UploadView", () => {
  it("adds selected files as pages", () => {
    render(<UploadView />);
    const file = new File(["x"], "page1.jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText(/add page images/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(useRouteStore.getState().pages).toHaveLength(1);
    expect(useRouteStore.getState().pages[0].name).toBe("page1.jpg");
  });

  it("the fallback continue button switches to the review view", () => {
    useRouteStore.getState().addPages([{ id: "p1", name: "a.jpg", url: "blob:1" }]);
    render(<UploadView />);
    fireEvent.click(screen.getByRole("button", { name: /continue without extracting/i }));
    expect(useRouteStore.getState().view).toBe("review");
  });
});
