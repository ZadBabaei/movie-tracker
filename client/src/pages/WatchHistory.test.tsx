import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import WatchHistory from "./WatchHistory";

const mocks = vi.hoisted(() => ({
  createHistoryEntry: vi.fn(),
  fetchPersonal: vi.fn(),
  fetchGroup: vi.fn(),
  fetchGroups: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  rateEntry: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  socketOn: vi.fn(),
  socketOff: vi.fn(),
}));

const historyState = {
  personal: { items: [] as any[], total: 0, nextCursor: null },
  byGroup: {} as Record<string, any>,
  loading: {} as Record<string, boolean>,
  errors: {} as Record<string, string | null>,
};

const localValues = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => localValues.get(key) ?? null,
  setItem: (key: string, value: string) => localValues.set(key, String(value)),
  removeItem: (key: string) => localValues.delete(key),
  clear: () => localValues.clear(),
});

vi.mock("../api/historyApi", () => ({
  createHistoryEntry: mocks.createHistoryEntry,
}));

vi.mock("../store/useGroupStore", () => ({
  useGroupStore: () => ({
    groupList: [{ _id: "group-1", name: "Movie Club", slug: "movie-club" }],
    fetchGroups: mocks.fetchGroups,
  }),
}));

vi.mock("../store/useWatchHistoryStore", () => ({
  useWatchHistoryStore: () => ({
    ...historyState,
    fetchPersonal: mocks.fetchPersonal,
    fetchGroup: mocks.fetchGroup,
    updateEntry: mocks.updateEntry,
    deleteEntry: mocks.deleteEntry,
    rateEntry: mocks.rateEntry,
  }),
}));

vi.mock("../hooks/useSocket", () => ({
  useSocket: () => ({ on: mocks.socketOn, off: mocks.socketOff }),
}));

vi.mock("../component/VerticalNavbar", () => ({ default: () => null }));

vi.mock("../component/SearchBar", () => ({
  default: ({ onMovieSelect }: { onMovieSelect: (movie: any) => void }) => (
    <button
      type="button"
      onClick={() => onMovieSelect({
        id: 329865,
        imdbID: "tmdb-329865",
        title: "Arrival",
        poster_path: "/arrival.jpg",
        vote_average: 7.9,
      })}
    >
      Choose Arrival
    </button>
  ),
}));

vi.mock("../component/GroupSelectModal", () => ({
  default: ({ isOpen, movieTitle, onSelect, onClose, submitting }: any) => isOpen ? (
    <div role="dialog" aria-label="Watch details">
      <span>Watch details for {movieTitle}</span>
      <button type="button" disabled={submitting} onClick={() => onSelect("personal", {
        watchedDate: "2026-09-18",
        watchedWhere: "Home",
        watchedWith: [],
        watchedNotes: "A quiet rewatch",
      })}>Save personal</button>
      <button type="button" disabled={submitting} onClick={() => onSelect("group-1", {
        watchedDate: "2026-09-19",
        watchedWhere: "Cinema",
        watchedWith: ["member-1", "member-2"],
        watchedNotes: "Opening night",
      })}>Save group</button>
      <button type="button" disabled={submitting} onClick={onClose}>Cancel details</button>
    </div>
  ) : null,
}));

