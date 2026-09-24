import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { normalizeMediaSearchPage, TmdbError } from "../api/tmdb";
import HistoryMediaSearch from "./HistoryMediaSearch";

const multiPayload = {
  page: 1,
  total_pages: 1,
  total_results: 4,
  results: [
    { media_type: "tv", id: 199925, name: "Special Ops: Lioness", first_air_date: "2023-07-23", poster_path: "/lioness.jpg", overview: "Joe…", vote_average: 7.9, popularity: 90, origin_country: ["US"] },
    { media_type: "person", id: 1, name: "Lioness Actor", known_for: [] },
    { media_type: "movie", id: 55555, title: "Lioness", release_date: "2008-05-01", poster_path: null, overview: null, vote_average: 5.1, popularity: 3 },
    { media_type: "movie", id: 77777, title: "Untitled", release_date: "", genre_ids: [] },
    { media_type: "movie", title: "No id" },
  ],
};

describe("searchMedia normalization", () => {
  test("keeps movies and tv, drops people and malformed rows, and badges the kind", () => {
    const page = normalizeMediaSearchPage(multiPayload);
    expect(page.results.map((result) => `${result.kind}:${result.tmdbId}`)).toEqual(["tv:199925", "movie:55555", "movie:77777"]);
    expect(page.results[0]).toMatchObject({ kind: "tv", title: "Special Ops: Lioness", year: 2023, date: "2023-07-23", posterPath: "/lioness.jpg", originCountry: ["US"] });
    expect(page.results[1]).toMatchObject({ kind: "movie", title: "Lioness", year: 2008, posterPath: null, overview: null });
    expect(page.results[2]).toMatchObject({ kind: "movie", year: null, date: null });
    expect(normalizeMediaSearchPage(null).results).toEqual([]);
  });

});

const tmdb = vi.hoisted(() => ({ searchMedia: vi.fn() }));
vi.mock("../api/tmdb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/tmdb")>();
  return { ...actual, searchMedia: tmdb.searchMedia };
});

describe("HistoryMediaSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    tmdb.searchMedia.mockReset();
    tmdb.searchMedia.mockImplementation(async () => normalizeMediaSearchPage(multiPayload));
  });
  afterEach(() => vi.useRealTimers());

  const type = (text: string) => fireEvent.change(screen.getByTestId("history-media-search-input"), { target: { value: text } });

  test("searches after the minimum length with debounce and shows badged movie + TV rows", async () => {
    const onSelect = vi.fn();
    render(<HistoryMediaSearch onSelect={onSelect} />);
    expect(screen.getByLabelText(/search movies and tv series/i)).toBeInTheDocument();
    type("l");
    vi.advanceTimersByTime(400);
    expect(tmdb.searchMedia).not.toHaveBeenCalled();

    type("lioness");
    vi.advanceTimersByTime(350);
    const rows = await screen.findAllByTestId("history-media-result");
    expect(tmdb.searchMedia).toHaveBeenCalledTimes(1);
    expect(tmdb.searchMedia).toHaveBeenCalledWith("lioness", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAttribute("data-kind", "tv");
    expect(rows[0]).toHaveAccessibleName("TV series: Special Ops: Lioness (2023)");
    expect(rows[1]).toHaveAccessibleName("Movie: Lioness (2008)");
    expect(rows[2]).toHaveAccessibleName("Movie: Untitled");
    expect(within(rows[0]).getByText("TV")).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("Special Ops: Lioness");
    expect(rows[0]).toHaveTextContent("2023 · US");
    expect(rows[1]).toHaveAttribute("data-kind", "movie");
    expect(within(rows[1]).getByText("Movie")).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("2008");
    expect(rows[2]).toHaveTextContent("Year unknown");
    expect(screen.queryByText(/Lioness Actor/)).not.toBeInTheDocument();

    fireEvent.click(rows[0]);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ kind: "tv", tmdbId: 199925 }));
    fireEvent.click(rows[1]);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ kind: "movie", tmdbId: 55555 }));
  });

  test("shows an error with retry, an empty state, and stays quiet on aborts", async () => {
    tmdb.searchMedia.mockRejectedValueOnce(new Error("boom"));
    render(<HistoryMediaSearch onSelect={vi.fn()} />);
    type("lioness");
    vi.advanceTimersByTime(350);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/search failed/i);

    tmdb.searchMedia.mockResolvedValueOnce({ page: 1, totalPages: 0, totalResults: 0, results: [] });
    fireEvent.click(within(alert).getByRole("button", { name: /try again/i }));
    vi.advanceTimersByTime(350);
    await waitFor(() => expect(screen.getByText(/no movies or series found/i)).toBeInTheDocument());

    tmdb.searchMedia.mockRejectedValueOnce(new TmdbError("aborted", "aborted"));
    type("lioness 2");
    vi.advanceTimersByTime(350);
    await waitFor(() => expect(tmdb.searchMedia).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
