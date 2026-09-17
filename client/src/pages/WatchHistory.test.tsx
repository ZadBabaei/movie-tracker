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
}));
vi.mock("../api/historyApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/historyApi")>();
  return { ...actual, ...historyApi };
});
vi.mock("../store/useGroupStore", () => ({
  useGroupStore: () => ({ groupList: [], fetchGroups: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock("../hooks/useSocket", () => ({ useSocket: () => ({ on: vi.fn(), off: vi.fn() }) }));
vi.mock("../component/VerticalNavbar", () => ({ default: () => null }));
vi.mock("../component/AddTvWatchModal", () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="tv-picker-stub">picker</div> : null),
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
});

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
    expect(within(may10).getByRole("img", { name: /lioness poster/i })).toHaveAttribute("src", "https://image.tmdb.org/t/p/w500/lioness.jpg");

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

  test("exposes an Add TV Watch entry point that opens the picker", async () => {
    renderPage();
    await screen.findAllByTestId("history-row");
    expect(screen.queryByTestId("tv-picker-stub")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add tv watch/i }));
    await waitFor(() => expect(screen.getByTestId("tv-picker-stub")).toBeInTheDocument());
  });
});
