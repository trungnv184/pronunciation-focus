import "fake-indexeddb/auto";
import { clear, keys } from "idb-keyval";
import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_ATTEMPTS,
  countForVideo,
  deleteAllForVideo,
  deleteAttempt,
  listAttempts,
  recordingKey,
  saveAttempt,
  setRating,
  toBlob,
} from "./storage";

const seg = { start: 10, end: 15.5 };
const audio = (text = "voice") => ({
  data: new TextEncoder().encode(text).buffer as ArrayBuffer,
  mimeType: "audio/webm;codecs=opus",
});

beforeEach(async () => {
  await clear();
});

describe("recording keys", () => {
  it("uses rec:<videoId>:<start>-<end>:<timestamp>", () => {
    expect(recordingKey("abc_DEF-123", seg, 1700000000000)).toBe(
      "rec:abc_DEF-123:10-15.5:1700000000000",
    );
  });

  it("rounds float noise to 0.01 s", () => {
    expect(recordingKey("v", { start: 1.23456, end: 4.0000001 }, 1)).toBe("rec:v:1.23-4:1");
  });
});

describe("storage", () => {
  it("saves an attempt as an ArrayBuffer and lists it", async () => {
    const saved = await saveAttempt("vid1", seg, audio("hello"));
    const list = await listAttempts("vid1", seg);
    expect(list).toHaveLength(1);
    expect(list[0]!.key).toBe(saved.key);
    expect(list[0]!.mimeType).toBe("audio/webm;codecs=opus");
    expect(typeof list[0]!.createdAt).toBe("number");
    expect(list[0]!.data).not.toBeInstanceOf(Blob);
    expect(new TextDecoder().decode(list[0]!.data)).toBe("hello");

    const blob = toBlob(list[0]!);
    expect(blob.type).toBe("audio/webm;codecs=opus");
    expect(blob.size).toBe(5);
  });

  it(`keeps only the last ${MAX_ATTEMPTS} attempts per segment, newest first`, async () => {
    const saved = [];
    for (let i = 0; i < 4; i++) saved.push(await saveAttempt("vid1", seg, audio(`take${i}`)));
    const other = await saveAttempt("vid1", { start: 0, end: 2 }, audio("other"));

    const list = await listAttempts("vid1", seg);
    expect(list.map((a) => a.key)).toEqual([saved[3]!.key, saved[2]!.key, saved[1]!.key]);
    expect((await keys()).includes(saved[0]!.key)).toBe(false);
    expect((await listAttempts("vid1", { start: 0, end: 2 })).map((a) => a.key)).toEqual([
      other.key,
    ]);
    expect(await countForVideo("vid1")).toBe(4);
  });

  it("gives saves in the same millisecond distinct keys", async () => {
    const a = await saveAttempt("vid1", seg, audio(), 5);
    const b = await saveAttempt("vid1", seg, audio(), 5);
    expect(a.key).not.toBe(b.key);
    expect(await listAttempts("vid1", seg)).toHaveLength(2);
  });

  it("deletes one attempt", async () => {
    const a = await saveAttempt("vid1", seg, audio("a"));
    const b = await saveAttempt("vid1", seg, audio("b"));
    await deleteAttempt(a.key);
    expect((await listAttempts("vid1", seg)).map((x) => x.key)).toEqual([b.key]);
  });

  it("deletes all attempts for one video only", async () => {
    await saveAttempt("vid1", seg, audio());
    await saveAttempt("vid1", { start: 1, end: 3 }, audio());
    const keep = await saveAttempt("vid10", seg, audio()); // shares the "vid1" prefix
    await deleteAllForVideo("vid1");
    expect(await countForVideo("vid1")).toBe(0);
    expect((await listAttempts("vid10", seg)).map((x) => x.key)).toEqual([keep.key]);
  });

  it("sets and clears the self-rating", async () => {
    const a = await saveAttempt("vid1", seg, audio("rated"));
    await setRating(a.key, 3);
    let [stored] = await listAttempts("vid1", seg);
    expect(stored!.rating).toBe(3);
    expect(new TextDecoder().decode(stored!.data)).toBe("rated");

    await setRating(a.key, undefined);
    [stored] = await listAttempts("vid1", seg);
    expect(stored!.rating).toBeUndefined();
  });

  it("ignores a rating for a deleted attempt", async () => {
    const a = await saveAttempt("vid1", seg, audio());
    await deleteAttempt(a.key);
    await setRating(a.key, 2);
    expect(await keys()).toEqual([]);
  });
});
