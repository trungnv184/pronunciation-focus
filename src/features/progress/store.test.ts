import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STORAGE_KEY,
  exportJson,
  getProgress,
  importJson,
  logActivity,
  markStarted,
  migrate,
  parseStored,
  reloadProgress,
  reset,
  setDone,
  useProgress,
} from "./store";

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!);

beforeEach(() => {
  localStorage.clear();
  reloadProgress();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("parsing and migration", () => {
  it("starts empty when nothing is stored", () => {
    expect(getProgress()).toEqual({ videos: {}, activity: [] });
  });

  it("resets corrupted JSON to empty without throwing", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(() => reloadProgress()).not.toThrow();
    expect(getProgress()).toEqual({ videos: {}, activity: [] });
    // and keeps working afterwards
    markStarted("abc");
    expect(stored().videos.abc.status).toBe("started");
  });

  it("resets wrong top-level shapes to empty", () => {
    for (const text of ["null", "42", '"x"', "[]", '{"version":99,"videos":{}}', '{"foo":1}']) {
      expect(parseStored(text)).toEqual({ videos: {}, activity: [] });
    }
  });

  it("drops invalid entries but keeps valid ones", () => {
    const state = migrate({
      version: 1,
      videos: {
        good: { status: "done", updatedAt: "2026-10-01T00:00:00.000Z" },
        badStatus: { status: "watching", updatedAt: "2026-10-01T00:00:00.000Z" },
        noDate: { status: "started" },
        "bad id!": { status: "done", updatedAt: "2026-10-01T00:00:00.000Z" },
        notObject: "done",
      },
      activity: ["2026-10-02", "2026-10-01", "2026-10-01", "2026-02-30", "yesterday", 5],
    });
    expect(Object.keys(state.videos).sort()).toEqual(["good", "noDate"]);
    expect(state.videos.noDate.updatedAt).toBe(new Date(0).toISOString());
    expect(state.activity).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("accepts the unversioned v1 shape", () => {
    const state = migrate({ videos: { a: { status: "started", updatedAt: "2026-10-01T00:00:00Z" } }, activity: [] });
    expect(state.videos.a.status).toBe("started");
  });

  it("migrates the legacy { done, started, days } shape", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ done: ["a", "b"], started: ["b", "c"], days: ["2026-10-01"] }));
    reloadProgress();
    const state = getProgress();
    expect(state.videos.a.status).toBe("done");
    expect(state.videos.b.status).toBe("done"); // done wins over started
    expect(state.videos.c.status).toBe("started");
    expect(state.activity).toEqual(["2026-10-01"]);
  });
});

describe("actions", () => {
  it("writes a versioned payload under pf:progress:v1", () => {
    markStarted("abc");
    expect(stored()).toMatchObject({ version: 1, videos: { abc: { status: "started" } }, activity: [] });
  });

  it("markStarted never downgrades a done video", () => {
    setDone("abc", true);
    const before = getProgress().videos.abc;
    markStarted("abc");
    expect(getProgress().videos.abc).toBe(before);
    expect(stored().videos.abc.status).toBe("done");
  });

  it("setDone toggles between done and started", () => {
    setDone("abc", true);
    expect(getProgress().videos.abc.status).toBe("done");
    setDone("abc", false);
    expect(getProgress().videos.abc.status).toBe("started");
  });

  it("setDone(false) on an unknown video is a no-op", () => {
    setDone("zzz", false);
    expect(getProgress().videos).toEqual({});
  });

  it("logs unique, sorted local dates and ignores invalid ones", () => {
    logActivity("2026-10-02");
    logActivity("2026-10-01");
    logActivity("2026-10-02");
    logActivity("not-a-date");
    expect(getProgress().activity).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("logs today's local date by default", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 31, 23, 59));
    logActivity();
    vi.useRealTimers();
    expect(getProgress().activity).toEqual(["2026-01-31"]);
  });

  it("reset clears everything", () => {
    markStarted("abc");
    logActivity("2026-10-01");
    reset();
    expect(getProgress()).toEqual({ videos: {}, activity: [] });
    expect(stored()).toEqual({ version: 1, videos: {}, activity: [] });
  });
});

describe("export / import", () => {
  it("round-trips through exportJson and importJson", () => {
    markStarted("a");
    setDone("b", true);
    logActivity("2026-10-01");
    const json = exportJson();
    const snapshot = getProgress();
    reset();
    expect(importJson(json)).toEqual({ ok: true, videos: 2, days: 1 });
    expect(getProgress()).toEqual(snapshot);
  });

  it("rejects invalid JSON and unknown shapes without changing anything", () => {
    markStarted("a");
    const before = getProgress();
    const bad = importJson("{oops");
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error).toMatch(/not valid JSON/);
    const wrong = importJson('{"hello":"world"}');
    expect(!wrong.ok && wrong.error).toMatch(/not a progress export/);
    expect(importJson('{"version":2,"videos":{}}').ok).toBe(false);
    expect(importJson("[]").ok).toBe(false);
    expect(getProgress()).toBe(before);
  });
});

describe("storage unavailable (private mode)", () => {
  it("falls back to memory when getItem and setItem throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(() => reloadProgress()).not.toThrow();
    expect(() => markStarted("abc")).not.toThrow();
    expect(() => setDone("def", true)).not.toThrow();
    expect(() => logActivity("2026-10-01")).not.toThrow();
    expect(getProgress().videos.abc.status).toBe("started");
    expect(getProgress().videos.def.status).toBe("done");
    expect(getProgress().activity).toEqual(["2026-10-01"]);
  });

  it("survives the localStorage getter itself throwing", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(() => reloadProgress()).not.toThrow();
    markStarted("abc");
    expect(getProgress().videos.abc.status).toBe("started");
  });
});

describe("useProgress", () => {
  it("re-renders on local writes", () => {
    const { result } = renderHook(() => useProgress());
    expect(result.current.videos).toEqual({});
    act(() => markStarted("abc"));
    expect(result.current.videos.abc.status).toBe("started");
  });

  it("syncs when another tab writes (storage event)", () => {
    const { result } = renderHook(() => useProgress());
    const other = JSON.stringify({
      version: 1,
      videos: { xyz: { status: "done", updatedAt: "2026-10-01T00:00:00Z" } },
      activity: ["2026-10-01"],
    });
    act(() => {
      localStorage.setItem(STORAGE_KEY, other);
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: other }));
    });
    expect(result.current.videos.xyz.status).toBe("done");
    expect(result.current.activity).toEqual(["2026-10-01"]);
  });

  it("ignores storage events for other keys and handles clear()", () => {
    markStarted("abc");
    const { result } = renderHook(() => useProgress());
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "something-else", newValue: "x" }));
    });
    expect(result.current.videos.abc).toBeDefined();
    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(result.current.videos).toEqual({});
  });
});
