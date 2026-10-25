import { describe, expect, it } from "vitest";
import { fixtureVideos } from "../../test/fixtures/videoIndex";
import {
  DEFAULT_FILTERS,
  activeFilters,
  applyFilters,
  clearFilters,
  durationBucket,
  facetedTagCounts,
  filtersToSearchParams,
  isFilterActive,
  removeFilter,
  searchParamsToFilters,
  tagCounts,
  toggleChannel,
  toggleTag,
  type Filters,
} from "./filters";

const f = (over: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...over });
const ids = (filters: Partial<Filters>) => applyFilters(fixtureVideos, f(filters)).map((v) => v.id);
const sorted = (xs: string[]) => [...xs].sort();

describe("applyFilters", () => {
  it("returns every video with default filters", () => {
    expect(ids({})).toHaveLength(fixtureVideos.length);
  });

  it("does not mutate the input", () => {
    const before = fixtureVideos.map((v) => v.id);
    applyFilters(fixtureVideos, f({ sort: "shortest" }));
    expect(fixtureVideos.map((v) => v.id)).toEqual(before);
  });

  describe("tags", () => {
    it("ORs tags within the same group", () => {
      // th-sounds and r-l are both consonants
      expect(sorted(ids({ tags: ["th-sounds", "r-l"] }))).toEqual(["rl000000001", "th000000001", "th000000002"]);
    });

    it("ANDs tags across groups", () => {
      // th-sounds (consonants) AND minimal-pairs (foundations)
      expect(ids({ tags: ["th-sounds", "minimal-pairs"] })).toEqual(["th000000002"]);
    });

    it("combines OR within and AND across", () => {
      expect(sorted(ids({ tags: ["th-sounds", "r-l", "minimal-pairs"] }))).toEqual(["rl000000001", "th000000002"]);
      expect(ids({ tags: ["final-consonants", "minimal-pairs"] })).toEqual(["fc000000002"]);
    });

    it("returns nothing when no video has the tag", () => {
      expect(ids({ tags: ["schwa"] })).toEqual([]);
    });
  });

  describe("duration", () => {
    it("buckets at 5 and 15 minutes", () => {
      expect(durationBucket(299)).toBe("short");
      expect(durationBucket(300)).toBe("medium");
      expect(durationBucket(900)).toBe("medium");
      expect(durationBucket(901)).toBe("long");
    });

    it("filters short (<5 min)", () => {
      expect(sorted(ids({ duration: "short" }))).toEqual(["fc000000001", "in000000001", "ln000000001", "th000000002"]);
    });

    it("filters medium (5–15 min)", () => {
      expect(sorted(ids({ duration: "medium" }))).toEqual(["ed000000001", "rl000000001", "ss000000001", "th000000001"]);
    });

    it("filters long (>15 min)", () => {
      expect(sorted(ids({ duration: "long" }))).toEqual(["fc000000002", "ip000000001", "vw000000001", "ws000000001"]);
    });
  });

  describe("search", () => {
    it('folds diacritics: "phat am" matches "phát âm"', () => {
      expect(ids({ q: "phat am" })).toEqual(["fc000000002"]);
    });

    it('maps đ: "dong" matches "Đồng"', () => {
      expect(ids({ q: "dong" })).toEqual(["fc000000002"]);
    });

    it('"am cuoi" matches "âm cuối"', () => {
      expect(sorted(ids({ q: "am cuoi" }))).toEqual(["fc000000001", "fc000000002"]);
    });

    it("is case-insensitive and accepts accented queries", () => {
      expect(ids({ q: "ÂM CUỐI" })).toHaveLength(2);
      expect(ids({ q: "  IPA   chart " })).toEqual(["ip000000001"]);
    });

    it("requires every word, in any order", () => {
      expect(ids({ q: "cuoi dong" })).toEqual(["fc000000002"]);
      expect(ids({ q: "cuoi zzz" })).toEqual([]);
    });

    it("ignores a blank query", () => {
      expect(ids({ q: "   " })).toHaveLength(fixtureVideos.length);
    });
  });

  it("filters by channel title", () => {
    expect(sorted(ids({ channels: ["Phát Âm Hay"] }))).toEqual(["in000000001", "ln000000001"]);
    expect(ids({ channels: ["Phát Âm Hay", "Rachel's English"] })).toHaveLength(4);
  });

  it("hides Shorts (≤ 3 min)", () => {
    const kept = applyFilters(fixtureVideos, f({ hideShorts: true }));
    expect(kept).toHaveLength(8);
    expect(kept.every((v) => !v.isShort)).toBe(true);
  });

  describe("sort", () => {
    it("newest first, videos without publishedAt last", () => {
      const out = ids({});
      expect(out[0]).toBe("th000000001");
      expect(out.slice(-2)).toEqual(["ws000000001", "ip000000001"]);
      const dated = applyFilters(fixtureVideos, f({})).filter((v) => v.publishedAt);
      const dates = dated.map((v) => v.publishedAt!);
      expect(dates).toEqual([...dates].sort().reverse());
    });

    it("shortest first", () => {
      const out = applyFilters(fixtureVideos, f({ sort: "shortest" })).map((v) => v.durationSec);
      expect(out).toEqual([...out].sort((a, b) => a - b));
    });
  });
});