vi.mock("react-toastify", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

const renderPage = () => render(
  <MemoryRouter>
    <WatchHistory />
  </MemoryRouter>
);

const chooseArrival = () => {
  fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
  fireEvent.click(screen.getByRole("button", { name: /choose arrival/i }));
};

beforeEach(() => {
  localStorage.clear();
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.createHistoryEntry.mockResolvedValue({ _id: "history-1" });
  mocks.fetchPersonal.mockResolvedValue(undefined);
  mocks.fetchGroup.mockResolvedValue(undefined);
  mocks.fetchGroups.mockResolvedValue(undefined);
  historyState.personal = { items: [], total: 0, nextCursor: null };
  historyState.byGroup = {};
  historyState.loading = {};
  historyState.errors = {};
});

describe("direct additions from Watch History", () => {
  test("shows Add to History and toggles the existing movie search", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    expect(screen.getByRole("button", { name: /choose arrival/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("button", { name: /choose arrival/i })).not.toBeInTheDocument();
  });

  test("selecting a search result opens watch details and hides search", () => {
    renderPage();
    chooseArrival();

    expect(screen.getByRole("dialog", { name: /watch details/i })).toHaveTextContent("Arrival");
    expect(screen.queryByRole("button", { name: /choose arrival/i })).not.toBeInTheDocument();
  });

  test("personal save sends one direct-history payload without source and refreshes personal history", async () => {
    renderPage();
    chooseArrival();
    fireEvent.click(screen.getByRole("button", { name: /save personal/i }));

    await waitFor(() => expect(mocks.createHistoryEntry).toHaveBeenCalledTimes(1));
    const payload = mocks.createHistoryEntry.mock.calls[0][0];
    expect(payload).toEqual({
      movie: {
        id: 329865,
        imdbID: "tmdb-329865",
        title: "Arrival",
        poster_path: "/arrival.jpg",
        vote_average: 7.9,
      },
      scope: "personal",
      watchedAt: "2026-09-18",
      watchedLocation: "Home",
      watchedNotes: "A quiet rewatch",
    });
    expect(payload).not.toHaveProperty("source");
    await waitFor(() => expect(mocks.fetchPersonal).toHaveBeenCalled());
    expect(screen.queryByRole("dialog", { name: /watch details/i })).not.toBeInTheDocument();
  });

  test("group save includes groupId and participants and refreshes both relevant histories", async () => {
    renderPage();
    chooseArrival();
    fireEvent.click(screen.getByRole("button", { name: /save group/i }));

    await waitFor(() => expect(mocks.createHistoryEntry).toHaveBeenCalledTimes(1));
    expect(mocks.createHistoryEntry.mock.calls[0][0]).toMatchObject({
      scope: "group",
      groupId: "group-1",
      participants: ["member-1", "member-2"],
      watchedAt: "2026-09-19",
      watchedLocation: "Cinema",
      watchedNotes: "Opening night",
    });
    expect(mocks.createHistoryEntry.mock.calls[0][0]).not.toHaveProperty("source");
    await waitFor(() => {
      expect(mocks.fetchGroup).toHaveBeenCalledWith("group-1");
      expect(mocks.fetchPersonal).toHaveBeenCalled();
    });
  });

  test("failed submission shows the backend message and keeps the selected movie", async () => {
    mocks.createHistoryEntry.mockRejectedValue({ response: { data: { msg: "History service unavailable" } } });
    renderPage();
    await waitFor(() => expect(mocks.fetchPersonal).toHaveBeenCalled());
    mocks.fetchPersonal.mockClear();
    chooseArrival();
    fireEvent.click(screen.getByRole("button", { name: /save personal/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("History service unavailable"));
    expect(screen.getByRole("dialog", { name: /watch details/i })).toHaveTextContent("Arrival");
    expect(mocks.fetchPersonal).not.toHaveBeenCalled();
  });

  test("existing history rows still open the details interaction", () => {
    historyState.personal = {
      total: 1,
      nextCursor: null,
      items: [{
        _id: "history-existing",
        scope: "personal",
        group: null,
        createdBy: { _id: "member-1", name: "Member" },
        movie: { _id: "movie-1", title: "Existing Film", imdbID: "tmdb-1", poster: "", vote_average: 8 },
        participants: [{ _id: "member-1", name: "Member" }],
        watchedAt: "2026-09-01T00:00:00.000Z",
        watchedLocation: "Home",
        watchedNotes: "",
        averageRating: null,
        ratingCount: 0,
        currentUserRating: null,
        ratings: [],
      }],
    };
    renderPage();

    fireEvent.click(screen.getByTestId("history-row"));
    expect(screen.getByRole("heading", { name: "Existing Film" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit details/i })).toBeInTheDocument();
  });
});
