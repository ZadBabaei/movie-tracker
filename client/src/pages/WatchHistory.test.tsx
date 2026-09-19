import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { HistoryEntry } from "../store/useWatchHistoryStore";
import { useWatchHistoryStore } from "../store/useWatchHistoryStore";
import WatchHistory from "./WatchHistory";

const historyApi = vi.hoisted(() => ({
  fetchPersonalHistory: vi.fn(),
  fetchGroupHistory: vi.fn(),
  updateHistoryEntry: vi.fn(),
  deleteHistoryEntry: vi.fn(),
  rateHistoryEntry: vi.fn(),
  createHistoryEntry: vi.fn(),
  createTvEpisodeHistoryEntries: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warn: vi.fn() }));
vi.mock("react-toastify", () => ({ toast: toastMock }));
vi.mock("../api/historyApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/historyApi")>();
  return { ...actual, ...historyApi };
});
vi.mock("../store/useGroupStore", () => ({
  useGroupStore: () => ({ groupList: [{ _id: "group-1", name: "Movie Club", slug: "movie-club" }], fetchGroups: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock("../hooks/useSocket", () => ({ useSocket: () => ({ on: vi.fn(), off: vi.fn() }) }));
vi.mock("../component/VerticalNavbar", () => ({ default: () => null }));
// The unified search and the episode picker have their own suites; here they
// are stubs that emit the shapes the page has to handle.
const arrival = { kind: "movie" as const, tmdbId: 329865, title: "Arrival", originalTitle: null, year: 2016, date: "2016-11-10", posterPath: "/arrival.jpg", backdropPath: null, overview: null, voteAverage: 7.9, popularity: 50, originCountry: [] };
const lioness = { kind: "tv" as const, tmdbId: 199925, title: "Special Ops: Lioness", originalTitle: null, year: 2023, date: "2023-07-23", posterPath: "/lioness.jpg", backdropPath: null, overview: null, voteAverage: 7.9, popularity: 90, originCountry: ["US"] };
vi.mock("../component/HistoryMediaSearch", () => ({
  default: ({ onSelect }: { onSelect: (result: any) => void }) => (
    <div data-testid="media-search-stub">
      <button type="button" onClick={() => onSelect(arrival)}>Choose Arrival</button>
      <button type="button" onClick={() => onSelect(lioness)}>Choose Lioness</button>
    </div>
  ),
}));

const pickerSeries = { seriesTmdbId: 199925, seriesTitle: "Special Ops: Lioness", posterPath: "/lioness.jpg", backdropPath: "/lioness-bd.jpg" };
const pickerEpisode = (episodeNumber: number) => ({
  seriesTmdbId: 199925,
  episodeTmdbId: 4321000 + episodeNumber,
  seasonNumber: 1,
  episodeNumber,
  episodeTitle: `Ep ${episodeNumber}`,
  airDate: "2023-07-23",
  runtime: 45,
  stillPath: null,
  overview: null,
  voteAverage: null,
  voteCount: null,
  productionCode: null,
  cast: [],
  guestStars: [],
  crew: [],
  externalIds: null,
});
vi.mock("../component/TvEpisodePicker", () => ({
  default: ({ isOpen, series, onSelect, onBack }: any) =>
    isOpen ? (
      <div role="dialog" aria-label="Episode picker">
        <span>Picker for {series?.title} #{series?.seriesTmdbId}</span>
        <button type="button" onClick={() => onSelect({ series: pickerSeries, episodes: [pickerEpisode(1), pickerEpisode(2)] })}>Pick E01 E02</button>
        <button type="button" onClick={onBack}>Back to search</button>
      </div>
    ) : null,
}));

vi.mock("../component/GroupSelectModal", () => ({
  default: ({ isOpen, watchTitle, movieTitle, onSelect, onClose, submitting }: any) =>
    isOpen ? (
      <div role="dialog" aria-label="Watch details">
        <span>Watch details for {watchTitle ?? movieTitle}</span>
        <button type="button" disabled={submitting} onClick={() => onSelect("personal", { watchedDate: "2026-09-18", watchedWhere: "Home", watchedWith: [], watchedNotes: "A quiet rewatch" })}>Save personal</button>
        <button type="button" disabled={submitting} onClick={() => onSelect("group-1", { watchedDate: "2026-09-19", watchedWhere: "Cinema", watchedWith: ["member-1", "member-2"], watchedNotes: "Opening night" })}>Save group</button>
        <button type="button" disabled={submitting} onClick={onClose}>Cancel details</button>
      </div>
    ) : null,
}));

const member = { _id: "u1", name: "Zad", avatar: "" };

const movieEntry: HistoryEntry = {
  _id: "m1",
  mediaType: "movie",
  scope: "personal",
  group: null,
  createdBy: member,
  movie: { _id: "mv1", title: "Heat", imdbID: "tmdb-949", poster: "/heat.jpg", vote_average: 8.2 },
  tv: null,
  participants: [member],
  watchedAt: "2024-04-01T00:00:00.000Z",
  watchedLocation: "Cinema",
  watchedNotes: "",
  averageRating: 9,
  ratingCount: 1,
  currentUserRating: 9,
  ratings: [{ ...member, rating: 9 }],
};

const tvEntry: HistoryEntry = {
  _id: "t1",
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
  },
  participants: [member],
  watchedAt: "2024-05-10T00:00:00.000Z",
  watchedLocation: "",
  watchedNotes: "Cruz carries this one.",
  averageRating: null,
  ratingCount: 0,
  currentUserRating: null,
  ratings: [],
};

const tvRewatch: HistoryEntry = { ...tvEntry, _id: "t2", watchedNotes: "", watchedLocation: "Train" };
const tvNext: HistoryEntry = {
  ...tvEntry,
  _id: "t3",
  tv: { ...tvEntry.tv!, episodeNumber: 4, episodeTitle: "The Choice of Failure", stillPath: "" },
  watchedNotes: "",
  currentUserRating: 8,
  averageRating: 8,
  ratingCount: 1,
};
const tvOtherDay: HistoryEntry = {
  ...tvEntry,
  _id: "t4",
  tv: { ...tvEntry.tv!, episodeNumber: 5, episodeTitle: "Truth Is the Shrewdest Lie" },
  watchedAt: "2024-05-12T00:00:00.000Z",
  watchedNotes: "",
};

beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  useWatchHistoryStore.setState({ personal: { items: [], total: 0, nextCursor: null }, byGroup: {}, loading: {}, errors: {} });
  historyApi.fetchPersonalHistory.mockReset();
  historyApi.fetchPersonalHistory.mockResolvedValue({ items: [tvOtherDay, tvNext, tvRewatch, tvEntry, movieEntry], nextCursor: null, stats: { total: 5, latestWatchedAt: tvOtherDay.watchedAt } });
  historyApi.updateHistoryEntry.mockReset();
  historyApi.deleteHistoryEntry.mockReset();
  historyApi.deleteHistoryEntry.mockResolvedValue({});
  historyApi.fetchGroupHistory.mockReset();
  historyApi.fetchGroupHistory.mockResolvedValue({ items: [], nextCursor: null, stats: { total: 0, latestWatchedAt: null } });
  historyApi.createHistoryEntry.mockReset();
  historyApi.createHistoryEntry.mockResolvedValue({ _id: "history-1" });
  historyApi.createTvEpisodeHistoryEntries.mockReset();
  historyApi.createTvEpisodeHistoryEntries.mockImplementation(async (episodes: any[]) => ({
    succeeded: episodes.map((episode) => ({ episode, entry: { _id: `h-${episode.episodeNumber}` } })),
    failed: [],
  }));
  Object.values(toastMock).forEach((mock) => mock.mockReset());
});

const openAddFlow = () => fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
const chooseArrival = () => {
  openAddFlow();
  fireEvent.click(screen.getByRole("button", { name: /choose arrival/i }));
};
const chooseLionessEpisodes = () => {
  openAddFlow();
  fireEvent.click(screen.getByRole("button", { name: /choose lioness/i }));
  fireEvent.click(screen.getByRole("button", { name: /pick e01 e02/i }));
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <WatchHistory />
    </MemoryRouter>
  );

describe("Watch History timeline", () => {
  test("renders the movie card unchanged and folds same-day episodes into one session card", async () => {
    renderPage();
    const movieRows = await screen.findAllByTestId("history-row");
    expect(movieRows).toHaveLength(1);
    const [movieRow] = movieRows;
    expect(within(movieRow).getByText("Heat")).toBeInTheDocument();
    expect(within(movieRow).getByText("April 1, 2024")).toBeInTheDocument();
    expect(within(movieRow).getByText("Cinema")).toBeInTheDocument();
    expect(within(movieRow).getByRole("img", { name: /heat poster/i })).toHaveAttribute("src", "https://image.tmdb.org/t/p/w500/heat.jpg");
    expect(within(movieRow).getByText("9")).toBeInTheDocument();
    expect(movieRow).toHaveAccessibleName("View details for Heat");
    // Movie cards stay single-layer: no stack wrapper, no TV class, no TV badge.
    expect(movieRow).not.toHaveClass("history-card--tv");
    expect(movieRow.closest(".history-tv-stack")).toBeNull();
    expect(movieRow.parentElement).toHaveClass("history-period-list");
    expect(within(movieRow).queryByText("TV")).not.toBeInTheDocument();

    const sessions = screen.getAllByTestId("history-session");
    expect(sessions).toHaveLength(2);
    const [may12, may10] = sessions;
    expect(within(may12).getByText("S01 \u00b7 E05")).toBeInTheDocument();
    expect(within(may12).getByText("May 12, 2024")).toBeInTheDocument();
    expect(within(may12).getByText("1 episode watch")).toBeInTheDocument();

    expect(within(may10).getByText("Special Ops: Lioness")).toBeInTheDocument();
    expect(within(may10).getByText("S01 \u00b7 E03 \u00d72, E04")).toBeInTheDocument();
    expect(within(may10).getByText("May 10, 2024")).toBeInTheDocument();
    expect(within(may10).getByText("3 episode watches")).toBeInTheDocument();
    expect(within(may10).getByRole("img", { name: /lioness artwork/i })).toHaveAttribute("src", "https://image.tmdb.org/t/p/w500/lioness-bd.jpg");
    // Every TV session is one stacked card (wrapper + one front button), whatever its watch count.
    sessions.forEach((card) => {
      expect(card).toHaveClass("history-card--tv");
      expect(within(card).getByText("TV")).toHaveClass("history-tv-badge");
      const stack = card.parentElement as HTMLElement;
      expect(stack).toHaveClass("history-tv-stack");
      expect(stack.children).toHaveLength(1);
    });
    expect(screen.getAllByTestId("history-tv-stack")).toHaveLength(2);
    expect(may12).toHaveAccessibleName("TV: Special Ops: Lioness, S01 · E05, 1 episode watch on May 12, 2024");

    expect(screen.getByText(/watch events/)).toHaveTextContent("5 watch events");
    const hero = document.querySelector(".history-hero-image") as HTMLImageElement;
    expect(hero.src).toBe("https://image.tmdb.org/t/p/w500/lioness-bd.jpg");
  });

  test("search keeps a whole session when one episode matches; title sort orders by series title", async () => {
    renderPage();
    await screen.findAllByTestId("history-row");
    const search = screen.getByLabelText(/search watch history/i);

    fireEvent.change(search, { target: { value: "choice of failure" } });
    expect(screen.queryAllByTestId("history-row")).toHaveLength(0);
    const [session] = screen.getAllByTestId("history-session");
    expect(screen.getAllByTestId("history-session")).toHaveLength(1);
    expect(within(session).getByText("S01 \u00b7 E03 \u00d72, E04")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "s01e05" } });
    expect(screen.getAllByTestId("history-session")).toHaveLength(1);
    expect(within(screen.getByTestId("history-session")).getByText("May 12, 2024")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "title" } });
    const cards = document.querySelectorAll(".history-card");
    expect(cards[0]).toHaveTextContent("Heat");
    expect(cards[1]).toHaveTextContent("Special Ops: Lioness");
  });

  test("the Rated filter keeps a session with one rated episode and drops an unrated one", async () => {
    renderPage();
    await screen.findAllByTestId("history-row");
    fireEvent.click(screen.getByRole("button", { name: "Rated" }));
    expect(screen.getAllByTestId("history-row")).toHaveLength(1);
    const sessions = screen.getAllByTestId("history-session");
    expect(sessions).toHaveLength(1);
    expect(within(sessions[0]).getByText("S01 \u00b7 E03 \u00d72, E04")).toBeInTheDocument();
  });

  test("a session opens a list of its exact occurrences, each reaching the entry detail", async () => {
    renderPage();
    await screen.findAllByTestId("history-row");
    fireEvent.click(screen.getAllByTestId("history-session")[1]);

    const detail = await screen.findByTestId("session-detail");
    expect(within(detail).getByRole("heading", { name: "Special Ops: Lioness" })).toBeInTheDocument();
    expect(within(detail).getByText("S01 \u00b7 E03 \u00d72, E04")).toBeInTheDocument();
    const occurrences = within(detail).getAllByTestId("session-entry");
    expect(occurrences).toHaveLength(3);
    expect(occurrences[0]).toHaveTextContent("S01E04");
    expect(occurrences[0]).toHaveTextContent("\u2605 8");
    expect(occurrences[1]).toHaveTextContent("S01E03");
    expect(occurrences[1]).toHaveTextContent("Train");
    expect(occurrences[2]).toHaveTextContent("S01E03");
    expect(occurrences[2]).not.toHaveTextContent("Train");

    fireEvent.click(occurrences[2]);
    const dialog = await screen.findByRole("dialog", { name: /watch history details/i });
    expect(within(dialog).getByText("S01E03 \u00b7 Bruise Like a Fist")).toBeInTheDocument();
    expect(within(dialog).getByText("Cruz carries this one.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /all episodes that day/i }));
    expect(await screen.findByTestId("session-detail")).toBeInTheDocument();
  });

  test("deleting one occurrence of a rewatched episode leaves the other and regroups", async () => {
    renderPage();
    await screen.findAllByTestId("history-row");
    fireEvent.click(screen.getAllByTestId("history-session")[1]);
    const detail = await screen.findByTestId("session-detail");
    fireEvent.click(within(detail).getAllByTestId("session-entry")[1]); // t2, the "Train" rewatch

    const dialog = await screen.findByRole("dialog", { name: /watch history details/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: /delete entry/i }));
    await waitFor(() => expect(historyApi.deleteHistoryEntry).toHaveBeenCalledWith("t2"));
    expect(historyApi.deleteHistoryEntry).toHaveBeenCalledTimes(1);

    const after = await screen.findByTestId("session-detail");
    const remaining = within(after).getAllByTestId("session-entry");
    expect(remaining).toHaveLength(2);
    expect(within(after).getByText("S01 \u00b7 E03\u2013E04")).toBeInTheDocument();
    expect(useWatchHistoryStore.getState().personal.items.map((entry) => entry._id)).toEqual(["t4", "t3", "t1", "m1"]);
  });

  test("editing an occurrence's date moves it into its own session", async () => {
    historyApi.updateHistoryEntry.mockResolvedValue({ ...tvNext, watchedAt: "2024-05-11T00:00:00.000Z" });
    renderPage();
    await screen.findAllByTestId("history-row");
    fireEvent.click(screen.getAllByTestId("history-session")[1]);
    const detail = await screen.findByTestId("session-detail");
    fireEvent.click(within(detail).getAllByTestId("session-entry")[0]); // t3 = E04

    const dialog = await screen.findByRole("dialog", { name: /watch history details/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /edit details/i }));
    fireEvent.change(within(dialog).getByLabelText(/watched date/i), { target: { value: "2024-05-11" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(historyApi.updateHistoryEntry).toHaveBeenCalledWith("t3", expect.objectContaining({ watchedAt: "2024-05-11" })));

    fireEvent.click(within(dialog).getByRole("button", { name: /close dialog/i }));
    await waitFor(() => expect(screen.getAllByTestId("history-session")).toHaveLength(3));
    const summaries = screen.getAllByTestId("history-session").map((card) => within(card).getByText(/^S01 /).textContent);
    expect(summaries).toEqual(["S01 \u00b7 E05", "S01 \u00b7 E04", "S01 \u00b7 E03 \u00d72"]);
  });

});

