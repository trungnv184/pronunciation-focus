import { describe, expect, it } from "vitest";
import { fixtureVideos } from "../../test/fixtures/videoIndex";
import { dayNumber, isLocalDate, toLocalDate } from "./dates";
import { computeStreak, continueList, doneIds, groupProgress, tagProgress, weakestGroup } from "./stats";
import type { ProgressState, VideoProgress } from "./store";

const done = (updatedAt = "2026-10-01T00:00:00.000Z"): VideoProgress => ({ status: "done", updatedAt });
const started = (updatedAt: string): VideoProgress => ({ status: "started", updatedAt });
const state = (videos: ProgressState["videos"], activity: string[] = []): ProgressState => ({ videos, activity });

describe("dates", () => {
  it("formats local dates, not UTC", () => {
    expect(toLocalDate(new Date(2026, 9, 25, 23, 59))).toBe("2026-10-25");
    expect(toLocalDate(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });

  it("validates calendar dates", () => {
    expect(isLocalDate("2024-02-29")).toBe(true);
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2026-13-01")).toBe(false);
    expect(isLocalDate("2026-1-01")).toBe(false);
    expect(dayNumber("2026-11-01")! - dayNumber("2026-10-31")!).toBe(1);
  });
});

describe("computeStreak", () => {
  it("is zero with no activity", () => {
    expect(computeStreak([], "2026-10-25")).toEqual({ current: 0, best: 0 });
  });

  it("counts across a month boundary", () => {
    const activity = ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"];
    expect(computeStreak(activity, "2026-11-02")).toEqual({ current: 4, best: 4 });
  });

  it("counts across a year boundary and February in a leap year", () => {
    expect(computeStreak(["2025-12-31", "2026-01-01"], "2026-01-01").current).toBe(2);
    expect(computeStreak(["2024-02-28", "2024-02-29", "2024-03-01"], "2024-03-01").current).toBe(3);
    expect(computeStreak(["2026-02-28", "2026-03-01"], "2026-03-01").current).toBe(2);
  });

  it("a missed day breaks the current streak but not the best", () => {
    const activity = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06"];
    expect(computeStreak(activity, "2026-10-06")).toEqual({ current: 2, best: 3 });
  });

  it("counts yesterday as current if there is no activity yet today", () => {
    const activity = ["2026-10-29", "2026-10-30", "2026-10-31"];
    expect(computeStreak(activity, "2026-11-01")).toEqual({ current: 3, best: 3 });
  });

  it("drops to zero after a full missed day", () => {
    expect(computeStreak(["2026-10-29", "2026-10-30"], "2026-11-01")).toEqual({ current: 0, best: 2 });
  });

  it("ignores order, duplicates and invalid dates", () => {
    const activity = ["2026-10-03", "bad", "2026-10-01", "2026-10-02", "2026-10-02"];
    expect(computeStreak(activity, "2026-10-03")).toEqual({ current: 3, best: 3 });
  });
});

describe("derived counts against the fixture index", () => {
  // th000000002: th-sounds + minimal-pairs; fc000000002: final-consonants + minimal-pairs
  const progress = state({
    th000000002: done(),
    fc000000002: done(),
    ed000000001: started("2026-10-03T00:00:00.000Z"),
    rl000000001: started("2026-10-05T00:00:00.000Z"),
    in000000001: started("2026-10-04T00:00:00.000Z"),
    gone0000001: done(), // not in the index: ignored
  });

  it("doneIds lists done videos", () => {
    expect([...doneIds(progress)].sort()).toEqual(["fc000000002", "gone0000001", "th000000002"]);
  });

  it("counts done / available per tag", () => {
    const tags = tagProgress(fixtureVideos, progress);
    expect(tags["minimal-pairs"]).toEqual({ done: 2, available: 3 });
    expect(tags["th-sounds"]).toEqual({ done: 1, available: 2 });
    expect(tags["final-consonants"]).toEqual({ done: 1, available: 2 });
    expect(tags["ed-endings"]).toEqual({ done: 0, available: 1 });
    expect(tags.schwa).toEqual({ done: 0, available: 0 });
  });

  it("counts done / available per group, each video once per group", () => {
    const groups = groupProgress(fixtureVideos, progress);
    // endings: ed, fc1, fc2, ss
    expect(groups.endings).toEqual({ done: 1, available: 4 });
    // consonants: th1, th2, rl
    expect(groups.consonants).toEqual({ done: 1, available: 3 });
    // foundations: th2, fc2, rl (minimal-pairs), ip (ipa-basics)
    expect(groups.foundations).toEqual({ done: 2, available: 4 });
    expect(groups.vowels).toEqual({ done: 0, available: 1 });
    expect(groups.stress).toEqual({ done: 0, available: 1 });
    expect(groups["rhythm-intonation"]).toEqual({ done: 0, available: 2 });
  });

  it("lists started-not-done videos, most recent first", () => {
    expect(continueList(fixtureVideos, progress).map((v) => v.id)).toEqual([
      "rl000000001",
      "in000000001",
      "ed000000001",
    ]);
  });

  it("picks the weakest group: lowest ratio, then most left, then taxonomy order", () => {
    // vowels, stress and rhythm-intonation are all 0%; rhythm-intonation has the most left.
    const weakest = weakestGroup(fixtureVideos, progress)!;
    expect(weakest.group.id).toBe("rhythm-intonation");
    expect(weakest.tags).toEqual(["linking-connected-speech", "intonation"]);
    expect(weakest).toMatchObject({ done: 0, available: 2 });
  });

  it("weakest group with nothing done is the first group with the most videos", () => {
    const weakest = weakestGroup(fixtureVideos, state({}))!;
    expect(weakest.group.id).toBe("endings");
    expect(weakest.tags).toEqual(["final-consonants", "s-es-endings", "ed-endings"]);
  });

  it("weakest group ignores groups with no videos and returns null for an empty index", () => {
    expect(weakestGroup([], state({}))).toBeNull();
    const allDoneButVowels = state(
      Object.fromEntries(fixtureVideos.filter((v) => v.id !== "vw000000001").map((v) => [v.id, done()])),
    );
    expect(weakestGroup(fixtureVideos, allDoneButVowels)!.group.id).toBe("vowels");
  });
});
