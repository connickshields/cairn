import { render, screen } from "@testing-library/react";
import { beforeEach } from "vitest";
import { useRouteStore } from "../src/store";
import App from "../src/App";

beforeEach(() => useRouteStore.setState(useRouteStore.getInitialState(), true));

test("starts on the upload view", () => {
  render(<App />);
  expect(screen.getByText(/upload page photos/i)).toBeInTheDocument();
});
