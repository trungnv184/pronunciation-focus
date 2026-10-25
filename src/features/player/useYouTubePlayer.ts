import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

/**
 * Thin React wrapper around the YouTube IFrame Player API.
 *
 * Host decision: we use the standard `www.youtube.com` host. The `host:
 * "https://www.youtube-nocookie.com"` option is undocumented and could not be verified to keep
 * playback and events working, so it is deliberately not set. Revisit only after a manual check
 * in real browsers (Chrome, Safari, iOS).
 */

const IFRAME_API_SRC = "https://www.youtube.com/iframe_api";

export type PlayerState = "unstarted" | "ended" | "playing" | "paused" | "buffering" | "cued";

export type PlayerControls = {
  /** True once the player fired `onReady`; the methods below are no-ops before that. */
  ready: boolean;
  play: () => void;
  pause: () => void;
  seekTo: (sec: number) => void;
  /** Current playback position in seconds (0 before ready). */
  getCurrentTime: () => number;
  /** Ignored unless `r` is one of `availableRates`. */
  setRate: (r: number) => void;
  /** From `getAvailablePlaybackRates()`; empty before ready. */
  availableRates: number[];
  rate: number;
  state: PlayerState;
};

export type UseYouTubePlayerOptions = {
  onStateChange?: (state: PlayerState) => void;
};

/**
 * Numeric values of `YT.PlayerState`. We don't read the `YT.PlayerState` enum at runtime because
 * it only exists after the API script has loaded (and test fakes needn't provide it).
 */
const STATE_BY_CODE: Record<number, PlayerState> = {
  [-1]: "unstarted",
  0: "ended",
  1: "playing",
  2: "paused",
  3: "buffering",
  5: "cued",
};

export function toPlayerState(code: number): PlayerState {
  return STATE_BY_CODE[code] ?? "unstarted";
}

type YTWindow = Window & {
  YT?: typeof YT;
  onYouTubeIframeAPIReady?: () => void;
};

let apiPromise: Promise<void> | null = null;

/** Load the IFrame API script once per page. Resolves when `YT.Player` can be constructed. */
export function loadYouTubeIframeApi(): Promise<void> {
  const w = window as YTWindow;
  if (w.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve, reject) => {
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    if (!document.querySelector(`script[src="${IFRAME_API_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = IFRAME_API_SRC;
      script.async = true;
      script.onerror = () => {
        script.remove();
        apiPromise = null; // allow a later mount to try again
        reject(new Error("Could not load the YouTube IFrame API"));
      };
      document.head.appendChild(script);
    }
  });
  return apiPromise;
}

/** Test hook: forget the cached loader promise. */
export function resetYouTubeIframeApi(): void {
  apiPromise = null;
}

/**
 * Mounts a YouTube player inside `hostRef` (a React-owned, empty element). The player is created
 * in a child node that this hook owns, because `YT.Player` replaces its target with an iframe and
 * React must never see that swap.
 */
export function useYouTubePlayer(
  hostRef: RefObject<HTMLElement | null>,
  videoId: string,
  options: UseYouTubePlayerOptions = {},
): PlayerControls {
  const playerRef = useRef<YT.Player | null>(null);
  const onStateChangeRef = useRef(options.onStateChange);
  useEffect(() => {
    onStateChangeRef.current = options.onStateChange;
  }, [options.onStateChange]);

  const [ready, setReady] = useState(false);
  const [state, setState] = useState<PlayerState>("unstarted");
  const [rate, setRateState] = useState(1);
  const [availableRates, setAvailableRates] = useState<number[]>([]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // `cancelled` guards StrictMode's mount → unmount → mount and fast video switches: a stale
    // effect whose API promise resolves late must not create a player.
    let cancelled = false;
    let player: YT.Player | null = null;
    const target = document.createElement("div");
    host.appendChild(target);

    setReady(false);
    setState("unstarted");
    setRateState(1);
    setAvailableRates([]);

    loadYouTubeIframeApi().then(
      () => {
        const api = (window as YTWindow).YT;
        if (cancelled || !api?.Player) return;
        player = new api.Player(target, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { rel: 0, playsinline: 1, iv_load_policy: 3, disablekb: 1 },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              playerRef.current = event.target;
              setAvailableRates(event.target.getAvailablePlaybackRates?.() ?? [1]);
              setRateState(event.target.getPlaybackRate?.() ?? 1);
              setReady(true);
            },
            onStateChange: (event) => {
              if (cancelled) return;
              const next = toPlayerState(event.data);
              setState(next);
              onStateChangeRef.current?.(next);
            },
            onPlaybackRateChange: (event) => {
              if (!cancelled) setRateState(event.data);
            },
          },
        });
        playerRef.current = player;
      },
      () => {
        // Script failed to load (offline, blocked). The page keeps showing its loading text.
      },
    );

    return () => {
      cancelled = true;
      playerRef.current = null;
      try {
        player?.destroy();
      } catch {
        // The iframe may already be gone; nothing to clean up.
      }
      host.replaceChildren();
    };
  }, [hostRef, videoId]);

  const play = useCallback(() => playerRef.current?.playVideo(), []);
  const pause = useCallback(() => playerRef.current?.pauseVideo(), []);
  const seekTo = useCallback((sec: number) => playerRef.current?.seekTo(Math.max(0, sec), true), []);
  const getCurrentTime = useCallback(() => playerRef.current?.getCurrentTime?.() ?? 0, []);
  const setRate = useCallback(
    (r: number) => {
      if (!availableRates.includes(r)) return;
      playerRef.current?.setPlaybackRate(r);
      setRateState(r);
    },
    [availableRates],
  );

  return useMemo(
    () => ({ ready, play, pause, seekTo, getCurrentTime, setRate, availableRates, rate, state }),
    [ready, play, pause, seekTo, getCurrentTime, setRate, availableRates, rate, state],
  );
}
