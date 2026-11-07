import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DaemonStatusPill from "../DaemonStatusPill";

describe("DaemonStatusPill", () => {
  it.each([
    ["connecting", "Connecting…"],
    ["connected", "Connected"],
    ["disconnected", "Disconnected"],
  ] as const)("renders the %s label as a live status", (state, label) => {
    render(<DaemonStatusPill state={state} />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
  });
});
