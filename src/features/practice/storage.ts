import { delMany, getMany, keys, get, set, del } from "idb-keyval";

/**
 * Local-only storage for shadowing attempts (IndexedDB via idb-keyval). Nothing here touches the
 * network: recordings never leave the device.
 *
 * Safari has a history of bugs storing `Blob`s in IndexedDB, so we store the raw `ArrayBuffer`
 * plus its MIME type and rebuild the `Blob` at playback time (`toBlob`).
 *
 * Key: `rec:<videoId>:<start>-<end>:<timestamp>`. Video IDs never contain `:`.
 */

export const MAX_ATTEMPTS = 3;

/** 1 = 😕 not yet, 2 = 🙂 okay, 3 = 😀 good. */
export type Rating = 1 | 2 | 3;

export type StoredRecording = {
  data: ArrayBuffer;
  mimeType: string;
  /** Epoch milliseconds. */
  createdAt: number;
  rating?: Rating;
};

export type Attempt = StoredRecording & { key: string };

export type Segment = { start: number; end: number };

/** Seconds rounded to 0.01 s so float noise from `getCurrentTime()` gives stable keys. */
function formatSec(sec: number): string {
  return String(Math.round(sec * 100) / 100);
}

export function videoPrefix(videoId: string): string {
  return `rec:${videoId}:`;
}

export function segmentPrefix(videoId: string, segment: Segment): string {
  return `${videoPrefix(videoId)}${formatSec(segment.start)}-${formatSec(segment.end)}:`;
}

export function recordingKey(videoId: string, segment: Segment, timestamp: number): string {
  return `${segmentPrefix(videoId, segment)}${timestamp}`;
}

function timestampOf(key: string): number {
  return Number(key.slice(key.lastIndexOf(":") + 1)) || 0;
}

async function keysWithPrefix(prefix: string): Promise<string[]> {
  const all = await keys();
  return all
    .filter((k): k is string => typeof k === "string" && k.startsWith(prefix))
    .sort((a, b) => timestampOf(b) - timestampOf(a)); // newest first
}

function isStoredRecording(value: unknown): value is StoredRecording {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<StoredRecording>;
  return (
    typeof v.mimeType === "string" &&
    typeof v.createdAt === "number" &&
    !!v.data &&
    typeof (v.data as ArrayBuffer).byteLength === "number"
  );
}

/** Attempts for one segment, newest first. */
export async function listAttempts(videoId: string, segment: Segment): Promise<Attempt[]> {
  const ks = await keysWithPrefix(segmentPrefix(videoId, segment));
  if (ks.length === 0) return [];
  const values = await getMany<unknown>(ks);
  const out: Attempt[] = [];
  values.forEach((value, i) => {
    if (isStoredRecording(value)) out.push({ ...value, key: ks[i]! });
  });
  return out;
}

/** Number of stored attempts for a video across all segments. */
export async function countForVideo(videoId: string): Promise<number> {
  return (await keysWithPrefix(videoPrefix(videoId))).length;
}

let lastTimestamp = 0;

/** Save an attempt, then keep only the newest `MAX_ATTEMPTS` for that segment. */
export async function saveAttempt(
  videoId: string,
  segment: Segment,
  recording: { data: ArrayBuffer; mimeType: string },
  now: number = Date.now(),
): Promise<Attempt> {
  // Strictly increasing so two saves in the same millisecond never share a key.
  const createdAt = Math.max(now, lastTimestamp + 1);
  lastTimestamp = createdAt;
  const key = recordingKey(videoId, segment, createdAt);
  const value: StoredRecording = { data: recording.data, mimeType: recording.mimeType, createdAt };
  await set(key, value);

  const ks = await keysWithPrefix(segmentPrefix(videoId, segment));
  const stale = ks.slice(MAX_ATTEMPTS);
  if (stale.length > 0) await delMany(stale);
  return { ...value, key };
}

export async function deleteAttempt(key: string): Promise<void> {
  await del(key);
}

/** Delete every attempt for a video, across all segments. */
export async function deleteAllForVideo(videoId: string): Promise<void> {
  const ks = await keysWithPrefix(videoPrefix(videoId));
  if (ks.length > 0) await delMany(ks);
}

/** Set (or clear, with `undefined`) the self-rating of one attempt. No-op if it was deleted. */
export async function setRating(key: string, rating: Rating | undefined): Promise<void> {
  const value = await get<unknown>(key);
  if (!isStoredRecording(value)) return;
  const next: StoredRecording = { ...value };
  if (rating === undefined) delete next.rating;
  else next.rating = rating;
  await set(key, next);
}

/** Rebuild a playable Blob from a stored attempt. */
export function toBlob(recording: Pick<StoredRecording, "data" | "mimeType">): Blob {
  return new Blob([recording.data], recording.mimeType ? { type: recording.mimeType } : undefined);
}