describe("tagCounts / facetedTagCounts", () => {
  it("counts videos per tag", () => {
    const counts = tagCounts(fixtureVideos);
    expect(counts["minimal-pairs"]).toBe(3);
    expect(counts["th-sounds"]).toBe(2);
    expect(counts.schwa).toBeUndefined();
  });

  it("counts within the current result set", () => {
    const counts = facetedTagCounts(fixtureVideos, f({ duration: "short" }));
    expect(counts["th-sounds"]).toBe(1);
    expect(counts["final-consonants"]).toBe(1);
    expect(counts["word-stress"]).toBeUndefined();
  });

  it("ignores a group's own selection so sibling chips keep their counts", () => {
    const counts = facetedTagCounts(fixtureVideos, f({ tags: ["th-sounds"] }));
    expect(counts["th-sounds"]).toBe(2);
    expect(counts["r-l"]).toBe(1); // OR within consonants would add it
    expect(counts["minimal-pairs"]).toBe(1); // AND across groups: only th000000002
    expect(counts["final-consonants"]).toBeUndefined();
  });
});

describe("active filters", () => {
  it("lists active filters with tags in the order they were added", () => {
    let filters = toggleTag(f({}), "r-l");
    filters = toggleTag(filters, "th-sounds");
    filters = toggleChannel(filters, "Sounds American");
    expect(activeFilters(filters).at(-1)).toEqual({ kind: "tag", id: "th-sounds" });
    expect(activeFilters(f({ duration: "long", q: "x", hideShorts: true }))).toHaveLength(3);
  });

  it("removes one filter and clears all but sort", () => {
    const filters = f({ tags: ["th-sounds", "r-l"], duration: "short", sort: "shortest" });
    const removed = removeFilter(filters, { kind: "tag", id: "r-l" });
    expect(removed.tags).toEqual(["th-sounds"]);
    expect(isFilterActive(removed, { kind: "tag", id: "r-l" })).toBe(false);
    expect(removeFilter(filters, { kind: "duration" }).duration).toBe("any");
    expect(clearFilters(filters)).toEqual({ ...DEFAULT_FILTERS, sort: "shortest" });
  });

  it("toggles tags off again", () => {
    expect(toggleTag(f({ tags: ["th-sounds"] }), "th-sounds").tags).toEqual([]);
  });
});

describe("URL params", () => {
  it("omits defaults", () => {
    expect(filtersToSearchParams(f({})).toString()).toBe("");
  });

  it("uses the documented keys", () => {
    const params = filtersToSearchParams(
      f({
        tags: ["th-sounds", "ed-endings"],
        channels: ["Sounds American"],
        duration: "short",
        q: "phát âm",
        sort: "shortest",
        hideShorts: true,
      }),
    );
    expect(params.get("tags")).toBe("th-sounds,ed-endings");
    expect(params.getAll("ch")).toEqual(["Sounds American"]);
    expect(params.get("dur")).toBe("short");
    expect(params.get("q")).toBe("phát âm");
    expect(params.get("sort")).toBe("shortest");
    expect(params.get("shorts")).toBe("hide");
  });

  it("round-trips", () => {
    const filters = f({
      tags: ["final-consonants", "minimal-pairs"],
      channels: ["Rachel's English", "Moon ESL - Phát âm tiếng Anh", "A, B & C"],
      duration: "long",
      q: "âm cuối",
      sort: "shortest",
      hideShorts: true,
    });
    const url = filtersToSearchParams(filters).toString();
    expect(searchParamsToFilters(new URLSearchParams(url))).toEqual(filters);
    expect(searchParamsToFilters(filtersToSearchParams(DEFAULT_FILTERS))).toEqual(DEFAULT_FILTERS);
  });

  it("parses the plan's example URL", () => {
    const filters = searchParamsToFilters(new URLSearchParams("tags=th-sounds,ed-endings&dur=short"));
    expect(filters).toEqual(f({ tags: ["th-sounds", "ed-endings"], duration: "short" }));
  });

  it("drops unknown tags, duplicates and invalid values", () => {
    const filters = searchParamsToFilters(
      new URLSearchParams("tags=th-sounds,nope,,th-sounds&tags=r-l&dur=huge&sort=oldest&shorts=yes"),
    );
    expect(filters).toEqual(f({ tags: ["th-sounds", "r-l"] }));
  });
});
