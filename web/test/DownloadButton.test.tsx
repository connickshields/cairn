import type { ReactNode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouteStore } from "../src/store";
import { DownloadButton } from "../src/components/DownloadButton";

function wrap(ui: ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  useRouteStore.setState(useRouteStore.getInitialState(), true);
  useRouteStore.getState().setRouteName("Calaveras");
  useRouteStore.getState().addSegment();
});

describe("DownloadButton", () => {
  it("posts the serialized route to /api/gpx", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("<gpx></gpx>", { status: 200, headers: { "Content-Type": "application/gpx+xml" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:fake"), writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), writable: true });

    render(wrap(<DownloadButton />));
    fireEvent.click(screen.getByRole("button", { name: /download gpx/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, opts] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/gpx");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body as string).name).toBe("Calaveras");
  });
});
