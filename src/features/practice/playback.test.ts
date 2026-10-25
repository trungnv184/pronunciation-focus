import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEGMENT_GRACE_MS, playSegment, sleep } from "./playback";

function fakePlayer(times: number[]) {
  let i = 0;
  return {
    seekTo: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    getCurrentTime: vi.fn(() => times[Math.min(i++, times.length - 1)]!),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("playSegment", () => {
  it("seeks to start, plays, and pauses once the end is passed", async () => {
    // The first reading is the stale pre-seek position (past the end) and must be ignored.
    const player = fakePlayer([40, 10.1, 11, 12, 13.05]);
    const done = playSegment(player, { start: 10, end: 13 }, { pollMs: 100 });
    expect(player.seekTo).toHaveBeenCalledWith(10);
    expect(player.play).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(player.pause).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    await expect(done).resolves.toBe("ended");
    expect(player.pause).toHaveBeenCalledTimes(1);
  });

  it("stops and pauses when aborted", async () => {
    const player = fakePlayer([10.5]);
    const ctrl = new AbortController();
    const done = playSegment(player, { start: 10, end: 13 }, { signal: ctrl.signal });
    ctrl.abort();
    await expect(done).resolves.toBe("aborted");
    expect(player.pause).toHaveBeenCalledTimes(1);
  });

  it("gives up after the segment length plus a grace period", async () => {
    const player = fakePlayer([0]); // never starts playing (blocked or buffering)
    const done = playSegment(player, { start: 10, end: 12 }, { rate: 0.5 });
    await vi.advanceTimersByTimeAsync(4000 + SEGMENT_GRACE_MS);
    await expect(done).resolves.toBe("timeout");
    expect(player.pause).toHaveBeenCalledTimes(1);
  });
});

describe("sleep", () => {
  it("resolves true after the delay and false when aborted", async () => {
    const p = sleep(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toBe(true);

    const ctrl = new AbortController();
    const q = sleep(1000, ctrl.signal);
    ctrl.abort();
    await expect(q).resolves.toBe(false);
  });
});
