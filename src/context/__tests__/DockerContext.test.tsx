import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { DockerProvider, useDocker } from "../DockerContext";

const mock = vi.hoisted(() => ({
  daemonUp: false,
  finishService: (() => {}) as (result: string) => void,
  listeners: {} as Record<string, (event: { payload: unknown }) => void>,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: async (name: string, cb: (event: { payload: unknown }) => void) => {
    mock.listeners[name] = cb;
    return () => {};
  },
}));
vi.mock("@/hooks/use-docker-events", () => ({ useDockerEvent: () => {} }));
vi.mock("@/utils/toast", () => ({ showSuccess: () => {}, showError: () => {} }));
vi.mock("@/lib/docker", () => ({
  getContainers: async () => [],
  getStacks: async () => [],
  getImages: async () => [],
  getVolumes: async () => [],
  getNetworks: async () => [],
  getSystemInfo: async () => {
    if (!mock.daemonUp) throw new Error("connect: no such file or directory");
    return { containers: 0 };
  },
  manageDockerService: (action: string) =>
    new Promise<string>((resolve) => {
      mock.finishService = () => resolve(`Docker service ${action}ed successfully`);
    }),
}));

const Probe = () => {
  const { daemonState, manageService } = useDocker();
  return (
    <>
      <span data-testid="state">{daemonState}</span>
      <button onClick={() => manageService("start")}>start</button>
      <button onClick={() => manageService("stop")}>stop</button>
    </>
  );
};

const flush = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));
const state = () => screen.getByTestId("state").textContent;

describe("DockerProvider daemonState", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stays connecting from start until the follow-up refresh lands", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mock.daemonUp = false;
    render(
      <DockerProvider>
        <Probe />
      </DockerProvider>,
    );
    await flush();
    expect(state()).toBe("disconnected");

    fireEvent.click(screen.getByText("start"));
    expect(state()).toBe("connecting");

    mock.daemonUp = true;
    await act(async () => mock.finishService(""));
    expect(state()).toBe("connecting");

    await flush(3000);
    expect(state()).toBe("connected");
    vi.restoreAllMocks();
  });

  it("goes straight to disconnected while a stop is pending", async () => {
    mock.daemonUp = true;
    render(
      <DockerProvider>
        <Probe />
      </DockerProvider>,
    );
    await flush();
    expect(state()).toBe("connected");

    fireEvent.click(screen.getByText("stop"));
    act(() => mock.listeners["docker-connection-status"]({ payload: false }));
    expect(state()).toBe("disconnected");

    await act(async () => mock.finishService(""));
    expect(state()).toBe("disconnected");
  });
});
