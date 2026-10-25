import { useSyncExternalStore } from "react";
import { isLocalDate, toLocalDate } from "./dates";

/**
 * Learner progress, kept on the device in localStorage (there are no accounts).
 *
 * - The in-memory snapshot is the source of truth for this tab; localStorage is persistence.
 *   Every storage call is wrapped in try/catch, so private mode or a full quota only means
 *   progress lasts until the tab closes.
 * - Parsed data always goes through `migrate`, which accepts older or unknown shapes, drops
 *   invalid entries and never throws. Corrupted JSON resets to empty.
 * - `storage` events keep other tabs in sync.
 */

export const STORAGE_KEY = "pf:progress:v1";
export const PROGRESS_VERSION = 1;

export type VideoStatus = "started" | "done";
export type VideoProgress = { status: VideoStatus; updatedAt: string };
export type ProgressState = {
  videos: Record<string, VideoProgress>;
  /** Unique local dates (`YYYY-MM-DD`) with any activity, sorted ascending. */
  activity: string[];
};

/** What is written to storage and exported. */
export type StoredProgress = ProgressState & { version: typeof PROGRESS_VERSION };

export const EMPTY_PROGRESS: Readonly<ProgressState> = Object.freeze({ videos: {}, activity: [] });

const emptyState = (): ProgressState => ({ videos: {}, activity: [] });

// ── validation & migration ──────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isIsoTimestamp = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));

/** Video IDs are YouTube IDs; keep the check loose but reject junk keys. */
const isVideoId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

function cleanActivity(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isLocalDate))].sort();
}

function cleanVideos(raw: unknown): Record<string, VideoProgress> {
  const out: Record<string, VideoProgress> = {};
  if (!isRecord(raw)) return out;
  for (const [id, entry] of Object.entries(raw)) {
    if (!isVideoId(id) || !isRecord(entry)) continue;
    if (entry.status !== "started" && entry.status !== "done") continue;
    out[id] = {
      status: entry.status,
      updatedAt: isIsoTimestamp(entry.updatedAt) ? entry.updatedAt : new Date(0).toISOString(),
    };
  }
  return out;
}

/** Legacy shape (pre-v1 sketch): `{ done: string[], started?: string[], days?: string[] }`. */
function migrateLegacy(raw: Record<string, unknown>): ProgressState {
  const videos: Record<string, VideoProgress> = {};
  const epoch = new Date(0).toISOString();
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && isVideoId(x)) : []);
  for (const id of ids(raw.started)) videos[id] = { status: "started", updatedAt: epoch };
  for (const id of ids(raw.done)) videos[id] = { status: "done", updatedAt: epoch };
  return { videos, activity: cleanActivity(raw.days ?? raw.activity) };
}

/**
 * Turns anything parsed from storage or an import into a valid `ProgressState`. Unknown shapes
 * become empty. Future versions add a branch here (e.g. `version === 2` → convert).
 */
export function migrate(raw: unknown): ProgressState {
  if (!isRecord(raw)) return emptyState();
  if (raw.version === undefined || raw.version === PROGRESS_VERSION) {
    if ("videos" in raw || "activity" in raw) {
      return { videos: cleanVideos(raw.videos), activity: cleanActivity(raw.activity) };
    }
    if ("done" in raw || "started" in raw) return migrateLegacy(raw);
  }
  return emptyState();
}

/** Lenient parse for storage: corrupted JSON resets to empty, never throws. */
export function parseStored(text: string | null): ProgressState {
  if (text === null) return emptyState();
  try {
    return migrate(JSON.parse(text));
  } catch {
    return emptyState();
  }
}

// ── storage access (every call guarded) ─────────────────────────────────────

function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readStorage(): string | null {
  try {
    return getStorage()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(state: ProgressState): void {
  try {
    const stored: StoredProgress = { version: PROGRESS_VERSION, ...state };
    getStorage()?.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Private mode / quota exceeded: keep going with the in-memory snapshot.
  }
}

// ── store ───────────────────────────────────────────────────────────────────

let snapshot: ProgressState | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getProgress(): ProgressState {
  if (snapshot === null) snapshot = parseStored(readStorage());
  return snapshot;
}

function commit(next: ProgressState): void {
  snapshot = next;
  writeStorage(next);
  emit();
}

/** Re-reads storage (used for `storage` events; handy in tests). */
export function reloadProgress(): void {
  snapshot = parseStored(readStorage());
  emit();
}

function onStorage(event: StorageEvent): void {
  // `key === null` means another tab called `localStorage.clear()`.
  if (event.key === STORAGE_KEY || event.key === null) reloadProgress();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

const getServerSnapshot = () => EMPTY_PROGRESS as ProgressState;

/** Current progress; re-renders on local writes and on changes from other tabs. */
export function useProgress(): ProgressState {
  return useSyncExternalStore(subscribe, getProgress, getServerSnapshot);
}

// ── actions ─────────────────────────────────────────────────────────────────

const nowIso = () => new Date().toISOString();

/** Marks a video started (refreshing its recency). Never downgrades a done video. */
export function markStarted(videoId: string): void {
  const state = getProgress();
  if (state.videos[videoId]?.status === "done") return;
  commit({ ...state, videos: { ...state.videos, [videoId]: { status: "started", updatedAt: nowIso() } } });
}

/** Sets or clears "done". Clearing leaves the video as started, so it shows in Continue. */
export function setDone(videoId: string, done: boolean): void {
  const state = getProgress();
  const current = state.videos[videoId]?.status;
  if (done ? current === "done" : current !== "done") return;
  commit({
    ...state,
    videos: { ...state.videos, [videoId]: { status: done ? "done" : "started", updatedAt: nowIso() } },
  });
}

/** Records activity on a local date (default: today). Unique per day. */
export function logActivity(date: string = toLocalDate()): void {
  if (!isLocalDate(date)) return;
  const state = getProgress();
  if (state.activity.includes(date)) return;
  commit({ ...state, activity: [...state.activity, date].sort() });
}

export function exportJson(): string {
  const stored: StoredProgress = { version: PROGRESS_VERSION, ...getProgress() };
  return JSON.stringify(stored, null, 2);
}

export type ImportResult = { ok: true; videos: number; days: number } | { ok: false; error: string };

/**
 * Replaces progress with an exported file. Strict, unlike storage parsing: the text must be JSON
 * in a recognised shape, otherwise nothing changes and an error is returned.
 */
export function importJson(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Tệp không phải JSON hợp lệ · The file is not valid JSON" };
  }
  const known =
    isRecord(raw) &&
    (raw.version === undefined || raw.version === PROGRESS_VERSION) &&
    (isRecord(raw.videos) || Array.isArray(raw.activity) || Array.isArray(raw.done));
  if (!known) {
    return { ok: false, error: "Tệp không đúng định dạng tiến độ · The file is not a progress export" };
  }
  const next = migrate(raw);
  commit(next);
  return { ok: true, videos: Object.keys(next.videos).length, days: next.activity.length };
}

export function reset(): void {
  commit(emptyState());
}
