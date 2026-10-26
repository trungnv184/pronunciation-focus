import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoIndexState } from "../../data/loadIndex";
import { fixtureIndex } from "../../test/fixtures/videoIndex";
import PlayerPage from "./PlayerPage";
import { resetYouTubeIframeApi } from "./useYouTubePlayer";

const indexState = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("../../data/loadIndex", () => ({
  useVideoIndex: () => indexState.current,
}));

type FakeEvents = {
  onReady?: (e: { target: FakePlayer }) => void;
  onStateChange?: (e: { target: FakePlayer; data: number }) => void;
};

type FakePlayer = {
  playVideo: ReturnType<typeof vi.fn>;
  pauseVideo: ReturnType<typeof vi.fn>;
  seekTo: ReturnType<typeof vi.fn>;
  getCurrentTime: ReturnType<typeof vi.fn>;
  setPlaybackRate: ReturnType<typeof vi.fn>;
  getAvailablePlaybackRates: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

let currentTime = 0;
const DEFAULT_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
let reportedRates: number[] = DEFAULT_RATES;
let players: Array<{ player: FakePlayer; events: FakeEvents; videoId: string }> = [];

function installFakeYT() {
  const Player = vi.fn(function (
    this: unknown,
    _el: HTMLElement,
    opts: { videoId: string; events: FakeEvents; playerVars?: Record<string, number> },
  ) {
    const player: FakePlayer = {
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      seekTo: vi.fn(),
      getCurrentTime: vi.fn(() => currentTime),
      setPlaybackRate: vi.fn(),
      getAvailablePlaybackRates: vi.fn(() => reportedRates),
      destroy: vi.fn(),
    };
    players.push({ player, events: opts.events, videoId: opts.videoId });
    queueMicrotask(() => opts.events.onReady?.({ target: player }));
    return player;
  });
  vi.stubGlobal("YT", { Player });
  return Player;
}

const lastPlayer = () => players[players.length - 1]!;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/watch/:videoId" element={<PlayerPage />} />
        <Route path="/" element={<h1>Browse page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

const ready = (): VideoIndexState => ({ status: "ready", index: fixtureIndex, retry: vi.fn() });

beforeEach(() => {
  currentTime = 0;
  reportedRates = DEFAULT_RATES;
  players = [];
  resetYouTubeIframeApi();
  installFakeYT();
  indexState.current = ready();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlayerPage", () => {
  it("renders the title, channel, duration and tag links", async () => {
    renderAt("/watch/th000000002");
    expect(
      screen.getByRole("heading", { level: 1, name: "Thin or Thing? TH minimal pairs" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sounds American")).toBeInTheDocument();
    expect(screen.getByText("2:30")).toBeInTheDocument();

    const tagList = screen.getByRole("list", { name: /Sounds/ });
    const links = within(tagList).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/?tags=th-sounds",
      "/?tags=minimal-pairs",
    ]);
    expect(links[0]).toHaveTextContent("Âm th");
    expect(links[0]).toHaveTextContent("TH sounds");

    expect(await screen.findByRole("button", { name: /Set A/ })).toBeEnabled();
    expect(lastPlayer().videoId).toBe("th000000002");
    expect(await screen.findByRole("heading", { name: /Shadowing/ })).toBeInTheDocument(); // lazy-loaded
  });

  it("creates the player with the focus playerVars", async () => {
    const Player = installFakeYT();
    renderAt("/watch/th000000001");
    await screen.findByRole("button", { name: /Set A/ });
    const opts = Player.mock.calls[0]![1];
    expect(opts.playerVars).toEqual({ rel: 0, playsinline: 1, iv_load_policy: 3, disablekb: 1 });
  });

  it("captures A and B from the current time, swapping reversed points", async () => {
    const user = userEvent.setup();
    renderAt("/watch/th000000001");
    const setA = await screen.findByRole("button", { name: /Set A/ });
    await vi.waitFor(() => expect(setA).toBeEnabled());

    currentTime = 20;
    await user.click(setA);
    expect(screen.getByLabelText(/Point A/)).toHaveTextContent("A: 0:20");
    expect(screen.getByRole("button", { name: /Loop/ })).toBeDisabled();

    currentTime = 5;
    await user.click(screen.getByRole("button", { name: /Set B/ }));
    expect(screen.getByLabelText(/Point A/)).toHaveTextContent("A: 0:05");
    expect(screen.getByLabelText(/Point B/)).toHaveTextContent("B: 0:20");

    await user.click(screen.getByRole("button", { name: /Move B forward 1 s/ }));
    expect(screen.getByLabelText(/Point B/)).toHaveTextContent("B: 0:21");

    const loop = screen.getByRole("button", { name: /Loop/ });
    expect(loop).toBeEnabled();
    await user.click(loop);
    expect(loop).toHaveAttribute("aria-pressed", "true");
  });

  it("supports keyboard shortcuts outside inputs and buttons", async () => {
    const user = userEvent.setup();
    renderAt("/watch/th000000001");
    await vi.waitFor(() => expect(screen.getByRole("button", { name: /Set A/ })).toBeEnabled());
    (document.activeElement as HTMLElement | null)?.blur();

    currentTime = 10;
    await user.keyboard("a");
    currentTime = 15;
    await user.keyboard("b");
    expect(screen.getByLabelText(/Point A/)).toHaveTextContent("A: 0:10");
    expect(screen.getByLabelText(/Point B/)).toHaveTextContent("B: 0:15");

    await user.keyboard(" ");
    expect(lastPlayer().player.playVideo).toHaveBeenCalledTimes(1);

    await user.keyboard("[[");
    expect(lastPlayer().player.setPlaybackRate).toHaveBeenLastCalledWith(0.75);

    await user.keyboard("l");
    expect(screen.getByRole("button", { name: /Looping/ })).toHaveAttribute("aria-pressed", "true");

    // Keys on a focused button are left alone (Space would otherwise fire twice).
    screen.getByRole("button", { name: /Set A/ }).focus();
    currentTime = 3;
    await user.keyboard("b");
    expect(screen.getByLabelText(/Point B/)).toHaveTextContent("B: 0:15");
  });

  it("shows only available speeds, with 0.5 / 0.75 / 1 first", async () => {
    const user = userEvent.setup();
    renderAt("/watch/th000000001");
    const group = await screen.findByRole("group", { name: /Speed/ });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "0.5×",
      "0.75×",
      "1×",
      "0.25×",
      "1.25×",
      "1.5×",
      "2×",
    ]);
    expect(within(group).getByRole("button", { name: "1×" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(group).getByRole("button", { name: "0.75×" }));
    expect(lastPlayer().player.setPlaybackRate).toHaveBeenCalledWith(0.75);
    expect(within(group).getByRole("button", { name: "0.75×" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows the end overlay with practise again, back to list and a same-tag next video", async () => {
    const user = userEvent.setup();
    renderAt("/watch/th000000001");
    await vi.waitFor(() => expect(screen.getByRole("button", { name: /Set A/ })).toBeEnabled());
    expect(screen.queryByText(/Video ended/)).not.toBeInTheDocument();

    const { player, events } = lastPlayer();
    act(() => events.onStateChange?.({ target: player, data: 0 }));

    expect(screen.getByRole("heading", { name: /Video ended/ })).toBeInTheDocument();
    expect(screen.getByText(/Click outside the video to use shortcuts/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Controls/ })).toHaveFocus();
    expect(screen.getByRole("link", { name: /Back to list/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /Next video/ })).toHaveAttribute(
      "href",
      "/watch/th000000002",
    );

    await user.click(screen.getByRole("button", { name: /Practise this part again/ }));
    expect(player.seekTo).toHaveBeenCalledWith(0, true);
    expect(player.playVideo).toHaveBeenCalled();
    expect(player.pauseVideo).not.toHaveBeenCalled();
  });

  it("omits the next-video link when no other video shares the first tag", async () => {
    renderAt("/watch/ip000000001");
    await vi.waitFor(() => expect(screen.getByRole("button", { name: /Set A/ })).toBeEnabled());
    const { player, events } = lastPlayer();
    act(() => events.onStateChange?.({ target: player, data: 0 }));
    expect(screen.getByRole("heading", { name: /Video ended/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Next video/ })).not.toBeInTheDocument();
  });

  it("destroys the player on unmount", async () => {
    const { unmount } = renderAt("/watch/th000000001");
    await vi.waitFor(() => expect(screen.getByRole("button", { name: /Set A/ })).toBeEnabled());
    const { player } = lastPlayer();
    unmount();
    expect(player.destroy).toHaveBeenCalled();
  });

  it("shows a friendly not-found section for an unknown id", () => {
    renderAt("/watch/doesnotexist");
    expect(screen.getByRole("heading", { name: /Video not found/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to list/ })).toHaveAttribute("href", "/");
    expect(players).toHaveLength(0);
  });

  it("shows loading and error states", async () => {
    indexState.current = { status: "loading", retry: vi.fn() } satisfies VideoIndexState;
    const { unmount } = renderAt("/watch/th000000001");
    expect(screen.getByRole("status")).toHaveTextContent(/Loading/);
    unmount();

    const retry = vi.fn();
    indexState.current = { status: "error", error: new Error("HTTP 500"), retry } satisfies VideoIndexState;
    renderAt("/watch/th000000001");
    expect(screen.getByRole("alert")).toHaveTextContent("HTTP 500");
    await userEvent.setup().click(screen.getByRole("button", { name: /Try again/ }));
    expect(retry).toHaveBeenCalled();
  });

  it("shows the speed control once rates arrive after ready (iOS Safari reports none at first)", async () => {
    reportedRates = [];
    renderAt("/watch/th000000001");
    await screen.findByRole("button", { name: /Set A/ });
    expect(screen.queryByRole("button", { name: "0.75×" })).not.toBeInTheDocument();
    reportedRates = [0.5, 0.75, 1, 1.5];
    const { player, events } = lastPlayer();
    act(() => events.onStateChange?.({ target: player, data: 1 }));
    expect(screen.getByRole("button", { name: "0.75×" })).toBeInTheDocument();
  });
});
