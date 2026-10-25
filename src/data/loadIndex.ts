import { useCallback, useEffect, useState } from "react";
import { VideoIndexSchema, type VideoIndex } from "./schema";

/** Relative URL so it resolves under the GitHub Pages sub-path. */
export const INDEX_URL = "./data/videos.json";

let cached: Promise<VideoIndex> | null = null;

export function loadIndex(): Promise<VideoIndex> {
  if (!cached) {
    cached = fetch(INDEX_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load ${INDEX_URL} (HTTP ${res.status})`);
        return res.json();
      })
      .then((json) => VideoIndexSchema.parse(json))
      .catch((err: unknown) => {
        cached = null; // let a retry fetch again
        throw err;
      });
  }
  return cached;
}

/** Test hook: forget the cached index. */
export function resetIndexCache(): void {
  cached = null;
}

export type VideoIndexState =
  | { status: "loading"; index?: undefined; error?: undefined; retry: () => void }
  | { status: "ready"; index: VideoIndex; error?: undefined; retry: () => void }
  | { status: "error"; index?: undefined; error: Error; retry: () => void };

export function useVideoIndex(): VideoIndexState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; index: VideoIndex } | { status: "error"; error: Error }
  >({ status: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    loadIndex().then(
      (index) => alive && setState({ status: "ready", index }),
      (err: unknown) =>
        alive && setState({ status: "error", error: err instanceof Error ? err : new Error(String(err)) }),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry } as VideoIndexState;
}
