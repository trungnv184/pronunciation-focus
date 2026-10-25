import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the site name", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText("Luyện phát âm · Pronunciation Focus")).toBeInTheDocument();
  });

  it("renders the not-found page for unknown routes", () => {
    render(
      <MemoryRouter initialEntries={["/nope"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /Page not found/ })).toBeInTheDocument();
  });
});
