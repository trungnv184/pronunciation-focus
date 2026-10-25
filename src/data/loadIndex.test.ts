import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureIndex } from "../test/fixtures/videoIndex";
import { INDEX_URL, resetIndexCache, useVideoIndex } from "./loadIndex";

function mockFetch(...responses: Array<() => Promise<Response>>) {
  const fn = vi.fn();
  for (const r of responses) fn.mockImplementationOnce(r);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const ok = () => Promise.resolve(new Response(JSON.stringify(fixtureIndex), { status: 200 }));
const notFound = () => Promise.resolve(new Response("nope", { status: 404 }));

afterEach(() => {
  vi.unstubAllGlobals();
  resetIndexCache();
});

describe("useVideoIndex", () => {
  it("loads the index from a relative URL and parses it", async () => {
    const fetchMock = mockFetch(ok);
    const { result } = renderHook(() => useVideoIndex());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.index?.videos).toHaveLength(fixtureIndex.videos.length);
    expect(fetchMock).toHaveBeenCalledWith(INDEX_URL);
    expect(INDEX_URL.startsWith("./")).toBe(true);
  });

  it("reports errors and recovers on retry", async () => {
    mockFetch(notFound, ok);
    const { result } = renderHook(() => useVideoIndex());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.message).toMatch(/404/);
    result.current.retry();
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("rejects data that does not match the schema", async () => {
    mockFetch(() => Promise.resolve(new Response(JSON.stringify({ videos: [] }), { status: 200 })));
    const { result } = renderHook(() => useVideoIndex());
    await waitFor(() => expect(result.current.status).toBe("error"));
  });
});
