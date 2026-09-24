import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SearchBar from "./SearchBar";

const axiosGet = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { get: axiosGet, isCancel: () => false } }));

beforeEach(() => {
  axiosGet.mockReset();
  axiosGet.mockResolvedValue({
    data: { results: [{ id: 949, title: "Heat", release_date: "1995-12-15", poster_path: "/heat.jpg", vote_average: 8.2 }] },
  });
});

describe("SearchBar (movie-only)", () => {
  test("still queries TMDB movie search and hands back a movie shape", async () => {
    const onMovieSelect = vi.fn();
    render(<SearchBar onMovieSelect={onMovieSelect} />);

    fireEvent.change(screen.getByPlaceholderText(/search for a movie/i), { target: { value: "heat" } });
    await waitFor(() => expect(axiosGet).toHaveBeenCalledTimes(1));
    expect(String(axiosGet.mock.calls[0][0])).toContain("https://api.themoviedb.org/3/search/movie");
    expect(String(axiosGet.mock.calls[0][0])).not.toContain("/search/tv");

    fireEvent.click(await screen.findByText("Heat (1995)"));
    expect(onMovieSelect).toHaveBeenCalledWith({
      id: 949,
      imdbID: "tmdb-949",
      title: "Heat",
      poster_path: "https://image.tmdb.org/t/p/w500/heat.jpg",
      vote_average: 8.2,
    });
  });
});