describe("Add to History (unified movie + TV)", () => {
  test("shows one Add to History control that toggles the unified search", async () => {
    renderPage();
    await screen.findAllByTestId("history-row");
    expect(screen.queryByRole("button", { name: /add tv watch/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /add to history/i })).toHaveLength(1);

    openAddFlow();
    expect(screen.getByTestId("media-search-stub")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^close$/i })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: /^close$/i }));
    expect(screen.queryByTestId("media-search-stub")).not.toBeInTheDocument();
  });

  test("a movie result opens watch details directly and hides the search", async () => {
    renderPage();
    await screen.findAllByTestId("history-row");
    chooseArrival();
    expect(screen.getByRole("dialog", { name: /watch details/i })).toHaveTextContent("Watch details for Arrival");
    expect(screen.queryByTestId("media-search-stub")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /episode picker/i })).not.toBeInTheDocument();
  });

  test("personal movie save sends the direct-history payload without source and refreshes personal history", async () => {
    renderPage();
    await screen.findAllByTestId("history-row");
    historyApi.fetchPersonalHistory.mockClear();
    chooseArrival();
    fireEvent.click(screen.getByRole("button", { name: /save personal/i }));

    await waitFor(() => expect(historyApi.createHistoryEntry).toHaveBeenCalledTimes(1));
    const payload = historyApi.createHistoryEntry.mock.calls[0][0];
    expect(payload).toEqual({
      movie: { imdbID: "tmdb-329865", title: "Arrival", poster_path: "https://image.tmdb.org/t/p/w500/arrival.jpg", vote_average: 7.9 },
      scope: "personal",
      watchedAt: "2026-09-18",
      watchedLocation: "Home",
      watchedNotes: "A quiet rewatch",
    });
    expect(payload).not.toHaveProperty("source");
    expect(payload).not.toHaveProperty("movieId");
    await waitFor(() => expect(historyApi.fetchPersonalHistory).toHaveBeenCalled());
    expect(historyApi.createTvEpisodeHistoryEntries).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /watch details/i })).not.toBeInTheDocument());
    expect(toastMock.success).toHaveBeenCalledWith("Arrival added to your watch history.");
  });

  test("group movie save carries groupId and participants and refreshes both histories", async () => {
    renderPage();
    await screen.findAllByTestId("history-row");
    chooseArrival();
    fireEvent.click(screen.getByRole("button", { name: /save group/i }));

    await waitFor(() => expect(historyApi.createHistoryEntry).toHaveBeenCalledTimes(1));
    expect(historyApi.createHistoryEntry.mock.calls[0][0]).toMatchObject({
      scope: "group",
      groupId: "group-1",
      participants: ["member-1", "member-2"],
      watchedAt: "2026-09-19",
      watchedLocation: "Cinema",
      watchedNotes: "Opening night",
    });
    expect(historyApi.createHistoryEntry.mock.calls[0][0]).not.toHaveProperty("source");
    await waitFor(() => {
      expect(historyApi.fetchGroupHistory).toHaveBeenCalledWith("group-1", expect.anything());
      expect(historyApi.fetchPersonalHistory).toHaveBeenCalled();
    });
  });

  test("a failed movie save shows the backend message and keeps the selection open", async () => {
    historyApi.createHistoryEntry.mockRejectedValue({ response: { data: { msg: "History service unavailable" } } });
    renderPage();
    await screen.findAllByTestId("history-row");
    historyApi.fetchPersonalHistory.mockClear();
    chooseArrival();
    fireEvent.click(screen.getByRole("button", { name: /save personal/i }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("History service unavailable"));
    expect(screen.getByRole("dialog", { name: /watch details/i })).toHaveTextContent("Arrival");
    expect(historyApi.fetchPersonalHistory).not.toHaveBeenCalled();
  });

  test("a TV result opens the episode picker, then the same watch details, and saves one record per episode", async () => {
    renderPage();
    await screen.findAllByTestId("history-row");
    openAddFlow();
    fireEvent.click(screen.getByRole("button", { name: /choose lioness/i }));

    const picker = screen.getByRole("dialog", { name: /episode picker/i });
    expect(picker).toHaveTextContent("Picker for Special Ops: Lioness #199925");
    expect(screen.queryByRole("dialog", { name: /watch details/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("media-search-stub")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /pick e01 e02/i }));
    const details = screen.getByRole("dialog", { name: /watch details/i });
    expect(details).toHaveTextContent("Watch details for Special Ops: Lioness \u00b7 S01 \u00b7 E01\u2013E02");
    expect(screen.queryByRole("dialog", { name: /episode picker/i })).not.toBeInTheDocument();

    historyApi.fetchPersonalHistory.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /save personal/i }));
    await waitFor(() => expect(historyApi.createTvEpisodeHistoryEntries).toHaveBeenCalledTimes(1));
    const [episodes, details2] = historyApi.createTvEpisodeHistoryEntries.mock.calls[0];
    expect(episodes.map((episode: any) => episode.episodeNumber)).toEqual([1, 2]);
    expect(episodes.every((episode: any) => !("movieId" in episode) && episode.seriesTmdbId === 199925)).toBe(true);
    expect(details2).toMatchObject({ scopeId: "personal", watchedAt: "2026-09-18", watchedLocation: "Home", watchedNotes: "A quiet rewatch" });
    expect(historyApi.createHistoryEntry).not.toHaveBeenCalled();
    await waitFor(() => expect(historyApi.fetchPersonalHistory).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /watch details/i })).not.toBeInTheDocument());
    expect(toastMock.success).toHaveBeenCalledWith("2 episodes of Special Ops: Lioness saved to history.");
  });

  test("back from the picker returns to the search", async () => {
    renderPage();
    await screen.findAllByTestId("history-row");
    openAddFlow();
    fireEvent.click(screen.getByRole("button", { name: /choose lioness/i }));
    fireEvent.click(screen.getByRole("button", { name: /back to search/i }));
    expect(screen.queryByRole("dialog", { name: /episode picker/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("media-search-stub")).toBeInTheDocument();
  });

  test("TV partial failure is reported and retry resends only the failed episode", async () => {
    historyApi.createTvEpisodeHistoryEntries.mockImplementationOnce(async (episodes: any[]) => ({
      succeeded: [{ episode: episodes[0], entry: { _id: "h-1" } }],
      failed: [{ episode: episodes[1], message: "Server hiccup" }],
    }));
    renderPage();
    await screen.findAllByTestId("history-row");
    chooseLionessEpisodes();
    fireEvent.click(screen.getByRole("button", { name: /save group/i }));

    const banner = await screen.findByTestId("tv-outcome");
    expect(banner).toHaveTextContent("1 saved, 1 failed");
    expect(banner).toHaveTextContent("S01E02 (Server hiccup)");
    expect(toastMock.warn).toHaveBeenCalled();
    await waitFor(() => expect(historyApi.fetchGroupHistory).toHaveBeenCalledWith("group-1", expect.anything()));

    fireEvent.click(screen.getByRole("button", { name: /retry failed/i }));
    await waitFor(() => expect(historyApi.createTvEpisodeHistoryEntries).toHaveBeenCalledTimes(2));
    const [retried, retryDetails] = historyApi.createTvEpisodeHistoryEntries.mock.calls[1];
    expect(retried.map((episode: any) => episode.episodeNumber)).toEqual([2]);
    expect(retryDetails).toMatchObject({ scopeId: "group-1", participants: ["member-1", "member-2"] });
    await waitFor(() => expect(screen.queryByTestId("tv-outcome")).not.toBeInTheDocument());
  });
});
