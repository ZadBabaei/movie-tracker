import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { TmdbError, TvSeriesDetails } from "../api/tmdb";
import type { HistoryEntry } from "../store/useWatchHistoryStore";
import { useWatchHistoryStore } from "../store/useWatchHistoryStore";
import TvSeriesHistory from "./TvSeriesHistory";

const historyApi = vi.hoisted(() => ({
  fetchSeriesHistory: vi.fn(),
  fetchPersonalHistory: vi.fn(),
  fetchGroupHistory: vi.fn(),
  updateHistoryEntry: vi.fn(),
  deleteHistoryEntry: vi.fn(),
  rateHistoryEntry: vi.fn(),
}));
const tmdb = vi.hoisted(() => ({ getTvSeries: vi.fn(), fetchMock: vi.fn() }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warn: vi.fn() }));

vi.mock("react-toastify", () => ({ toast: toastMock }));
vi.mock("../api/historyApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/historyApi")>();
  return { ...actual, ...historyApi };
});
vi.mock("../api/tmdb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/tmdb")>();
  return { ...actual, getTvSeries: tmdb.getTvSeries };
});
vi.mock("../store/useGroupStore", () => ({
  useGroupStore: () => ({ groupList: [{ _id: "6aaea452ff0f6834ac031999", name: "Movie Club", slug: "movie-club" }], fetchGroups: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock("../component/VerticalNavbar", () => ({ default: () => null }));

const member = { _id: "u1", name: "Zad", avatar: "" };
const GROUP_ID = "6aaea452ff0f6834ac031999";

const occurrence = (id: string, overrides: Partial<HistoryEntry> = {}, tvOverrides: Partial<NonNullable<HistoryEntry["tv"]>> = {}): HistoryEntry => ({
  _id: id,
  mediaType: "tv_episode",
  scope: "personal",
  group: null,
  createdBy: member,
  movie: null,
  tv: {
    seriesTmdbId: 199925,
    seasonNumber: 1,
    episodeNumber: 3,
    episodeTmdbId: 4321003,
    seriesTitle: "Special Ops: Lioness",
    episodeTitle: "Bruise Like a Fist",
    posterPath: "/lioness.jpg",
    backdropPath: "/lioness-bd.jpg",
    stillPath: "/e3.jpg",
    airDate: "2023-08-06",
    ...tvOverrides,
  },
  participants: [member],
  watchedAt: "2024-05-10T00:00:00.000Z",
  watchedLocation: "",
  watchedNotes: "",
  averageRating: null,
  ratingCount: 0,
  currentUserRating: null,
  ratings: [],
  ...overrides,
});

// Three occurrences: S01E02 on May 10, S01E03 on May 10, S01E03 again on May 20.
const e02 = occurrence("h-e02", {}, { episodeNumber: 2, episodeTitle: "The Beating" });
const e03First = occurrence("h-e03-a", { watchedNotes: "Cruz carries this one.", currentUserRating: 8, averageRating: 8, ratingCount: 1 });
const e03Again = occurrence("h-e03-b", { watchedAt: "2024-05-20T00:00:00.000Z", watchedLocation: "Train" });
const items = [e03Again, e03First, e02];

const seriesDetails: TvSeriesDetails = {
  seriesTmdbId: 199925,
  seriesTitle: "Special Ops: Lioness",
  originalTitle: null,
  tagline: "Trust no one.",
  overview: "Joe attempts to balance her personal and professional life.",
  posterPath: "/lioness-poster.jpg",
  backdropPath: "/lioness-backdrop.jpg",
  firstAirDate: "2023-07-23",
  lastAirDate: "2024-09-08",
  status: "Returning Series",
  type: "Scripted",
  inProduction: true,
  genres: [{ id: 18, name: "Drama" }, { id: 10759, name: "Action & Adventure" }],
  numberOfSeasons: 2,
  numberOfEpisodes: 16,
  episodeRunTime: 47,
  voteAverage: 7.94,
  voteCount: 512,
  popularity: 90,
  originalLanguage: "en",
  originCountry: ["US"],
  networks: [],
  createdBy: [],
  seasons: [],
  lastEpisodeToAir: null,
  nextEpisodeToAir: null,
  cast: Array.from({ length: 14 }, (_, index) => ({ personTmdbId: 100 + index, name: `Actor ${index + 1}`, character: `Role ${index + 1}`, profilePath: index === 0 ? "/zoe.jpg" : null, order: index })),
  externalIds: { imdbId: null, tvdbId: null, facebookId: null, instagramId: null, twitterId: null } as any,
  images: { posters: [], backdrops: [] },
};

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/history/tv/:seriesTmdbId" element={<TvSeriesHistory />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  vi.stubGlobal("fetch", tmdb.fetchMock);
  tmdb.fetchMock.mockReset();
  // The /history bucket is deliberately empty: the page must not need it.
  useWatchHistoryStore.setState({ personal: { items: [], total: 0, nextCursor: null }, byGroup: {}, loading: {}, errors: {} });
  Object.values(historyApi).forEach((mock) => mock.mockReset());
  historyApi.fetchSeriesHistory.mockResolvedValue({ seriesTmdbId: 199925, scope: "personal", groupId: null, items, stats: {} });
  historyApi.deleteHistoryEntry.mockResolvedValue({});
  tmdb.getTvSeries.mockReset();
  tmdb.getTvSeries.mockResolvedValue(seriesDetails);
  Object.values(toastMock).forEach((mock) => mock.mockReset());
});

describe("TvSeriesHistory route", () => {
  test("renders the hero from normalized TMDB metadata and the cast without extra requests", async () => {
    renderAt("/history/tv/199925?scope=personal");
    expect(await screen.findByRole("heading", { level: 1, name: "Special Ops: Lioness" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(tmdb.getTvSeries).toHaveBeenCalledTimes(1);
    expect(tmdb.getTvSeries).toHaveBeenCalledWith(199925, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(tmdb.fetchMock).not.toHaveBeenCalled();

    expect(screen.getByText("Trust no one.")).toBeInTheDocument();
    expect(screen.getByText(/Joe attempts/)).toBeInTheDocument();
    const facts = screen.getByRole("list", { name: "Series facts" });
    expect(facts).toHaveTextContent("2023");
    expect(facts).toHaveTextContent("Returning Series");
    expect(facts).toHaveTextContent("2 seasons");
    expect(facts).toHaveTextContent("16 episodes");
    expect(facts).toHaveTextContent("~47 min");
    expect(screen.getByRole("list", { name: "Genres" })).toHaveTextContent("Drama");
    expect(screen.getByText("7.9")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Special Ops: Lioness poster" })).toHaveAttribute("src", "https://image.tmdb.org/t/p/w500/lioness-poster.jpg");
    expect(screen.getByRole("link", { name: /watch history/i })).toHaveAttribute("href", "/history");
    expect(screen.getByText("TV")).toHaveClass("series-tv-badge");

    const cast = screen.getByTestId("series-cast");
    expect(within(cast).getAllByRole("listitem")).toHaveLength(12);
    expect(within(cast).getByRole("img", { name: "Actor 1" })).toHaveAttribute("src", "https://image.tmdb.org/t/p/w185/zoe.jpg");
    expect(within(cast).getByText("Role 2")).toBeInTheDocument();
    fireEvent.click(within(cast).getByRole("button", { name: /show all 14/i }));
    expect(within(cast).getAllByRole("listitem")).toHaveLength(14);
  });

  test("fetches the complete series history for the route scope and renders one card per occurrence, rewatches included", async () => {
    renderAt("/history/tv/199925?scope=personal");
    const cards = await screen.findAllByTestId("series-occurrence");
    expect(historyApi.fetchSeriesHistory).toHaveBeenCalledWith(199925, { scope: "personal", groupId: undefined });
    expect(historyApi.fetchPersonalHistory).not.toHaveBeenCalled();
    expect(useWatchHistoryStore.getState().personal.items).toHaveLength(0);

    expect(cards).toHaveLength(3);
    expect(cards.map((card) => card.getAttribute("data-entry-id"))).toEqual(["h-e03-b", "h-e03-a", "h-e02"]);
    expect(cards[0]).toHaveAccessibleName("S01E03 Bruise Like a Fist, watched May 20, 2024. Open details");
    expect(cards[0]).toHaveTextContent("Train");
    expect(cards[1]).toHaveAccessibleName("S01E03 Bruise Like a Fist, watched May 10, 2024, rated 8 out of 10. Open details");
    expect(cards[1]).toHaveTextContent("8/10");
    expect(cards[1]).toHaveTextContent("Notes");
    expect(cards[1]).toHaveTextContent("Aired Aug 6, 2023");
    expect(cards[2]).toHaveTextContent("S01E02");
    expect(cards[2]).toHaveTextContent("The Beating");
    expect(within(cards[1]).getByRole("presentation", { hidden: true })).toHaveAttribute("src", "https://image.tmdb.org/t/p/w300/e3.jpg");

    const stats = screen.getByTestId("series-stats");
    expect(within(stats).getByText("Watch occurrences").nextElementSibling).toHaveTextContent("3");
    expect(within(stats).getByText("Unique episodes").nextElementSibling).toHaveTextContent("2");
    expect(within(stats).getByText("Seasons watched").nextElementSibling).toHaveTextContent("1");
    expect(within(stats).getByText("First watched").nextElementSibling).toHaveTextContent("May 2024");
    expect(within(stats).getByText("Latest watched").nextElementSibling).toHaveTextContent("May 2024");
    expect(screen.getByText("3 watch occurrences · each one can be edited on its own")).toBeInTheDocument();
  });

  test("group scope requests that group's history and labels the page with the group", async () => {
    historyApi.fetchSeriesHistory.mockResolvedValue({ seriesTmdbId: 199925, scope: "group", groupId: GROUP_ID, items: [{ ...e02, scope: "group", group: { _id: GROUP_ID, name: "Movie Club" } }], stats: {} });
    renderAt(`/history/tv/199925?scope=group&groupId=${GROUP_ID}`);
    const cards = await screen.findAllByTestId("series-occurrence");
    expect(historyApi.fetchSeriesHistory).toHaveBeenCalledWith(199925, { scope: "group", groupId: GROUP_ID });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("Movie Club");
    expect(screen.getByRole("heading", { level: 2, name: "Movie Club and this series" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /movie club history/i })).toHaveAttribute("href", "/history?group=movie-club");
  });

  test("an occurrence opens the detail for exactly that _id; deleting one rewatch leaves the other", async () => {
    renderAt("/history/tv/199925?scope=personal");
    const cards = await screen.findAllByTestId("series-occurrence");
    fireEvent.click(cards[1]); // h-e03-a
    const dialog = await screen.findByRole("dialog", { name: /watch history details/i });
    expect(screen.getByTestId("entry-detail")).toHaveAttribute("data-entry-id", "h-e03-a");
    expect(within(dialog).getByText("Cruz carries this one.")).toBeInTheDocument();
    expect(within(dialog).getByText("S01E03 · Bruise Like a Fist")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: /delete entry/i }));
    await waitFor(() => expect(historyApi.deleteHistoryEntry).toHaveBeenCalledWith("h-e03-a"));
    expect(historyApi.deleteHistoryEntry).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(screen.getAllByTestId("series-occurrence")).toHaveLength(2));
    expect(screen.getAllByTestId("series-occurrence").map((card) => card.getAttribute("data-entry-id"))).toEqual(["h-e03-b", "h-e02"]);
    expect(within(screen.getByTestId("series-stats")).getByText("Watch occurrences").nextElementSibling).toHaveTextContent("2");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("editing and rating one rewatch targets only that _id and re-sorts the timeline", async () => {
    historyApi.updateHistoryEntry.mockResolvedValue({ ...e03Again, watchedAt: "2024-05-01T00:00:00.000Z", watchedLocation: "Plane" });
    historyApi.rateHistoryEntry.mockResolvedValue({ ...e03Again, watchedAt: "2024-05-01T00:00:00.000Z", watchedLocation: "Plane", currentUserRating: 6, averageRating: 6, ratingCount: 1 });
    renderAt("/history/tv/199925?scope=personal");
    const cards = await screen.findAllByTestId("series-occurrence");
    fireEvent.click(cards[0]); // h-e03-b
    const dialog = await screen.findByRole("dialog", { name: /watch history details/i });

    fireEvent.click(within(dialog).getByRole("button", { name: /edit details/i }));
    fireEvent.change(within(dialog).getByLabelText(/watched date/i), { target: { value: "2024-05-01" } });
    fireEvent.change(within(dialog).getByLabelText(/location/i), { target: { value: "Plane" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(historyApi.updateHistoryEntry).toHaveBeenCalledWith("h-e03-b", { watchedAt: "2024-05-01", watchedLocation: "Plane", watchedNotes: "" }));
    expect(historyApi.updateHistoryEntry).toHaveBeenCalledTimes(1);

    fireEvent.change(await within(dialog).findByLabelText(/your rating/i), { target: { value: "6" } });
    await waitFor(() => expect(historyApi.rateHistoryEntry).toHaveBeenCalledWith("h-e03-b", 6));

    fireEvent.click(within(dialog).getByRole("button", { name: /close dialog/i }));
    await waitFor(() => expect(screen.getAllByTestId("series-occurrence").map((card) => card.getAttribute("data-entry-id"))).toEqual(["h-e03-a", "h-e02", "h-e03-b"]));
    const moved = screen.getAllByTestId("series-occurrence")[2];
    expect(moved).toHaveTextContent("Plane");
    expect(moved).toHaveTextContent("6/10");
    expect(screen.getAllByTestId("series-occurrence")[0]).not.toHaveTextContent("Plane");
  });

  test("a TMDB failure still renders the stored Movie Tracker history with a warning", async () => {
    tmdb.getTvSeries.mockRejectedValue(new TmdbError("network", "down"));
    renderAt("/history/tv/199925?scope=personal");
    expect(await screen.findAllByTestId("series-occurrence")).toHaveLength(3);
    expect(screen.getByTestId("series-tmdb-warning")).toHaveTextContent(/couldn't reach tmdb/i);
    expect(screen.getByRole("heading", { level: 1, name: "Special Ops: Lioness" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Special Ops: Lioness poster" })).toHaveAttribute("src", "https://image.tmdb.org/t/p/w500/lioness.jpg");
    expect(screen.queryByTestId("series-cast")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("series-stats")).getByText("Watch occurrences").nextElementSibling).toHaveTextContent("3");
  });

  test("a history API failure keeps the TMDB hero and offers a retry", async () => {
    historyApi.fetchSeriesHistory.mockRejectedValueOnce({ response: { status: 403, data: { msg: "Only group members can view this history." } } });
    renderAt(`/history/tv/199925?scope=group&groupId=${GROUP_ID}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Special Ops: Lioness" })).toBeInTheDocument();
    const error = await screen.findByTestId("series-history-error");
    expect(error).toHaveTextContent("Only group members can view this history.");
    expect(screen.getByTestId("series-cast")).toBeInTheDocument();
    expect(screen.queryAllByTestId("series-occurrence")).toHaveLength(0);

    fireEvent.click(within(error).getByRole("button", { name: /try again/i }));
    expect(await screen.findAllByTestId("series-occurrence")).toHaveLength(3);
  });

  test("a valid series with no occurrences shows the intentional empty state", async () => {
    historyApi.fetchSeriesHistory.mockResolvedValue({ seriesTmdbId: 199925, scope: "personal", groupId: null, items: [], stats: {} });
    renderAt("/history/tv/199925");
    expect(await screen.findByTestId("series-history-empty")).toHaveTextContent("No watched episodes found in this history scope.");
    expect(historyApi.fetchSeriesHistory).toHaveBeenCalledWith(199925, { scope: "personal", groupId: undefined });
    expect(within(screen.getByTestId("series-stats")).getByText("Watch occurrences").nextElementSibling).toHaveTextContent("0");
  });

  test("malformed ids never reach TMDB or the API", async () => {
    for (const bad of ["abc", "0", "-1", "1.5", "12abc"]) {
      const { unmount } = renderAt(`/history/tv/${bad}`);
      expect(screen.getByTestId("series-invalid")).toHaveTextContent(/series link isn't valid/i);
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
      unmount();
    }
    const { unmount } = renderAt("/history/tv/199925?scope=group&groupId=nope");
    expect(screen.getByTestId("series-invalid")).toHaveTextContent(/group link isn't valid/i);
    unmount();
    expect(tmdb.getTvSeries).not.toHaveBeenCalled();
    expect(historyApi.fetchSeriesHistory).not.toHaveBeenCalled();
  });
});
