import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVideoIndex, type VideoIndexState } from "../../data/loadIndex";
import { fixtureIndex } from "../../test/fixtures/videoIndex";
import { markStarted, reloadProgress, setDone } from "../progress/store";
import { ONBOARDING_KEY } from "../onboarding/Onboarding";
import BrowsePage, { PAGE_SIZE } from "./BrowsePage";
import { VideoCard } from "./VideoCard";

vi.mock("../../data/loadIndex", () => ({ useVideoIndex: vi.fn() }));

// `globals: false`, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

const mockedUseVideoIndex = vi.mocked(useVideoIndex);
const retry = vi.fn();

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderPage(url = "/") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <BrowsePage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

const grid = () => screen.getByRole("list", { name: /Video list/ });
const cards = () => within(grid()).getAllByRole("link");
const search = () => new URLSearchParams(screen.getByTestId("location").textContent!.split("?")[1] ?? "");

describe("BrowsePage", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(ONBOARDING_KEY, "dismissed"); // onboarding has its own tests
    reloadProgress();
    mockedUseVideoIndex.mockReturnValue({ status: "ready", index: fixtureIndex, retry } as VideoIndexState);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows every video and the result count", () => {
    renderPage();
    expect(cards()).toHaveLength(fixtureIndex.videos.length);
    expect(screen.getByRole("status")).toHaveTextContent("Showing 12 of 12 videos");
  });

  it("narrows the grid when a tag chip is clicked and writes it to the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    const chip = screen.getByRole("button", { name: /TH sounds/ });
    expect(chip).toHaveAttribute("aria-pressed", "false");

    await user.click(chip);

    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(cards()).toHaveLength(2);
    expect(within(grid()).getByText("How to Pronounce TH — /θ/ and /ð/")).toBeInTheDocument();
    expect(search().get("tags")).toBe("th-sounds");

    await user.click(screen.getByRole("button", { name: /Minimal pairs/ }));
    expect(cards()).toHaveLength(1);
    expect(search().get("tags")).toBe("th-sounds,minimal-pairs");
  });

  it("reads filters from the URL", () => {
    renderPage("/?tags=th-sounds&dur=short");
    expect(cards()).toHaveLength(1);
    expect(screen.getByRole("button", { name: /TH sounds/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Short$/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("searches without diacritics", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/Search/), "am cuoi");
    expect(cards()).toHaveLength(2);
    expect(search().get("q")).toBe("am cuoi");
  });

  it("filters by channel, duration and hide Shorts", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("checkbox", { name: /Phát Âm Hay/ }));
    expect(cards()).toHaveLength(2);
    await user.click(screen.getByRole("checkbox", { name: /Phát Âm Hay/ }));
    await user.click(screen.getByRole("button", { name: /Long$/ }));
    expect(cards()).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: /Any$/ }));
    await user.click(screen.getByRole("checkbox", { name: /Hide Shorts/ }));
    expect(cards()).toHaveLength(8);
    expect(search().get("shorts")).toBe("hide");
  });

  it("sorts by shortest", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(screen.getByLabelText(/Sort/), "shortest");
    expect(within(cards()[0]).getByText("Nối âm trong tiếng Anh Mỹ")).toBeInTheDocument();
    expect(search().get("sort")).toBe("shortest");
  });

  it("clears all filters", async () => {
    const user = userEvent.setup();
    renderPage("/?tags=th-sounds&dur=short");
    const clear = screen.getByRole("button", { name: /Clear all/ });
    await user.click(clear);
    expect(cards()).toHaveLength(12);
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/);
  });

  it("shows an empty state that removes the most recently added filter", async () => {
    const user = userEvent.setup();
    renderPage("/?dur=short");
    await user.click(screen.getByRole("button", { name: /Word stress/ }));

    expect(screen.queryByRole("list", { name: /Video list/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /No matching videos/ })).toBeInTheDocument();
    const removeLast = screen.getByRole("button", { name: /Remove last filter: .*Word stress/ });

    await user.click(removeLast);
    expect(cards()).toHaveLength(4);
    expect(search().get("dur")).toBe("short");
    expect(search().get("tags")).toBeNull();
  });

  it("empty state with a single filter offers Clear all", async () => {
    const user = userEvent.setup();
    renderPage("/?tags=schwa");
    expect(screen.queryByRole("button", { name: /Remove last filter/ })).not.toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /Clear all/ });
    await user.click(buttons[buttons.length - 1]);
    expect(cards()).toHaveLength(12);
  });

  it("opens and closes the mobile filter sheet", async () => {
    const user = userEvent.setup();
    renderPage("/?tags=th-sounds");
    const toggle = screen.getByRole("button", { name: /Filters \(1\)/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Close/ })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("shows the done badge on cards the learner finished", () => {
    setDone("th000000001", true);
    renderPage();
    const doneCard = within(grid()).getByRole("link", { name: /How to Pronounce TH/ });
    expect(within(doneCard).getByText("Đã xong · Done")).toBeInTheDocument();
    expect(within(grid()).getAllByText("Đã xong · Done")).toHaveLength(1);
  });

  it("hides done videos with the Hide done toggle and writes done=hide", async () => {
    const user = userEvent.setup();
    setDone("th000000001", true);
    setDone("ed000000001", true);
    renderPage();
    const toggle = screen.getByRole("checkbox", { name: /Hide done/ });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);
    expect(cards()).toHaveLength(10);
    expect(search().get("done")).toBe("hide");
    expect(screen.queryByText("Đã xong · Done")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(cards()).toHaveLength(12);
    expect(search().get("done")).toBeNull();
  });

  it("reads done=hide from the URL and updates when progress changes", () => {
    setDone("th000000001", true);
    renderPage("/?done=hide");
    expect(screen.getByRole("checkbox", { name: /Hide done/ })).toBeChecked();
    expect(cards()).toHaveLength(11);
    act(() => setDone("th000000002", true));
    expect(cards()).toHaveLength(10);
  });

  it("shows a Continue row for started-but-not-done videos, most recent first", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
    markStarted("rl000000001");
    vi.setSystemTime(new Date("2026-10-21T10:00:00Z"));
    markStarted("in000000001");
    markStarted("th000000001");
    setDone("th000000001", true);
    vi.useRealTimers();

    renderPage();
    const row = screen.getByRole("list", { name: /Continue watching/ });
    const links = within(row).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/watch/in000000001", "/watch/rl000000001"]);
    expect(screen.getByRole("heading", { name: /Tiếp tục xem/ })).toBeInTheDocument();
    // the main grid is unaffected
    expect(cards()).toHaveLength(12);
  });

  it("has no Continue row without started videos", () => {
    renderPage();
    expect(screen.queryByRole("list", { name: /Continue watching/ })).not.toBeInTheDocument();
  });

  it("shows a loading skeleton", () => {
    mockedUseVideoIndex.mockReturnValue({ status: "loading", retry } as VideoIndexState);
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent(/Loading videos/);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows an error state with retry", async () => {
    const user = userEvent.setup();
    mockedUseVideoIndex.mockReturnValue({
      status: "error",
      error: new Error("HTTP 500"),
      retry,
    } as VideoIndexState);
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent(/Couldn’t load the videos/);
    await user.click(screen.getByRole("button", { name: /Retry/ }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("VideoCard", () => {
  const video = fixtureIndex.videos[1];

  it("links to the player with a lazy thumbnail and at most 3 tags", () => {
    const many = { ...video, tags: ["th-sounds", "minimal-pairs", "r-l", "schwa"] as typeof video.tags };
    render(
      <MemoryRouter>
        <VideoCard video={many} />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", `/watch/${video.id}`);
    const img = link.querySelector("img")!;
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("width", "320");
    expect(img).toHaveAttribute("height", "180");
    expect(within(link).getAllByRole("listitem")).toHaveLength(3);
    expect(link).toHaveTextContent("2:30");
    expect(screen.queryByText(/Đã xong/)).not.toBeInTheDocument();
  });

  it("shows the done badge when done", () => {
    render(
      <MemoryRouter>
        <VideoCard video={video} done />
      </MemoryRouter>,
    );
    expect(screen.getByText("Đã xong · Done")).toBeInTheDocument();
  });
});

describe("BrowsePage pagination", () => {
  beforeEach(() => localStorage.setItem(ONBOARDING_KEY, "dismissed"));

  it("renders PAGE_SIZE cards and reveals more on demand", async () => {
    const many = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => ({
      ...fixtureIndex.videos[0],
      id: `pg${String(i).padStart(9, "0")}`,
      title: `Video ${i}`,
    }));
    mockedUseVideoIndex.mockReturnValue({ status: "ready", index: { ...fixtureIndex, videos: many }, retry: () => {} });
    render(
      <MemoryRouter>
        <BrowsePage />
      </MemoryRouter>,
    );
    const grid = screen.getByRole("list", { name: /Video list/ });
    expect(grid.children).toHaveLength(PAGE_SIZE);
    await userEvent.click(screen.getByRole("button", { name: /Show more \(5\)/ }));
    expect(grid.children).toHaveLength(PAGE_SIZE + 5);
  });
});
