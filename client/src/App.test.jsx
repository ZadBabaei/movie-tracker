import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test } from "vitest";
import Login from "./pages/Login";

describe("authentication entry page", () => {
  test("renders the sign-in experience and brand logo", () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /movie tracker/i })).toBeInTheDocument();
  });
});
