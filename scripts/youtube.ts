/**
 * Minimal YouTube Data API v3 client for the ingest script.
 *
 * The API key travels only in the `X-Goog-Api-Key` header, never in the URL, so request
 * URLs can be logged and included in errors safely. Headers are never logged.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const API_BASE = "https://www.googleapis.com/youtube/v3/";

export type Params = Record<string, string | number | undefined>;

/** Anything that can answer a YouTube API GET: the real HTTP client or recorded fixtures. */
export interface YouTubeClient {
  get<T = unknown>(endpoint: "channels" | "playlistItems" | "videos", params: Params): Promise<T>;
}

export class YouTubeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
    readonly reason?: string,
  ) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

/** Daily quota is used up; retrying today is pointless. */
export class QuotaError extends YouTubeApiError {
  constructor(url: string, reason: string) {
    super(`YouTube API quota exceeded (${reason}) for ${url}`, 403, url, reason);
    this.name = "QuotaError";
  }
}

const QUOTA_REASONS = new Set(["quotaExceeded", "dailyLimitExceeded"]);
const RATE_LIMIT_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded"]);

export function buildUrl(endpoint: string, params: Params): string {
  const url = new URL(endpoint, API_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  if (url.searchParams.has("key")) throw new Error("API key must not be passed as a query parameter");
  return url.toString();
}

type ErrorBody = { error?: { message?: string; errors?: { reason?: string }[] } };

async function readErrorReason(res: Response): Promise<{ reason?: string; message?: string }> {
  try {
    const body = (await res.json()) as ErrorBody;
    return { reason: body.error?.errors?.[0]?.reason, message: body.error?.message };
  } catch {
    return {};
  }
}

export type HttpClientOptions = {
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export function createHttpClient(apiKey: string, opts: HttpClientOptions = {}): YouTubeClient {
  if (!apiKey) throw new Error("YT_API_KEY is empty");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxRetries = opts.maxRetries ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  return {
    async get<T>(endpoint: string, params: Params): Promise<T> {
      const url = buildUrl(endpoint, params);
      for (let attempt = 0; ; attempt++) {
        let res: Response;
        try {
          res = await fetchImpl(url, { headers: { "X-Goog-Api-Key": apiKey, Accept: "application/json" } });
        } catch (err) {
          if (attempt >= maxRetries) {
            throw new YouTubeApiError(`Network error for ${url}: ${(err as Error).message}`, 0, url);
          }
          await sleep(baseDelayMs * 2 ** attempt);
          continue;
        }
        if (res.ok) return (await res.json()) as T;

        const { reason, message } = await readErrorReason(res);
        if (res.status === 403 && reason && QUOTA_REASONS.has(reason)) throw new QuotaError(url, reason);
        const retryable = res.status === 429 || res.status >= 500 || (!!reason && RATE_LIMIT_REASONS.has(reason));
        if (retryable && attempt < maxRetries) {
          await sleep(baseDelayMs * 2 ** attempt);
          continue;
        }
        throw new YouTubeApiError(
          `YouTube API ${res.status}${reason ? ` (${reason})` : ""} for ${url}${message ? `: ${message}` : ""}`,
          res.status,
          url,
          reason,
        );
      }
    },
  };
}

/**
 * Replays recorded response bodies from `dir`:
 * - `channels.json`: `{ "<handle without @>": <channels response> }`; a missing handle → `{ items: [] }`
 * - `playlistItems.json`: `{ "<playlistId>|<pageToken or empty>": <playlistItems response> }`
 * - `videos.json`: `{ "items": [<video resource>, ...] }`, filtered by the requested ids
 */
export function createFixtureClient(dir: string): YouTubeClient {
  const read = (name: string) => JSON.parse(readFileSync(join(dir, name), "utf8"));
  const channels = read("channels.json") as Record<string, unknown>;
  const playlists = read("playlistItems.json") as Record<string, unknown>;
  const videos = read("videos.json") as { items: { id: string }[] };

  return {
    async get<T>(endpoint: string, params: Params): Promise<T> {
      if (endpoint === "channels") {
        return (channels[String(params.forHandle)] ?? { items: [] }) as T;
      }
      if (endpoint === "playlistItems") {
        const key = `${params.playlistId}|${params.pageToken ?? ""}`;
        const page = playlists[key];
        if (!page) throw new YouTubeApiError(`No fixture for playlistItems ${key}`, 404, key);
        return page as T;
      }
      const ids = new Set(String(params.id).split(","));
      return { items: videos.items.filter((v) => ids.has(v.id)) } as T;
    },
  };
}
