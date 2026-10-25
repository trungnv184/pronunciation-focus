import type { PlayerControls } from "../player/useYouTubePlayer";

/** Small, cancellable playback helpers for the shadowing flow. */

export type SegmentPlayer = Pick<PlayerControls, "seekTo" | "play" | "pause" | "getCurrentTime">;

export type PlayResult = "ended" | "aborted" | "timeout";

export const SEGMENT_POLL_MS = 100;
/** Extra time allowed for buffering before we give up waiting for the segment to end. */
export const SEGMENT_GRACE_MS = 5000;

/**
 * Play `[start, end]` once on the YouTube player: seek, play, poll `getCurrentTime()` and pause
 * at `end`. Right after `seekTo` the player may still report the old position, so the end only
 * counts once a time inside the segment has been seen. Always pauses before resolving.
 */
export function playSegment(
  player: SegmentPlayer,
  segment: { start: number; end: number },
  options: { signal?: AbortSignal; rate?: number; pollMs?: number } = {},
): Promise<PlayResult> {
  const { signal, rate = 1, pollMs = SEGMENT_POLL_MS } = options;
  const lengthMs = (Math.max(0, segment.end - segment.start) / (rate > 0 ? rate : 1)) * 1000;

  return new Promise<PlayResult>((resolve) => {
    if (signal?.aborted) {
      resolve("aborted");
      return;
    }
    let seenInside = false;
    let done = false;

    const finish = (result: PlayResult) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      player.pause();
      resolve(result);
    };
    const onAbort = () => finish("aborted");

    player.seekTo(segment.start);
    player.play();

    const poll = setInterval(() => {
      const t = player.getCurrentTime();
      if (t >= segment.start - 0.25 && t < segment.end) seenInside = true;
      else if (seenInside && t >= segment.end) finish("ended");
    }, pollMs);
    const timeout = setTimeout(() => finish("timeout"), lengthMs + SEGMENT_GRACE_MS);
    signal?.addEventListener("abort", onAbort);
  });
}

/** Resolves true after `ms`, or false as soon as `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }
    const onAbort = () => {
      clearTimeout(id);
      resolve(false);
    };
    const id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Play an audio element to the end. Resolves "ended", "aborted", or "blocked" when the browser
 * refuses to play (for example iOS autoplay rules) or the file can't be decoded.
 */
export function playAudio(
  audio: HTMLAudioElement,
  signal?: AbortSignal,
): Promise<"ended" | "aborted" | "blocked"> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve("aborted");
      return;
    }
    let done = false;
    const finish = (result: "ended" | "aborted" | "blocked") => {
      if (done) return;
      done = true;
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      if (result !== "ended") audio.pause();
      resolve(result);
    };
    const onEnded = () => finish("ended");
    const onError = () => finish("blocked");
    const onAbort = () => finish("aborted");
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort);
    try {
      audio.currentTime = 0;
    } catch {
      // not seekable yet; it starts at 0 anyway
    }
    try {
      const p = audio.play();
      if (p && typeof p.catch === "function") p.catch(() => finish("blocked"));
    } catch {
      finish("blocked");
    }
  });
}
