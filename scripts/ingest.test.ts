// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Channel, Overrides, VideoIndex } from "../src/data/schema";
import { applyOverrides, parseArgs, parseIsoDuration, run, unplayableReason, type ApiVideo, type RunOptions } from "./ingest";
import { QuotaError, buildUrl, createFixtureClient, createHttpClient, type YouTubeClient } from "./youtube";

const FIXTURES = resolve(__dirname, "__fixtures__");
const KEY_RE = /AIza[0-9A-Za-z_-]{35}/;

const CHANNELS: Channel[] = [
  { handle: "@fixtureone", title: "Fixture One", lang: "en", allPronunciation: false },
  { handle: "@fixturetwo", title: "Fixture Two", lang: "vi", allPronunciation: true },
];
const NO_OVERRIDES: Overrides = { include: [], exclude: [], addTags: {}, removeTags: {} };

let dir: string;
const logs: string[] = [];

function setup(channels: Channel[] = CHANNELS, overrides: Overrides = NO_OVERRIDES) {
  writeFileSync(join(dir, "channels.json"), JSON.stringify(channels));
  writeFileSync(join(dir, "overrides.json"), JSON.stringify(overrides));
}

function options(extra: Partial<RunOptions> = {}): RunOptions {
  const out = join(dir, "videos.json");
  return {
    out,
    previous: out,
    dryRun: false,
    allowDrop: false,
    channelsPath: join(dir, "channels.json"),
    overridesPath: join(dir, "overrides.json"),
    client: createFixtureClient(FIXTURES),
    now: () => new Date("2026-10-26T02:00:00Z"),
    log: (l) => logs.push(l),
    ...extra,
  };
}

