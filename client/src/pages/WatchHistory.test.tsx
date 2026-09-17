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

beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  useWatchHistoryStore.setState({ personal: { items: [], total: 0, nextCursor: null }, byGroup: {}, loading: {}, errors: {} });
  historyApi.fetchPersonalHistory.mockReset();
  historyApi.fetchPersonalHistory.mockResolvedValue({ items: [tvEntry, movieEntry], nextCursor: null, stats: { total: 2, latestWatchedAt: tvEntry.watchedAt } });
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <WatchHistory />
    </MemoryRouter>
  );

describe("Watch History with mixed media", () => {
  test("renders a movie row unchanged and an episode row with series, code and title", async () => {
    renderPage();
    const rows = await screen.findAllByTestId("history-row");
    expect(rows).toHaveLength(2);

    const [episodeRow, movieRow] = rows;
    expect(within(movieRow).getByText("Heat")).toBeInTheDocument();
    expect(within(movieRow).getByRole("img", { name: /heat poster/i })).toHaveAttribute("src", "https://image.tmdb.org/t/p/w500/heat.jpg");
    expect(within(movieRow).queryByText(/S\d\dE\d\d/)).not.toBeInTheDocument();

    expect(within(episodeRow).getByText("Special Ops: Lioness")).toBeInTheDocument();
    expect(within(episodeRow).getByText("S01E03 · Bruise Like a Fist")).toBeInTheDocument();
    expect(within(episodeRow).getByRole("img", { name: /lioness poster/i })).toHaveAttribute("src", "https://image.tmdb.org/t/p/w500/lioness.jpg");
    expect(episodeRow).toHaveAccessibleName(/Special Ops: Lioness S01E03/);

    // Hero uses the newest entry even when it is an episode.
    const hero = document.querySelector(".history-hero-image") as HTMLImageElement;
    expect(hero.src).toBe("https://image.tmdb.org/t/p/w500/lioness-bd.jpg");
  });

  test("search and title sort handle both media types", async () => {
    renderPage();
    await screen.findAllByTestId("history-row");
    fireEvent.change(screen.getByLabelText(/search watch history/i), { target: { value: "bruise" } });
    expect(screen.getAllByTestId("history-row")).toHaveLength(1);
    expect(screen.getByText("Special Ops: Lioness")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/search watch history/i), { target: { value: "s01e03" } });
    expect(screen.getAllByTestId("history-row")).toHaveLength(1);

    fireEvent.change(screen.getByLabelText(/search watch history/i), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "title" } });
    const sorted = screen.getAllByTestId("history-row");
    expect(within(sorted[0]).getByText("Heat")).toBeInTheDocument();
    expect(within(sorted[1]).getByText("Special Ops: Lioness")).toBeInTheDocument();
  });

  test("opening an episode row shows its details without crashing", async () => {
    renderPage();
    const [episodeRow] = await screen.findAllByTestId("history-row");
    fireEvent.click(episodeRow);
    const dialog = await screen.findByRole("dialog", { name: /watch history details/i });
    expect(within(dialog).getByRole("heading", { name: "Special Ops: Lioness" })).toBeInTheDocument();
    expect(within(dialog).getByText("S01E03 · Bruise Like a Fist")).toBeInTheDocument();
    expect(within(dialog).getByText("Cruz carries this one.")).toBeInTheDocument();
    expect(within(dialog).getByText(/May 10, 2024/)).toBeInTheDocument();
  });

  test("exposes an Add TV Watch entry point that opens the picker", async () => {
    renderPage();
    await screen.findAllByTestId("history-row");
    expect(screen.queryByTestId("tv-picker-stub")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add tv watch/i }));
    await waitFor(() => expect(screen.getByTestId("tv-picker-stub")).toBeInTheDocument());
  });
});
