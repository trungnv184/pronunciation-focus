import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Onboarding, { ONBOARDING_KEY } from "./Onboarding";

const renderIt = () =>
  render(
    <MemoryRouter>
      <Onboarding />
    </MemoryRouter>,
  );

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("Onboarding", () => {
  it("shows three steps and a start link to ending sounds", () => {
    renderIt();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /Start with ending sounds/ })).toHaveAttribute("href", "/?tags=final-consonants");
  });

  it("is remembered once dismissed", async () => {
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: /Skip/ }));
    expect(screen.queryByRole("heading", { name: /How it works/ })).not.toBeInTheDocument();
    expect(localStorage.getItem(ONBOARDING_KEY)).toBe("dismissed");
    cleanup();
    renderIt();
    expect(screen.queryByRole("heading", { name: /How it works/ })).not.toBeInTheDocument();
  });
});
