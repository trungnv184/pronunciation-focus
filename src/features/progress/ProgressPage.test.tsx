import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVideoIndex, type VideoIndexState } from "../../data/loadIndex";
import { fixtureIndex } from "../../test/fixtures/videoIndex";
import { toLocalDate } from "./dates";
import ProgressPage from "./ProgressPage";
import { STORAGE_KEY, exportJson, getProgress, logActivity, markStarted, reloadProgress, setDone } from "./store";

vi.mock("../../data/loadIndex", () => ({ useVideoIndex: vi.fn() }));

// `globals: false`, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

const mockedUseVideoIndex = vi.mocked(useVideoIndex);
const retry = vi.fn();

/** Local date `n` days before today. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalDate(d);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ProgressPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  reloadProgress();
  mockedUseVideoIndex.mockReturnValue({ status: "ready", index: fixtureIndex, retry } as VideoIndexState);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("ProgressPage", () => {
  it("renders the streak, per-tag bars, Continue list and suggestion", () => {
    setDone("th000000002", true);
    setDone("fc000000002", true);
    markStarted("ed000000001");
    // current run: today, yesterday, 2 days ago; best run: 5–8 days ago
    for (const n of [0, 1, 2, 5, 6, 7, 8]) logActivity(daysAgo(n));

    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: /Tiến độ · Progress/ })).toBeInTheDocument();

    const streak = screen.getByRole("region", { name: /Daily streak/ });
    expect(within(streak).getByText(/Current/).closest("div")).toHaveTextContent("3 ngày · days");
    expect(within(streak).getByText(/Best/).closest("div")).toHaveTextContent("4 ngày · days");

    const bar = screen.getByRole("progressbar", { name: /Minimal pairs/ });
    expect(bar).toHaveAttribute("value", "2");
    expect(bar).toHaveAttribute("max", "3");
    expect(screen.getByRole("progressbar", { name: /TH sounds/ })).toHaveAttribute("value", "1");
    // tags with no videos are not shown
    expect(screen.queryByRole("progressbar", { name: /Schwa/ })).not.toBeInTheDocument();

    const cont = screen.getByRole("region", { name: /Continue/ });
    const link = within(cont).getByRole("link", { name: "-ED Endings: /t/, /d/ or /ɪd/?" });
    expect(link).toHaveAttribute("href", "/watch/ed000000001");

    const suggest = screen.getByRole("region", { name: /Suggested next/ });
    expect(suggest).toHaveTextContent(/Nối âm & ngữ điệu/);
    expect(within(suggest).getByRole("link")).toHaveAttribute(
      "href",
      "/?tags=linking-connected-speech,intonation",
    );
  });

  it("shows empty states with no progress", () => {
    renderPage();
    expect(screen.getByRole("region", { name: /Daily streak/ })).toHaveTextContent(/0 ngày/);
    expect(screen.getByText(/Nothing in progress/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Suggested next/ })).toHaveTextContent(/Âm cuối/);
  });

  it("still shows the streak and data tools while the index loads", () => {
    mockedUseVideoIndex.mockReturnValue({ status: "loading", retry } as VideoIndexState);
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent(/Loading videos/);
    expect(screen.getByRole("button", { name: /Export JSON/ })).toBeInTheDocument();
  });

  it("updates live when progress changes", () => {
    renderPage();
    expect(screen.getByRole("progressbar", { name: /TH sounds/ })).toHaveAttribute("value", "0");
    act(() => setDone("th000000001", true));
    expect(screen.getByRole("progressbar", { name: /TH sounds/ })).toHaveAttribute("value", "1");
  });

  it("resets only after confirming", async () => {
    const user = userEvent.setup();
    setDone("th000000001", true);
    renderPage();

    await user.click(screen.getByRole("button", { name: /Reset progress/ }));
    await user.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(getProgress().videos.th000000001).toBeDefined();

    await user.click(screen.getByRole("button", { name: /Reset progress/ }));
    await user.click(screen.getByRole("button", { name: /Yes, reset/ }));
    expect(getProgress().videos).toEqual({});
    expect(screen.getByRole("status")).toHaveTextContent(/Progress reset/);
  });

  it("imports a valid file and shows an error for an invalid one", async () => {
    const user = userEvent.setup();
    setDone("th000000001", true);
    logActivity("2026-10-01");
    const json = exportJson();
    localStorage.removeItem(STORAGE_KEY);
    reloadProgress();
    renderPage();

    const input = screen.getByLabelText(/Import JSON/);
    await user.upload(input, new File([json], "progress.json", { type: "application/json" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/Imported 1 videos, 1 days/);
    expect(getProgress().videos.th000000001.status).toBe("done");

    await user.upload(input, new File(["{nope"], "bad.json", { type: "application/json" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not valid JSON/);
    expect(getProgress().videos.th000000001.status).toBe("done");
  });

  it("exports a JSON download", async () => {
    const user = userEvent.setup();
    setDone("th000000001", true);
    let blob: Blob | undefined;
    const create = vi.fn((b: Blob) => {
      blob = b;
      return "blob:progress";
    });
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toMatch(/^pronunciation-focus-progress-\d{4}-\d{2}-\d{2}\.json$/);
      expect(this.href).toBe("blob:progress");
    });

    renderPage();
    await user.click(screen.getByRole("button", { name: /Export JSON/ }));

    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:progress");
    const text = await blob!.text();
    expect(JSON.parse(text)).toMatchObject({ version: 1, videos: { th000000001: { status: "done" } } });
  });
});
