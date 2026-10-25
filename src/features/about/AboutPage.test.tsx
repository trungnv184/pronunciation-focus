import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureIndex } from "../../test/fixtures/videoIndex";
import AboutPage from "./AboutPage";

vi.mock("../../data/loadIndex", () => ({
  useVideoIndex: () => ({ status: "ready", index: fixtureIndex, retry: () => {} }),
}));

afterEach(cleanup);

describe("AboutPage", () => {
  it("credits every channel and links the YouTube terms and Google privacy policy", () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    );
    for (const c of fixtureIndex.channels) {
      expect(screen.getByRole("link", { name: c.title })).toHaveAttribute("href", `https://www.youtube.com/${c.handle}`);
    }
    expect(screen.getByRole("link", { name: /YouTube Terms of Service/ })).toHaveAttribute("href", "https://www.youtube.com/t/terms");
    expect(screen.getByRole("link", { name: /Google Privacy Policy/ })).toHaveAttribute("href", "https://policies.google.com/privacy");
    expect(screen.getByText(/This site uses YouTube API Services/)).toBeInTheDocument();
    expect(screen.getByText(/never uploaded/)).toBeInTheDocument();
  });
});
