import type { Video } from "../../data/schema";
import { TAG_BY_ID, TAG_GROUPS, TAGS, type TagGroup, type TagId } from "../../data/taxonomy";
import { dayNumber, toLocalDate } from "./dates";
import type { ProgressState } from "./store";

/** Pure derived stats. Counts are always measured against the videos in the index. */

export type Count = { done: number; available: number };

/** IDs of done videos. */
export function doneIds(state: ProgressState): Set<string> {
  return new Set(Object.entries(state.videos).filter(([, p]) => p.status === "done").map(([id]) => id));
}

/** Done / available per tag, for every tag in the taxonomy. */
export function tagProgress(videos: readonly Video[], state: ProgressState): Record<TagId, Count> {
  const out = Object.fromEntries(TAGS.map((t) => [t.id, { done: 0, available: 0 }])) as Record<TagId, Count>;
  for (const video of videos) {
    const done = state.videos[video.id]?.status === "done";
    for (const id of new Set(video.tags)) {
      out[id].available += 1;
      if (done) out[id].done += 1;
    }
  }
  return out;
}

/** Done / available per group. A video with two tags in one group counts once for that group. */
export function groupProgress(videos: readonly Video[], state: ProgressState): Record<TagGroup["id"], Count> {
  const out = Object.fromEntries(TAG_GROUPS.map((g) => [g.id, { done: 0, available: 0 }])) as Record<
    TagGroup["id"],
    Count
  >;
  for (const video of videos) {
    const done = state.videos[video.id]?.status === "done";
    for (const group of new Set(video.tags.map((id) => TAG_BY_ID[id].group))) {
      out[group].available += 1;
      if (done) out[group].done += 1;
    }
  }
  return out;
}

/** Started-but-not-done videos that are still in the index, most recently touched first. */
export function continueList(videos: readonly Video[], state: ProgressState): Video[] {
  return videos
    .filter((v) => state.videos[v.id]?.status === "started")
    .sort((a, b) => state.videos[b.id]!.updatedAt.localeCompare(state.videos[a.id]!.updatedAt));
}

export type WeakestGroup = Count & { group: TagGroup; tags: TagId[] };

/**
 * The group with the lowest done/available ratio among groups with videos. Ties go to the group
 * with more videos left, then to taxonomy order. `tags` lists the group's tags that have videos,
 * for a `/?tags=` link (tags within a group are OR-ed).
 */
export function weakestGroup(videos: readonly Video[], state: ProgressState): WeakestGroup | null {
  const groups = groupProgress(videos, state);
  const tags = tagProgress(videos, state);
  let best: WeakestGroup | null = null;
  for (const group of TAG_GROUPS) {
    const c = groups[group.id];
    if (c.available === 0) continue;
    const candidate: WeakestGroup = {
      group,
      ...c,
      tags: TAGS.filter((t) => t.group === group.id && tags[t.id].available > 0).map((t) => t.id),
    };
    if (best === null) {
      best = candidate;
      continue;
    }
    const diff = c.done / c.available - best.done / best.available;
    const remaining = c.available - c.done - (best.available - best.done);
    if (diff < 0 || (diff === 0 && remaining > 0)) best = candidate;
  }
  return best;
}

export type Streak = { current: number; best: number };

/**
 * Daily streaks from unique local dates. The current streak counts back from today, or from
 * yesterday if there is no activity yet today (the streak isn't broken until the day ends).
 */
export function computeStreak(activity: readonly string[], today: string = toLocalDate()): Streak {
  const days = [...new Set(activity.map(dayNumber).filter((n): n is number => n !== null))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }

  const todayN = dayNumber(today);
  const set = new Set(days);
  let current = 0;
  if (todayN !== null) {
    let cursor = set.has(todayN) ? todayN : todayN - 1;
    while (set.has(cursor)) {
      current += 1;
      cursor -= 1;
    }
  }
  return { current, best };
}
