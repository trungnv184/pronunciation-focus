import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compareNewest, VideoIndexSchema } from "./schema";
import { fixtureIndex } from "../test/fixtures/videoIndex";

const apiVideo = {
  id: "abcdefghijk",
  channelId: "UCabcdefghijklmnopqrstuv",
  channelTitle: "Channel",
  title: "Title",
  description: "",
  publishedAt: "2026-01-01T00:00:00Z",
  durationSec: 600,
  thumbnail: "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg",
  tags: ["th-sounds"],
  isShort: false,
};
const apiChannel = { handle: "@x", id: "UCabcdefghijklmnopqrstuv", title: "X", lang: "en", allPronunciation: true };
const apiIndex = (videos: unknown[]) => ({
  generatedAt: "2026-01-02T00:00:00Z",
  source: "youtube-api",
  channels: [apiChannel],
  videos,
});

describe("schema", () => {
  it("the committed public/data/videos.json parses", () => {
    const json = JSON.parse(readFileSync(resolve(__dirname, "../../public/data/videos.json"), "utf8"));
    expect(VideoIndexSchema.safeParse(json).success).toBe(true);
  });

  it("the UI fixture parses", () => {
    expect(fixtureIndex.videos.length).toBeGreaterThanOrEqual(10);
  });

  it("accepts a complete API-sourced video", () => {
    expect(VideoIndexSchema.safeParse(apiIndex([apiVideo])).success).toBe(true);
  });

  it("rejects an API-sourced video without channelId", () => {
    const { channelId: _omit, ...noChannel } = apiVideo;
    const result = VideoIndexSchema.safeParse(apiIndex([noChannel]));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["videos", 0, "channelId"]);
  });

  it("rejects an API-sourced video without publishedAt or description", () => {
    const { publishedAt: _p, description: _d, ...partial } = apiVideo;
    expect(VideoIndexSchema.safeParse(apiIndex([partial])).success).toBe(false);
  });

  it("allows seed videos without the optional API fields", () => {
    const { channelId: _c, publishedAt: _p, description: _d, ...seedVideo } = apiVideo;
    const seed = { ...apiIndex([seedVideo]), source: "seed", channels: [{ ...apiChannel, id: undefined }] };
    expect(VideoIndexSchema.safeParse(seed).success).toBe(true);
  });

  it("rejects unknown tags", () => {
    expect(VideoIndexSchema.safeParse(apiIndex([{ ...apiVideo, tags: ["nope"] }])).success).toBe(false);
  });

  it("rejects isShort inconsistent with duration", () => {
    expect(VideoIndexSchema.safeParse(apiIndex([{ ...apiVideo, durationSec: 60 }])).success).toBe(false);
  });

  it("compareNewest sorts videos without publishedAt last", () => {
    const sorted = [{ publishedAt: undefined }, { publishedAt: "2026-01-01T00:00:00Z" }, { publishedAt: "2026-05-01T00:00:00Z" }]
      .sort(compareNewest)
      .map((v) => v.publishedAt);
    expect(sorted).toEqual(["2026-05-01T00:00:00Z", "2026-01-01T00:00:00Z", undefined]);
  });
});
