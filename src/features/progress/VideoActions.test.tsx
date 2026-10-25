import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VideoActions from "../player/VideoActions";
import { toLocalDate } from "./dates";
import { getProgress, reloadProgress, setDone } from "./store";

// `globals: false`, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  reloadProgress();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("VideoActions", () => {
  it("marks the video started and logs today's activity on mount", () => {
    render(<VideoActions videoId="th000000001" tags={["th-sounds"]} />);
    expect(getProgress().videos.th000000001.status).toBe("started");
    expect(getProgress().activity).toEqual([toLocalDate()]);
  });

  it("marks the new video started when videoId changes", () => {
    const { rerender } = render(<VideoActions videoId="th000000001" tags={[]} />);
    rerender(<VideoActions videoId="ed000000001" tags={[]} />);
    expect(Object.keys(getProgress().videos).sort()).toEqual(["ed000000001", "th000000001"]);
  });

  it("toggles done with aria-pressed", async () => {
    const user = userEvent.setup();
    render(<VideoActions videoId="th000000001" tags={["th-sounds"]} />);
    const toggle = screen.getByRole("button", { name: /Đánh dấu đã xong · Mark as done/ });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(getProgress().videos.th000000001.status).toBe("done");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(getProgress().videos.th000000001.status).toBe("started");
  });

  it("does not downgrade a video that is already done", () => {
    setDone("th000000001", true);
    render(<VideoActions videoId="th000000001" tags={[]} />);
    expect(getProgress().videos.th000000001.status).toBe("done");
    expect(screen.getByRole("button", { name: /Mark as done/ })).toHaveAttribute("aria-pressed", "true");
  });
});
