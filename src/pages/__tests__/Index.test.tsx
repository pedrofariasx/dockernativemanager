import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { DaemonState } from "@/context/DockerContext";
import Index from "../Index";

const manageService = vi.fn<(action: string) => Promise<void>>();
let daemonState: DaemonState;

vi.mock("@/context/DockerContext", () => ({
  useDocker: () => ({
    daemonState,
    manageService,
    connectionError: "dial unix /var/run/docker.sock: connect: no such file or directory",
    systemInfo: {
      containers: 0,
      containers_running: 0,
      containers_paused: 0,
      containers_stopped: 0,
      images: 3,
      version: "27.0.1",
      operating_system: "Ubuntu",
      kernel_version: "6.8.0",
      storage_driver: "overlay2",
      logging_driver: "json-file",
      architecture: "x86_64",
      ncpu: 8,
      mem_total: 16000000000,
    },
    volumes: [],
    networks: [],
    events: [],
    hostStats: null,
    hostStatsHistory: [],
    loading: {},
  }),
}));

const renderDashboard = (state: DaemonState) => {
  daemonState = state;
  return render(
    <MemoryRouter>
      <Index />
    </MemoryRouter>,
  );
};

describe("Dashboard", () => {
  beforeEach(() => manageService.mockClear());

  it("shows skeletons while connecting", () => {
    renderDashboard("connecting");
    expect(screen.getByTestId("dashboard-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Docker isn't running")).not.toBeInTheDocument();
    expect(screen.queryByText("Containers")).not.toBeInTheDocument();
  });

  it("shows stats when connected", () => {
    renderDashboard("connected");
    expect(screen.getByText("Containers")).toBeInTheDocument();
    expect(screen.getByText("System & Runtime")).toBeInTheDocument();
    expect(screen.queryByText("Docker isn't running")).not.toBeInTheDocument();
  });

  it("shows only the empty state when disconnected", async () => {
    const user = userEvent.setup();
    renderDashboard("disconnected");

    expect(screen.getByText("Docker isn't running")).toBeInTheDocument();
    expect(screen.queryByText("Containers")).not.toBeInTheDocument();
    expect(screen.queryByText("System & Runtime")).not.toBeInTheDocument();
    expect(screen.queryByText(/docker\.sock/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /start daemon/i }));
    expect(manageService).toHaveBeenCalledWith("start");

    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(manageService).toHaveBeenCalledWith("reconnect");

    await user.click(screen.getByRole("button", { name: /show details/i }));
    expect(screen.getByText(/docker\.sock/)).toBeInTheDocument();
  });
});
