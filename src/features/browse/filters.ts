import { compareNewest, type Video } from "../../data/schema";
import { TAG_BY_ID, isTagId, type TagGroupId, type TagId } from "../../data/taxonomy";
import { fold } from "../../data/text";

/**
 * Browse filters. Pure functions only: no React, no DOM.
 *
 * To add a field (Step 7 adds `hideDone`): extend `Filters` and `DEFAULT_FILTERS`, handle it in
 * `matchesFilters`, add a URL key in `filtersToSearchParams` / `searchParamsToFilters`, and add an
 * entry in `activeFilters` / `removeFilter` so the "remove last filter" and "clear all" UI see it.
 */

export const DURATIONS = ["any", "short", "medium", "long"] as const;
export type Duration = (typeof DURATIONS)[number];

export const SORTS = ["newest", "shortest"] as const;
export type Sort = (typeof SORTS)[number];

export type Filters = {
  tags: TagId[];
  /** Channel titles (`Video.channelTitle`); seed videos may have no `channelId`. */
  channels: string[];
  duration: Duration;
  q: string;
  sort: Sort;
  hideShorts: boolean;
};

export const DEFAULT_FILTERS: Readonly<Filters> = Object.freeze({
  tags: [],
  channels: [],
  duration: "any",
  q: "",
  sort: "newest",
  hideShorts: false,
});

/** Bucket edges in seconds: short < 5 min, medium 5–15 min, long > 15 min. */
export const SHORT_BUCKET_MAX_SEC = 5 * 60;
export const MEDIUM_BUCKET_MAX_SEC = 15 * 60;

export function durationBucket(durationSec: number): Exclude<Duration, "any"> {
  if (durationSec < SHORT_BUCKET_MAX_SEC) return "short";
  if (durationSec <= MEDIUM_BUCKET_MAX_SEC) return "medium";
  return "long";
}

// ── matching ────────────────────────────────────────────────────────────────

const foldedTitles = new WeakMap<Video, string>();
function foldedTitle(video: Video): string {
  let folded = foldedTitles.get(video);
  if (folded === undefined) {
    folded = fold(video.title);
    foldedTitles.set(video, folded);
  }
  return folded;
}

/** Search terms: folded and split on whitespace. Every term must appear in the title. */
export function searchTerms(q: string): string[] {
  return fold(q).split(" ").filter(Boolean);
}

/** Selected tags grouped by taxonomy group (AND across groups, OR within a group). */
function tagsByGroup(tags: readonly TagId[]): TagId[][] {
  const groups = new Map<TagGroupId, TagId[]>();
  for (const id of tags) {
    const group = TAG_BY_ID[id].group;
    groups.set(group, [...(groups.get(group) ?? []), id]);
  }
  return [...groups.values()];
}

function matcher(filters: Filters): (video: Video) => boolean {
  const tagGroups = tagsByGroup(filters.tags);
  const channels = new Set(filters.channels);
  const terms = searchTerms(filters.q);
  return (video) => {
    if (filters.hideShorts && video.isShort) return false;
    if (filters.duration !== "any" && durationBucket(video.durationSec) !== filters.duration) return false;
    if (channels.size > 0 && !channels.has(video.channelTitle)) return false;
    if (!tagGroups.every((group) => group.some((id) => video.tags.includes(id)))) return false;
    if (terms.length > 0) {
      const title = foldedTitle(video);
      if (!terms.every((t) => title.includes(t))) return false;
    }
    return true;
  };
}

function compareShortest(a: Video, b: Video): number {
  return a.durationSec - b.durationSec || compareNewest(a, b);
}

/** Filters and sorts. Returns a new array; the input is not mutated. */
export function applyFilters(videos: readonly Video[], filters: Filters): Video[] {
  const kept = videos.filter(matcher(filters));
  return kept.sort(filters.sort === "shortest" ? compareShortest : compareNewest);
}

/** Number of videos carrying each tag. Tags that appear on no video are absent. */
export function tagCounts(videos: readonly Video[]): Partial<Record<TagId, number>> {
  const counts: Partial<Record<TagId, number>> = {};
  for (const video of videos) {
    for (const id of video.tags) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/**
 * Faceted counts for the tag chips: for each tag, how many videos it would match given every
 * other active filter. Tags in a group are OR-ed, so a group's own selection is ignored when
 * counting that group; otherwise picking one chip would zero out its siblings.
 */
export function facetedTagCounts(videos: readonly Video[], filters: Filters): Partial<Record<TagId, number>> {
  const result: Partial<Record<TagId, number>> = {};
  const base = tagCounts(applyFilters(videos, filters));
  const selectedGroups = new Set(filters.tags.map((id) => TAG_BY_ID[id].group));
  for (const [id, n] of Object.entries(base) as [TagId, number][]) {
    if (!selectedGroups.has(TAG_BY_ID[id].group)) result[id] = n;
  }
  for (const group of selectedGroups) {
    const withoutGroup = { ...filters, tags: filters.tags.filter((id) => TAG_BY_ID[id].group !== group) };
    const counts = tagCounts(applyFilters(videos, withoutGroup));
    for (const [id, n] of Object.entries(counts) as [TagId, number][]) {
      if (TAG_BY_ID[id].group === group) result[id] = n;
    }
  }
  return result;
}

/** Per-channel counts given every other active filter (the channel selection itself is ignored). */
export function facetedChannelCounts(videos: readonly Video[], filters: Filters): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const video of applyFilters(videos, { ...filters, channels: [] })) {
    counts[video.channelTitle] = (counts[video.channelTitle] ?? 0) + 1;
  }
  return counts;
}