function readOut(): VideoIndex {
  return JSON.parse(readFileSync(join(dir, "videos.json"), "utf8"));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pf-ingest-"));
  logs.length = 0;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("parseIsoDuration", () => {
  it.each([
    ["PT12M5S", 725],
    ["PT1H2M3S", 3723],
    ["PT45S", 45],
    ["PT3M", 180],
    ["P1DT2M", 86520],
    ["P0D", 0],
    ["PT0S", 0],
  ])("%s → %i", (iso, sec) => expect(parseIsoDuration(iso)).toBe(sec));

  it.each(["", "P", "PT", "12:00", "PT1X"])("rejects %j", (iso) => {
    expect(() => parseIsoDuration(iso)).toThrow();
  });
});

describe("unplayableReason", () => {
  const items = (JSON.parse(readFileSync(join(FIXTURES, "videos.json"), "utf8")) as { items: ApiVideo[] }).items;
  const byId = (id: string) => items.find((v) => v.id === id)!;
  it.each([
    ["aaaaaaaaa01", null],
    ["aaaaaaaaa04", "not-embeddable"],
    ["aaaaaaaaa05", "age-restricted"],
    ["aaaaaaaaa06", "region-blocked"],
    ["aaaaaaaaa07", "live-or-upcoming"],
    ["aaaaaaaaa08", "region-blocked"],
    ["aaaaaaaaa09", "not-public"],
    ["bbbbbbbbb03", null],
  ])("%s → %s", (id, reason) => expect(unplayableReason(byId(id))).toBe(reason));
});

describe("applyOverrides", () => {
  const o: Overrides = {
    include: ["x0000000001", "x0000000002"],
    exclude: ["x0000000002"],
    addTags: { x0000000003: ["schwa"] },
    removeTags: { x0000000003: ["th-sounds"] },
  };
  it("exclude wins over include", () => expect(applyOverrides("x0000000002", true, [], o).keep).toBe(false));
  it("include forces keep", () => expect(applyOverrides("x0000000001", false, [], o).keep).toBe(true));
  it("adds and removes tags in taxonomy order", () => {
    expect(applyOverrides("x0000000003", true, ["th-sounds", "r-l"], o).tags).toEqual(["r-l", "schwa"]);
  });
});

describe("run (fixtures)", () => {
  it("keeps only playable pronunciation videos, tagged and sorted newest first", async () => {
    setup();
    expect(await run(options())).toBe("written");
    const index = readOut();
    expect(index.source).toBe("youtube-api");
    expect(index.videos.map((v) => v.id)).toEqual([
      "bbbbbbbbb03",
      "bbbbbbbbb01",
      "aaaaaaaaa01",
      "aaaaaaaaa02",
      "aaaaaaaaa10",
      "bbbbbbbbb02",
    ]);
    const byId = Object.fromEntries(index.videos.map((v) => [v.id, v]));
    expect(byId.aaaaaaaaa01.tags).toContain("th-sounds");
    expect(byId.aaaaaaaaa02.tags).toEqual(expect.arrayContaining(["final-consonants", "ed-endings"]));
    expect(byId.bbbbbbbbb03.tags).toContain("final-consonants");
    expect(byId.bbbbbbbbb02.tags).toContain("linking-connected-speech");
    expect(byId.bbbbbbbbb01.tags).toEqual([]); // all-pronunciation channel, untagged lesson
    expect(byId.aaaaaaaaa10.isShort).toBe(true);
    expect(byId.bbbbbbbbb02.durationSec).toBe(3723);
    expect(byId.aaaaaaaaa01.description!.length).toBeLessThanOrEqual(500);
    expect(byId.aaaaaaaaa01.thumbnail).toMatch(/mqdefault/);
    expect(index.channels.map((c) => c.id)).toEqual(["UCfixture0000000000000o1", "UCfixture0000000000000t2"]);
    expect(logs).toContain("@fixtureone: fetched 10 / playable 4 / kept 3");
  });

  it("applies overrides", async () => {
    setup(CHANNELS, {
      include: ["aaaaaaaaa03"],
      exclude: ["aaaaaaaaa01", "aaaaaaaaa04"],
      addTags: { aaaaaaaaa10: ["minimal-pairs"] },
      removeTags: { aaaaaaaaa02: ["final-consonants"] },
    });
    await run(options());
    const byId = Object.fromEntries(readOut().videos.map((v) => [v.id, v]));
    expect(byId.aaaaaaaaa01).toBeUndefined();
    expect(byId.aaaaaaaaa03).toBeDefined(); // included even though it's a vlog
    expect(byId.aaaaaaaaa04).toBeUndefined(); // include can't make an unembeddable video playable
    expect(byId.aaaaaaaaa10.tags).toContain("minimal-pairs");
    expect(byId.aaaaaaaaa02.tags).not.toContain("final-consonants");
  });

  it("keeps the old file when a handle does not exist", async () => {
    setup([...CHANNELS, { handle: "@nosuchhandle", title: "Ghost", lang: "en", allPronunciation: true }]);
    writeFileSync(join(dir, "videos.json"), "OLD");
    await expect(run(options())).rejects.toThrow(/@nosuchhandle/);
    expect(readFileSync(join(dir, "videos.json"), "utf8")).toBe("OLD");
  });

  it("keeps the old file on quota errors", async () => {
    setup();
    writeFileSync(join(dir, "videos.json"), "OLD");
    const quotaClient: YouTubeClient = {
      get: () => Promise.reject(new QuotaError("https://example/videos", "quotaExceeded")),
    };
    await expect(run(options({ client: quotaClient }))).rejects.toBeInstanceOf(QuotaError);
    expect(readFileSync(join(dir, "videos.json"), "utf8")).toBe("OLD");
  });

  it("keeps the old file when a channel ends with 0 kept videos", async () => {
    setup(CHANNELS, { ...NO_OVERRIDES, exclude: ["bbbbbbbbb01", "bbbbbbbbb02", "bbbbbbbbb03"] });
    await expect(run(options())).rejects.toThrow(/0 kept videos: @fixturetwo/);
  });

  it("keeps the old file when the count drops by more than 30%, unless --allow-drop", async () => {
    setup();
    await run(options());
    const big = readOut();
    const filler = Array.from({ length: 10 }, (_, i) => ({
      ...big.videos[0],
      id: `zzzzzzzzz${String(i).padStart(2, "0")}`,
    }));
    const previous = { ...big, videos: [...big.videos, ...filler] }; // 16 → 6 is a 62% drop
    writeFileSync(join(dir, "videos.json"), JSON.stringify(previous));
    await expect(run(options())).rejects.toThrow(/dropped from 16 to 6/);
    expect(readOut().videos).toHaveLength(16);
    expect(await run(options({ allowDrop: true }))).toBe("written");
    expect(readOut().videos).toHaveLength(6);
  });

  it("does not rewrite the file when only generatedAt would change", async () => {
    setup();
    await run(options());
    const path = join(dir, "videos.json");
    const before = readFileSync(path, "utf8");
    const mtime = statSync(path).mtimeMs;
    expect(await run(options({ now: () => new Date("2026-11-02T02:00:00Z") }))).toBe("unchanged");
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(statSync(path).mtimeMs).toBe(mtime);
    expect(logs).toContain("no changes");
  });

  it("dry run writes nothing", async () => {
    setup();
    expect(await run(options({ dryRun: true }))).toBe("dry-run");
    expect(readdirSync(dir).sort()).toEqual(["channels.json", "overrides.json"]);
  });
});

describe("youtube http client", () => {
  const KEY = "test-key-not-real";
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it("sends the key in the X-Goog-Api-Key header, never in the URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { items: [] }));
    await createHttpClient(KEY, { fetchImpl }).get("channels", { part: "id", forHandle: "x" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).not.toContain(KEY);
    expect(url).not.toMatch(/[?&]key=/);
    expect(init.headers["X-Goog-Api-Key"]).toBe(KEY);
    expect(() => buildUrl("videos", { key: "x" })).toThrow();
  });

  it("retries 5xx and 429 with backoff", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(503, {}))
      .mockResolvedValueOnce(json(429, {}))
      .mockResolvedValueOnce(json(200, { items: [1] }));
    const res = await createHttpClient(KEY, { fetchImpl, sleep }).get("videos", { id: "a" });
    expect(res).toEqual({ items: [1] });
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([500, 1000]);
  });

  it("throws QuotaError on 403 quotaExceeded without retrying", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(403, { error: { errors: [{ reason: "quotaExceeded" }] } }));
    await expect(createHttpClient(KEY, { fetchImpl, sleep: async () => {} }).get("videos", { id: "a" })).rejects.toBeInstanceOf(
      QuotaError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("error messages contain the URL and status but never the key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(400, { error: { message: "bad", errors: [{ reason: "badRequest" }] } }));
    const err = await createHttpClient(KEY, { fetchImpl }).get("videos", { id: "a" }).catch((e: Error) => e);
    expect(String(err)).toMatch(/400.*videos\?/);
    expect(String(err)).not.toContain(KEY);
  });
});

describe("hygiene", () => {
  it("no fixture contains an API key", () => {
    for (const f of readdirSync(FIXTURES)) {
      expect(readFileSync(join(FIXTURES, f), "utf8")).not.toMatch(KEY_RE);
    }
  });

  it("parses CLI flags", () => {
    expect(parseArgs(["--out", "x.json", "--dry-run"])).toEqual({
      out: "x.json",
      previous: "x.json",
      dryRun: true,
      fixture: "",
      allowDrop: false,
    });
    expect(parseArgs(["--previous", "p.json", "--allow-drop", "--fixture", "f"]).allowDrop).toBe(true);
    expect(() => parseArgs(["--bogus"])).toThrow();
    expect(() => parseArgs(["--out"])).toThrow();
  });
});
