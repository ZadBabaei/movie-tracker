import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { HistoryEntry } from "../store/useWatchHistoryStore";
import { buildTimeline, TvSessionTimelineItem } from "../utils/historyTimeline";
import TvSessionCard, { DEFAULT_ARTWORK, sessionArtwork, sessionRating } from "./TvSessionCard";

const member = { _id: "u1", name: "Zad", avatar: "" };

const episode = (id: string, episodeNumber: number, overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  _id: id,
  mediaType: "tv_episode",
  scope: "personal",
  group: null,
  createdBy: member,
  movie: null,
  tv: {
    seriesTmdbId: 95396,
    seasonNumber: 1,
    episodeNumber,
    episodeTmdbId: 1000 + episodeNumber,
    seriesTitle: "Severance",
    episodeTitle: `Episode ${episodeNumber}`,
    posterPath: "/severance-poster.jpg",
    backdropPath: "/severance-backdrop.jpg",
    stillPath: "",
    airDate: "2022-02-18",
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

const sessionOf = (entries: HistoryEntry[]): TvSessionTimelineItem => {
  const [item] = buildTimeline(entries);
  if (item.kind !== "tv_session") throw new Error("expected a TV session");
  return item;
};

const renderCard = (session: TvSessionTimelineItem, onOpen = vi.fn()) => {
  render(<TvSessionCard session={session} formattedDay="May 10, 2024" onOpen={onOpen} />);
  return onOpen;
};

/** Everything the stack contract promises: one wrapper, one front card, no cloned layers. */
const expectFixedStack = (card: HTMLElement) => {
  const stack = card.closest('[data-testid="history-tv-stack"]') as HTMLElement;
  expect(stack).not.toBeNull();
  expect(stack).toHaveClass("history-tv-stack");
  // The rear layers are ::before/::after, so the wrapper's only element child is the real card.
  expect(stack.children).toHaveLength(1);
  expect(stack.children[0]).toBe(card);
  expect(stack.querySelectorAll("button")).toHaveLength(1);
  expect(stack.querySelectorAll('[data-testid="history-session"]')).toHaveLength(1);
  expect(stack.querySelectorAll(".history-card")).toHaveLength(1);
  expect(stack.querySelectorAll("img")).toHaveLength(1);
  expect(stack).not.toHaveAttribute("role");
  expect(stack).not.toHaveAttribute("tabindex");
  expect(card).toHaveClass("history-card", "history-card--tv");
};

describe("TvSessionCard", () => {
  test("renders the TV badge, series title, episode summary, date and watch count", () => {
    renderCard(sessionOf([episode("t3", 3), episode("t2", 2), episode("t1", 1)]));
    const card = screen.getByTestId("history-session");
    expect(within(card).getByText("TV")).toHaveClass("history-tv-badge");
    expect(within(card).getByText("Severance")).toHaveClass("history-card-title");
    expect(within(card).getByText("S01 · E01–E03")).toHaveClass("history-card-episode");
    expect(within(card).getByText("May 10, 2024")).toBeInTheDocument();
    expect(within(card).getByText("3 episode watches")).toBeInTheDocument();
    expect(within(card).getByText("Episodes")).toHaveClass("history-card-action");
    expect(card).toHaveAccessibleName("TV: Severance, S01 · E01–E03, 3 episode watches on May 10, 2024");
  });

  test("uses the same fixed three-layer structure for one, three and ten watches", () => {
    const sessions = [
      sessionOf([episode("a1", 1)]),
      sessionOf([episode("b3", 3), episode("b2", 2), episode("b1", 1)]),
      sessionOf(Array.from({ length: 10 }, (_, index) => episode(`c${index}`, index + 1))),
    ];
    expect(sessions.map((session) => session.watchCount)).toEqual([1, 3, 10]);

    const structures = sessions.map((session) => {
      const { unmount } = render(<TvSessionCard session={session} formattedDay="May 10, 2024" onOpen={vi.fn()} />);
      const card = screen.getByTestId("history-session");
      expectFixedStack(card);
      const stack = card.parentElement as HTMLElement;
      const shape = { wrapperChildren: stack.children.length, classes: stack.className, cardClasses: card.className, buttons: stack.querySelectorAll("button").length };
      unmount();
      return shape;
    });
    expect(structures[1]).toEqual(structures[0]);
    expect(structures[2]).toEqual(structures[0]);
    // Nothing in the markup encodes the count as extra layers.
    expect(structures[2].wrapperChildren).toBe(1);
  });

  test("one-episode session shows '1 episode watch' and the record's own rating", () => {
    renderCard(sessionOf([episode("t1", 1, { averageRating: 8, currentUserRating: 8, ratingCount: 1 })]));
    const card = screen.getByTestId("history-session");
    expect(within(card).getByText("1 episode watch")).toBeInTheDocument();
    expect(within(card).getByText("S01 · E01")).toBeInTheDocument();
    expect(within(card).getByText("8")).toHaveClass("history-card-rating");
  });

  test("multi-record sessions never blend ratings into one number", () => {
    const session = sessionOf([episode("t2", 2, { averageRating: 9, currentUserRating: 9 }), episode("t1", 1, { averageRating: 7, currentUserRating: 7 })]);
    expect(sessionRating(session)).toBeNull();
    renderCard(session);
    expect(document.querySelector(".history-card-rating")).toBeNull();
    expect(sessionRating({ entries: [episode("x", 1, { currentUserRating: 6 })] })).toBe(6);
    expect(sessionRating({ entries: [episode("x", 1)] })).toBeNull();
  });

  test("prefers the backdrop, then the poster, then the default artwork", () => {
    expect(sessionArtwork({ backdropPath: "/bd.jpg", posterPath: "/p.jpg" })).toEqual({ src: "https://image.tmdb.org/t/p/w500/bd.jpg", fallback: "https://image.tmdb.org/t/p/w500/p.jpg" });
    expect(sessionArtwork({ backdropPath: "", posterPath: "/p.jpg" })).toEqual({ src: "https://image.tmdb.org/t/p/w500/p.jpg", fallback: DEFAULT_ARTWORK });
    expect(sessionArtwork({ backdropPath: "", posterPath: "" })).toEqual({ src: DEFAULT_ARTWORK, fallback: DEFAULT_ARTWORK });

    renderCard(sessionOf([episode("t1", 1)]));
    const image = screen.getByRole("img", { name: "Severance artwork" }) as HTMLImageElement;
    expect(image).toHaveAttribute("src", "https://image.tmdb.org/t/p/w500/severance-backdrop.jpg");
    fireEvent.error(image);
    expect(image).toHaveAttribute("src", "https://image.tmdb.org/t/p/w500/severance-poster.jpg");
    fireEvent.error(image);
    expect(image).toHaveAttribute("src", DEFAULT_ARTWORK);
    fireEvent.error(image);
    expect(image).toHaveAttribute("src", DEFAULT_ARTWORK);
  });

  test("clicking or pressing Enter on the front card opens the exact session; a long title changes nothing else", () => {
    const longTitle = "The Extraordinarily Long-Winded Chronicles of a Series Whose Name Refuses to Fit on One Line";
    const entries = [episode("t2", 2), episode("t1", 1)].map((entry) => ({ ...entry, tv: { ...entry.tv!, seriesTitle: longTitle } }));
    const session = sessionOf(entries);
    const onOpen = renderCard(session);
    const card = screen.getByTestId("history-session");
    expectFixedStack(card);
    expect(session.entries.map((entry) => entry._id)).toEqual(["t2", "t1"]);
    expect(session.episodeSummary).toBe("S01 · E01–E02");
    expect(session.id).toBe("tv:95396:2024-05-10");

    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(session);
    card.focus();
    expect(card).toHaveFocus();
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.click(card);
    expect(onOpen).toHaveBeenLastCalledWith(session);
  });
});
