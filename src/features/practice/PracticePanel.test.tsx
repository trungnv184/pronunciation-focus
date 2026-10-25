import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { clear } from "idb-keyval";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PracticePanel from "../player/PracticePanel";
import type { PlayerControls } from "../player/useYouTubePlayer";
import { listAttempts, saveAttempt } from "./storage";

function makePlayer(overrides: Partial<PlayerControls> = {}): PlayerControls {
  return {
    ready: true,
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    getCurrentTime: vi.fn(() => 0),
    setRate: vi.fn(),
    availableRates: [0.5, 0.75, 1],
    rate: 1,
    state: "paused",
    ...overrides,
  };
}

const segment = { start: 12, end: 15 };

beforeEach(async () => {
  await clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PracticePanel", () => {
  it("asks for A and B when no segment is set", () => {
    render(<PracticePanel videoId="vid1" segment={null} player={makePlayer()} />);
    expect(screen.getByRole("heading", { name: /Shadowing/ })).toBeInTheDocument();
    expect(screen.getByText("Hãy đặt điểm A và B trước · Set A and B first")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Listen/ })).not.toBeInTheDocument();
  });

  it("Listen seeks to A and plays the segment", async () => {
    const player = makePlayer();
    render(<PracticePanel videoId="vid1" segment={segment} player={player} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Listen/ }));
    expect(player.seekTo).toHaveBeenCalledWith(12);
    expect(player.play).toHaveBeenCalled();
    expect(screen.getByText(/Playing the model/)).toBeInTheDocument();
    // While the model plays, the other actions are locked and a Stop button is offered.
    expect(screen.getByRole("button", { name: /Listen/ })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole("button", { name: /^Dừng · Stop$/ }));
    expect(player.pause).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Listen/ })).toBeEnabled();
  });

  it("explains when the browser can't record (no MediaRecorder in jsdom)", () => {
    render(<PracticePanel videoId="vid1" segment={segment} player={makePlayer()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/can't record audio/);
    expect(screen.getByRole("button", { name: /Record/ })).toBeDisabled();
  });

  it("explains an insecure context", () => {
    vi.stubGlobal("isSecureContext", false);
    render(<PracticePanel videoId="vid1" segment={segment} player={makePlayer()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/https/);
  });

  it("lists saved attempts, saves a rating, and deletes all after confirming", async () => {
    await saveAttempt("vid1", segment, { data: new ArrayBuffer(4), mimeType: "audio/mp4" });
    const user = userEvent.setup();
    render(<PracticePanel videoId="vid1" segment={segment} player={makePlayer()} />);

    const list = await screen.findByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Compare/ })).toBeEnabled();

    const good = within(list).getByRole("button", { name: /Sounds right/ });
    expect(good).toHaveAttribute("aria-pressed", "false");
    await user.click(good);
    expect(good).toHaveAttribute("aria-pressed", "true");
    await waitFor(async () => expect((await listAttempts("vid1", segment))[0]!.rating).toBe(3));

    await user.click(screen.getByRole("button", { name: /Delete all recordings/ }));
    expect(screen.getByText(/This can't be undone/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Xóa hết · Delete all$/ }));
    await waitFor(() => expect(screen.queryByRole("list")).not.toBeInTheDocument());
    expect(await listAttempts("vid1", segment)).toEqual([]);
    expect(screen.queryByRole("button", { name: /Delete all recordings/ })).not.toBeInTheDocument();
  });

  it("cancelling the confirm step keeps the recordings", async () => {
    await saveAttempt("vid1", segment, { data: new ArrayBuffer(4), mimeType: "audio/mp4" });
    const user = userEvent.setup();
    render(<PracticePanel videoId="vid1" segment={segment} player={makePlayer()} />);
    await user.click(await screen.findByRole("button", { name: /Delete all recordings/ }));
    await user.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(await listAttempts("vid1", segment)).toHaveLength(1);
    expect(screen.getByRole("list")).toBeInTheDocument();
  });
});
