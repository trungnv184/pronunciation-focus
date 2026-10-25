import { describe, expect, it } from "vitest";
import {
  clampTime,
  nudge,
  nudgePoint,
  orderPoints,
  roundTime,
  setPoint,
  shouldLoop,
  toSegment,
} from "./loop";
import { formatRate, orderRates, stepRate } from "./rates";

describe("shouldLoop", () => {
  it("loops once the time reaches or passes B", () => {
    expect(shouldLoop(15, 10, 15)).toBe(true);
    expect(shouldLoop(15.2, 10, 15)).toBe(true);
  });

  it("does not loop before B", () => {
    expect(shouldLoop(12, 10, 15)).toBe(false);
    expect(shouldLoop(3, 10, 15)).toBe(false);
  });

  it("does not loop when A or B is missing", () => {
    expect(shouldLoop(20, null, 15)).toBe(false);
    expect(shouldLoop(20, 10, null)).toBe(false);
    expect(shouldLoop(20, null, null)).toBe(false);
  });

  it("does not loop an empty or reversed segment", () => {
    expect(shouldLoop(20, 15, 15)).toBe(false);
    expect(shouldLoop(20, 15, 10)).toBe(false);
  });
});

describe("clampTime / nudge / roundTime", () => {
  it("clamps to 0 and to the duration", () => {
    expect(clampTime(-3)).toBe(0);
    expect(clampTime(50, 40)).toBe(40);
    expect(clampTime(20, 40)).toBe(20);
    expect(clampTime(500)).toBe(500);
    expect(clampTime(500, 0)).toBe(500);
    expect(clampTime(Number.NaN)).toBe(0);
  });

  it("nudges within bounds", () => {
    expect(nudge(10, 1)).toBe(11);
    expect(nudge(0.4, -1)).toBe(0);
    expect(nudge(39.5, 1, 40)).toBe(40);
  });

  it("rounds to tenths", () => {
    expect(roundTime(12.345)).toBe(12.3);
    expect(roundTime(12.36)).toBe(12.4);
  });
});

describe("A/B points", () => {
  const empty = { a: null, b: null };

  it("sets A and B independently", () => {
    const withA = setPoint(empty, "a", 10.04);
    expect(withA).toEqual({ a: 10, b: null });
    expect(setPoint(withA, "b", 15)).toEqual({ a: 10, b: 15 });
  });

  it("swaps reversed points so A < B", () => {
    expect(orderPoints({ a: 20, b: 5 })).toEqual({ a: 5, b: 20 });
    expect(setPoint({ a: 20, b: null }, "b", 5)).toEqual({ a: 5, b: 20 });
    expect(orderPoints({ a: 5, b: null })).toEqual({ a: 5, b: null });
  });

  it("clamps captured points to the video", () => {
    expect(setPoint(empty, "b", 99, 60)).toEqual({ a: null, b: 60 });
  });

  it("nudges a point and keeps the order", () => {
    expect(nudgePoint({ a: 10, b: 15 }, "a", 1)).toEqual({ a: 11, b: 15 });
    expect(nudgePoint({ a: 10, b: 15 }, "b", -1)).toEqual({ a: 10, b: 14 });
    expect(nudgePoint({ a: 10, b: 10.5 }, "a", 1)).toEqual({ a: 10.5, b: 11 });
    expect(nudgePoint({ a: 0.5, b: 3 }, "a", -1)).toEqual({ a: 0, b: 3 });
    expect(nudgePoint(empty, "a", 1)).toBe(empty);
  });

  it("only forms a segment when A < B", () => {
    expect(toSegment({ a: 10, b: 15 })).toEqual({ start: 10, end: 15 });
    expect(toSegment({ a: 10, b: null })).toBeNull();
    expect(toSegment({ a: 10, b: 10 })).toBeNull();
  });
});

describe("rates", () => {
  const yt = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  it("puts 0.5 / 0.75 / 1 first, then the rest ascending", () => {
    expect(orderRates(yt)).toEqual([0.5, 0.75, 1, 0.25, 1.25, 1.5, 1.75, 2]);
  });

  it("only shows rates the player offers", () => {
    expect(orderRates([1, 2, 0.5])).toEqual([0.5, 1, 2]);
    expect(orderRates([1])).toEqual([1]);
    expect(orderRates([])).toEqual([]);
  });

  it("steps slower and faster through available rates", () => {
    expect(stepRate(yt, 1, -1)).toBe(0.75);
    expect(stepRate(yt, 1, 1)).toBe(1.25);
    expect(stepRate(yt, 0.25, -1)).toBe(0.25);
    expect(stepRate(yt, 2, 1)).toBe(2);
    expect(stepRate([], 1, 1)).toBe(1);
  });

  it("formats a rate", () => {
    expect(formatRate(0.75)).toBe("0.75×");
  });
});
