/**
 * Builds public/data/videos.json from the YouTube Data API v3.
 *
 *   npm run ingest -- [--out <path>] [--previous <path>] [--dry-run] [--fixture <dir>] [--allow-drop]
 *
 * The API key is read from the YT_API_KEY environment variable (a GitHub Actions secret in CI).
 * It is never written to disk, logged, or put in a URL.
 *
 * Safety: the output file is replaced only when the new index is valid, every channel kept at
 * least one video, the total did not drop by more than 30% (unless --allow-drop), and something
 * other than `generatedAt` changed. Writes are atomic (temp file + rename).
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ChannelListSchema,
  DESCRIPTION_MAX,
  OverridesSchema,
  SHORT_MAX_SEC,
  VideoIndexSchema,
  compareNewest,
  type Channel,
  type Overrides,
  type Video,
  type VideoIndex,
} from "../src/data/schema";
import { cleanDescription, findBoilerplateLines, isPronunciationVideo, tagVideo } from "../src/data/tagger";
import { TAG_IDS, type TagId } from "../src/data/taxonomy";
import { createFixtureClient, createHttpClient, type YouTubeClient } from "./youtube";

export const MAX_VIDEOS_PER_CHANNEL = 500;
export const MAX_DROP_RATIO = 0.3;
const REGION = "VN";

// ── API response shapes (only the fields we read) ───────────────────────────
type ChannelsResponse = {
  items?: { id: string; snippet: { title: string }; contentDetails: { relatedPlaylists: { uploads: string } } }[];
};
type PlaylistItemsResponse = { items?: { contentDetails: { videoId: string } }[]; nextPageToken?: string };
export type ApiVideo = {
  id: string;
  snippet: {
    channelId: string;
    channelTitle: string;
    title: string;
    description?: string;
    publishedAt: string;
    liveBroadcastContent?: string;
    thumbnails?: Record<string, { url: string } | undefined>;
  };
  contentDetails: {
    duration: string;
    contentRating?: { ytRating?: string };
    regionRestriction?: { allowed?: string[]; blocked?: string[] };
  };
  status: { embeddable?: boolean; privacyStatus?: string };
};
type VideosResponse = { items?: ApiVideo[] };

// ── Pure helpers ────────────────────────────────────────────────────────────

/** ISO-8601 duration ("PT1H2M3S", "P1DT2M", "P0D") → seconds. Throws on anything else. */
export function parseIsoDuration(iso: string): number {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso);
  if (!m || iso === "P" || iso.endsWith("T")) throw new Error(`Invalid ISO-8601 duration: ${iso}`);
  const [, w, d, h, min, s] = m.map((x) => (x === undefined ? 0 : Number(x)));
  return Math.round(w * 604800 + d * 86400 + h * 3600 + min * 60 + s);
}

export type SkipReason =
  | "not-embeddable"
  | "not-public"
  | "live-or-upcoming"
  | "zero-duration"
  | "age-restricted"
  | "region-blocked";

/** Why a video can't be shown to a learner in Vietnam, or null when it is playable. */
export function unplayableReason(v: ApiVideo): SkipReason | null {
  if (v.status.embeddable !== true) return "not-embeddable";
  if (v.status.privacyStatus !== "public") return "not-public";
  if ((v.snippet.liveBroadcastContent ?? "none") !== "none") return "live-or-upcoming";
  if (v.contentDetails.duration === "P0D" || parseIsoDuration(v.contentDetails.duration) === 0) return "zero-duration";
  if (v.contentDetails.contentRating?.ytRating === "ytAgeRestricted") return "age-restricted";
  const rr = v.contentDetails.regionRestriction;
  if (rr?.blocked?.includes(REGION)) return "region-blocked";
  if (rr?.allowed && !rr.allowed.includes(REGION)) return "region-blocked";
  return null;
}

