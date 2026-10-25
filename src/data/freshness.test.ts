import { describe, expect, it } from "vitest";
import { staleDataError } from "./freshness";

const now = new Date("2026-10-31T00:00:00Z");

describe("staleDataError", () => {
  it("accepts API data up to 30 days old", () => {
    expect(staleDataError({ source: "youtube-api", generatedAt: "2026-10-01T00:00:00Z" }, now)).toBeNull();
  });

  it("rejects API data older than 30 days", () => {
    expect(staleDataError({ source: "youtube-api", generatedAt: "2026-09-29T00:00:00Z" }, now)).toMatch(/32 days old/);
  });

  it("never flags seed data", () => {
    expect(staleDataError({ source: "seed", generatedAt: "2020-01-01T00:00:00Z" }, now)).toBeNull();
  });
});