// ── active filters (for "remove last filter" and the active count) ─────────

export type ActiveFilter =
  | { kind: "tag"; id: TagId }
  | { kind: "channel"; title: string }
  | { kind: "duration" }
  | { kind: "q" }
  | { kind: "hideShorts" };

/** Active filters in the order they were most likely added. Sort is not a filter. */
export function activeFilters(filters: Filters): ActiveFilter[] {
  const active: ActiveFilter[] = [];
  if (filters.hideShorts) active.push({ kind: "hideShorts" });
  if (filters.duration !== "any") active.push({ kind: "duration" });
  for (const title of filters.channels) active.push({ kind: "channel", title });
  for (const id of filters.tags) active.push({ kind: "tag", id });
  if (filters.q.trim() !== "") active.push({ kind: "q" });
  return active;
}

export function isFilterActive(filters: Filters, f: ActiveFilter): boolean {
  switch (f.kind) {
    case "tag":
      return filters.tags.includes(f.id);
    case "channel":
      return filters.channels.includes(f.title);
    case "duration":
      return filters.duration !== "any";
    case "q":
      return filters.q.trim() !== "";
    case "hideShorts":
      return filters.hideShorts;
  }
}

export function removeFilter(filters: Filters, f: ActiveFilter): Filters {
  switch (f.kind) {
    case "tag":
      return { ...filters, tags: filters.tags.filter((id) => id !== f.id) };
    case "channel":
      return { ...filters, channels: filters.channels.filter((t) => t !== f.title) };
    case "duration":
      return { ...filters, duration: DEFAULT_FILTERS.duration };
    case "q":
      return { ...filters, q: DEFAULT_FILTERS.q };
    case "hideShorts":
      return { ...filters, hideShorts: DEFAULT_FILTERS.hideShorts };
  }
}

/** Resets every filter but keeps the sort order. */
export function clearFilters(filters: Filters): Filters {
  return { ...DEFAULT_FILTERS, tags: [], channels: [], sort: filters.sort };
}

export function toggleTag(filters: Filters, id: TagId): Filters {
  return filters.tags.includes(id)
    ? { ...filters, tags: filters.tags.filter((t) => t !== id) }
    : { ...filters, tags: [...filters.tags, id] };
}

export function toggleChannel(filters: Filters, title: string): Filters {
  return filters.channels.includes(title)
    ? { ...filters, channels: filters.channels.filter((t) => t !== title) }
    : { ...filters, channels: [...filters.channels, title] };
}

// ── URL ─────────────────────────────────────────────────────────────────────
// Keys: tags (comma list), ch (repeated; titles may contain commas), dur, q, sort, shorts=hide.
// Defaults are omitted, so the unfiltered page is a bare `#/`.

export function filtersToSearchParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.tags.length > 0) params.set("tags", filters.tags.join(","));
  for (const title of filters.channels) params.append("ch", title);
  if (filters.duration !== DEFAULT_FILTERS.duration) params.set("dur", filters.duration);
  if (filters.q.trim() !== "") params.set("q", filters.q);
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set("sort", filters.sort);
  if (filters.hideShorts) params.set("shorts", "hide");
  return params;
}

function oneOf<T extends string>(allowed: readonly T[], value: string | null, fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

const unique = <T>(items: T[]): T[] => [...new Set(items)];

/** Lenient parse: unknown tags and invalid values are dropped, never thrown. */
export function searchParamsToFilters(params: URLSearchParams): Filters {
  const tags = params
    .getAll("tags")
    .flatMap((v) => v.split(","))
    .map((s) => s.trim())
    .filter(isTagId);
  const channels = params
    .getAll("ch")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    tags: unique(tags),
    channels: unique(channels),
    duration: oneOf(DURATIONS, params.get("dur"), DEFAULT_FILTERS.duration),
    q: params.get("q") ?? DEFAULT_FILTERS.q,
    sort: oneOf(SORTS, params.get("sort"), DEFAULT_FILTERS.sort),
    hideShorts: params.get("shorts") === "hide",
  };
}