function pickThumbnail(v: ApiVideo): string {
  const t = v.snippet.thumbnails ?? {};
  return t.medium?.url ?? t.high?.url ?? t.default?.url ?? `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

/** Overrides: `exclude` wins over everything, then `include`, `addTags`, `removeTags`. */
export function applyOverrides(
  id: string,
  autoKeep: boolean,
  autoTags: TagId[],
  overrides: Overrides,
): { keep: boolean; tags: TagId[] } {
  if (overrides.exclude.includes(id)) return { keep: false, tags: [] };
  const keep = autoKeep || overrides.include.includes(id);
  const tags = new Set<TagId>([...autoTags, ...(overrides.addTags[id] ?? [])]);
  for (const t of overrides.removeTags[id] ?? []) tags.delete(t);
  return { keep, tags: TAG_IDS.filter((t) => tags.has(t)) };
}

/** Everything except `generatedAt`, for "did anything meaningful change?" */
function comparable(index: VideoIndex): string {
  const { generatedAt: _ignored, ...rest } = index;
  return JSON.stringify(rest);
}

function writeAtomic(path: string, content: string): void {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

// ── Fetching ────────────────────────────────────────────────────────────────

type ChannelStats = { handle: string; fetched: number; playable: number; kept: number };

async function resolveChannel(client: YouTubeClient, channel: Channel) {
  const res = await client.get<ChannelsResponse>("channels", {
    part: "snippet,contentDetails",
    forHandle: channel.handle.replace(/^@/, ""),
  });
  const item = res.items?.[0];
  if (!item) throw new IngestError(`Channel handle ${channel.handle} returned no items`);
  return { id: item.id, title: item.snippet.title, uploads: item.contentDetails.relatedPlaylists.uploads };
}

async function listUploadIds(client: YouTubeClient, playlistId: string, max: number): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await client.get<PlaylistItemsResponse>("playlistItems", {
      part: "contentDetails",
      playlistId,
      maxResults: 50,
      pageToken,
    });
    for (const item of page.items ?? []) ids.push(item.contentDetails.videoId);
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < max);
  return [...new Set(ids)].slice(0, max);
}

async function fetchVideos(client: YouTubeClient, ids: string[]): Promise<ApiVideo[]> {
  const out: ApiVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const res = await client.get<VideosResponse>("videos", {
      part: "snippet,contentDetails,status",
      id: ids.slice(i, i + 50).join(","),
      maxResults: 50,
    });
    out.push(...(res.items ?? []));
  }
  return out;
}

// ── Main pipeline ───────────────────────────────────────────────────────────

export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestError";
  }
}

export type IngestOptions = {
  channels: Channel[];
  overrides: Overrides;
  client: YouTubeClient;
  maxPerChannel?: number;
  now?: () => Date;
  log?: (line: string) => void;
};

export async function buildIndex(opts: IngestOptions): Promise<{ index: VideoIndex; stats: ChannelStats[] }> {
  const log = opts.log ?? (() => {});
  const max = opts.maxPerChannel ?? MAX_VIDEOS_PER_CHANNEL;
  const channels: Channel[] = [];
  const videos = new Map<string, Video>();
  const stats: ChannelStats[] = [];

  for (const channel of opts.channels) {
    const resolved = await resolveChannel(opts.client, channel);
    const enriched: Channel = { ...channel, id: resolved.id, title: resolved.title };
    channels.push(enriched);

    const ids = await listUploadIds(opts.client, resolved.uploads, max);
    const fetched = await fetchVideos(opts.client, ids);
    const boilerplate = findBoilerplateLines(fetched.map((v) => v.snippet.description ?? ""));
    const s: ChannelStats = { handle: channel.handle, fetched: fetched.length, playable: 0, kept: 0 };

    for (const v of fetched) {
      if (unplayableReason(v)) continue;
      s.playable++;
      const rawDescription = v.snippet.description ?? "";
      const input = { title: v.snippet.title, description: cleanDescription(rawDescription, boilerplate) };
      const autoTags = tagVideo(input, enriched);
      const autoKeep = isPronunciationVideo({ ...input, tags: autoTags }, enriched);
      const { keep, tags } = applyOverrides(v.id, autoKeep, autoTags, opts.overrides);
      if (!keep || videos.has(v.id)) continue;
      const durationSec = parseIsoDuration(v.contentDetails.duration);
      videos.set(v.id, {
        id: v.id,
        channelId: v.snippet.channelId,
        channelTitle: v.snippet.channelTitle,
        title: v.snippet.title,
        description: truncate(rawDescription, DESCRIPTION_MAX),
        publishedAt: v.snippet.publishedAt,
        durationSec,
        thumbnail: pickThumbnail(v),
        tags,
        isShort: durationSec <= SHORT_MAX_SEC,
      });
      s.kept++;
    }
    stats.push(s);
    log(`${channel.handle}: fetched ${s.fetched} / playable ${s.playable} / kept ${s.kept}`);
  }

  const index = VideoIndexSchema.parse({
    generatedAt: (opts.now ?? (() => new Date()))().toISOString().replace(/\.\d{3}Z$/, "Z"),
    source: "youtube-api",
    channels,
    videos: [...videos.values()].sort((a, b) => compareNewest(a, b) || a.id.localeCompare(b.id)),
  });
  return { index, stats };
}

export type GuardResult = { ok: true } | { ok: false; reason: string };

export function checkGuards(
  index: VideoIndex,
  stats: ChannelStats[],
  previous: VideoIndex | null,
  allowDrop: boolean,
): GuardResult {
  const empty = stats.filter((s) => s.kept === 0).map((s) => s.handle);
  if (empty.length) return { ok: false, reason: `channel(s) with 0 kept videos: ${empty.join(", ")}` };
  if (previous && !allowDrop) {
    const before = previous.videos.length;
    const after = index.videos.length;
    if (before > 0 && (before - after) / before > MAX_DROP_RATIO) {
      return {
        ok: false,
        reason: `video count dropped from ${before} to ${after} (>${MAX_DROP_RATIO * 100}%); pass --allow-drop if intended`,
      };
    }
  }
  return { ok: true };
}

export type RunOptions = {
  out: string;
  previous: string;
  dryRun: boolean;
  allowDrop: boolean;
  channelsPath: string;
  overridesPath: string;
  client: YouTubeClient;
  maxPerChannel?: number;
  now?: () => Date;
  log?: (line: string) => void;
};

export type RunResult = "written" | "unchanged" | "dry-run";

function readPrevious(path: string): VideoIndex | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = VideoIndexSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null; // unreadable previous file: nothing to compare against
  }
}

/** Throws (leaving `out` untouched) when anything goes wrong. */
export async function run(opts: RunOptions): Promise<RunResult> {
  const log = opts.log ?? console.log;
  const channels = ChannelListSchema.parse(JSON.parse(readFileSync(opts.channelsPath, "utf8")));
  const overrides = OverridesSchema.parse(JSON.parse(readFileSync(opts.overridesPath, "utf8")));
  const previous = readPrevious(opts.previous);

  const { index, stats } = await buildIndex({
    channels,
    overrides,
    client: opts.client,
    maxPerChannel: opts.maxPerChannel,
    now: opts.now,
    log,
  });
  log(`total kept: ${index.videos.length}${previous ? ` (previous: ${previous.videos.length}, ${previous.source})` : ""}`);

  const guard = checkGuards(index, stats, previous, opts.allowDrop);
  if (!guard.ok) throw new IngestError(`Keeping the old file: ${guard.reason}`);

  if (previous && comparable(previous) === comparable(index)) {
    log("no changes");
    return "unchanged";
  }
  if (opts.dryRun) {
    log("dry run: not writing");
    return "dry-run";
  }
  writeAtomic(opts.out, JSON.stringify(index, null, 2) + "\n");
  log(`wrote ${opts.out}`);
  return "written";
}

// ── CLI ─────────────────────────────────────────────────────────────────────

export function parseArgs(argv: string[]) {
  const args = { out: "public/data/videos.json", previous: "", dryRun: false, fixture: "", allowDrop: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--out") args.out = value();
    else if (a === "--previous") args.previous = value();
    else if (a === "--fixture") args.fixture = value();
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--allow-drop") args.allowDrop = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!args.previous) args.previous = args.out;
  return args;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const args = parseArgs(process.argv.slice(2));
  let client: YouTubeClient;
  if (args.fixture) {
    client = createFixtureClient(resolve(args.fixture));
  } else {
    const key = process.env.YT_API_KEY ?? "";
    if (!key) throw new IngestError("YT_API_KEY is not set (use --fixture <dir> for offline runs)");
    client = createHttpClient(key);
  }
  await run({
    out: resolve(args.out),
    previous: resolve(args.previous),
    dryRun: args.dryRun,
    allowDrop: args.allowDrop,
    channelsPath: resolve(root, "data/channels.json"),
    overridesPath: resolve(root, "data/overrides.json"),
    client,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    // Only the message: error objects from fetch could carry request details.
    console.error(`ingest failed: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
    process.exit(1);
  });
}
