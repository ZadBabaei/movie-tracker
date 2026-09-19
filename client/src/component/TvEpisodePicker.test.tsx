import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TvEpisodeDetails, TvSeasonDetails, TvSeriesDetails } from "../api/tmdb";
import TvEpisodePicker, { isUpcomingEpisode, pickDefaultSeason } from "./TvEpisodePicker";

const tmdb = vi.hoisted(() => ({
  getTvSeries: vi.fn(),
  getTvSeason: vi.fn(),
}));

vi.mock("../api/tmdb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/tmdb")>();
  return { ...actual, ...tmdb };
});

const TODAY = "2026-09-17";

const season = (seasonNumber: number, over: Partial<TvSeriesDetails["seasons"][number]> = {}) => ({
  seasonTmdbId: 100 + seasonNumber,
  seasonNumber,
  name: seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`,
  overview: null,
  posterPath: null,
  airDate: null,
  episodeCount: 3,
  voteAverage: null,
  isSpecials: seasonNumber === 0,
  ...over,
});

const episode = (seasonNumber: number, episodeNumber: number, over: Partial<TvEpisodeDetails> = {}): TvEpisodeDetails => ({
  seriesTmdbId: 199925,
  episodeTmdbId: seasonNumber * 1000 + episodeNumber,
  seasonNumber,
  episodeNumber,
  episodeTitle: `Episode ${episodeNumber} title`,
  airDate: "2024-01-0" + episodeNumber,
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
  ...over,
});

const series: TvSeriesDetails = {
  seriesTmdbId: 199925,
  seriesTitle: "Special Ops: Lioness",
  originalTitle: null,
  tagline: null,
  overview: "Joe attempts to balance…",
  posterPath: "/lioness.jpg",
  backdropPath: "/lioness-bd.jpg",
  firstAirDate: "2023-07-23",
  lastAirDate: null,
  status: "Returning Series",
  type: null,
  inProduction: true,
  genres: [],
  numberOfSeasons: 2,
  numberOfEpisodes: 16,
  episodeRunTime: 45,
  voteAverage: null,
  voteCount: null,
  popularity: null,
  originalLanguage: null,
  originCountry: ["US"],
  networks: [],
  createdBy: [],
  seasons: [
    season(0, { episodeCount: 1 }),
    season(1, { airDate: "2023-07-23" }),
    season(2, { airDate: "2024-10-27" }),
    season(3, { airDate: "2027-01-01" }),
  ],
  lastEpisodeToAir: null,
  nextEpisodeToAir: null,
  cast: [],
  externalIds: { imdbId: null, tvdbId: null, wikidataId: null, facebookId: null, instagramId: null, twitterId: null },
  images: { posters: [], backdrops: [] },
};

const seasonDetails = (seasonNumber: number, episodes: TvEpisodeDetails[]): TvSeasonDetails => ({
  ...season(seasonNumber),
  seriesTmdbId: 199925,
  episodeCount: episodes.length,
  episodes,
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  tmdb.getTvSeries.mockReset();
  tmdb.getTvSeason.mockReset();
  tmdb.getTvSeries.mockResolvedValue(series);
  tmdb.getTvSeason.mockImplementation(async (_id: number, seasonNumber: number) => {
    if (seasonNumber === 0) return seasonDetails(0, [episode(0, 1, { episodeTitle: "Behind the scenes" })]);
    if (seasonNumber === 2) {
      return seasonDetails(2, [
        episode(2, 1, { airDate: "2024-10-27" }),
        episode(2, 2, { airDate: "2024-11-03" }),
        episode(2, 3, { airDate: "2027-03-01" }),
        episode(2, 4, { airDate: null }),
      ]);
    }
    return seasonDetails(seasonNumber, [episode(seasonNumber, 1), episode(seasonNumber, 2)]);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const seed = { seriesTmdbId: 199925, title: "Special Ops: Lioness" };

const renderPicker = (onSelect = vi.fn(), onClose = vi.fn(), onBack = vi.fn()) => {
  render(<TvEpisodePicker isOpen series={seed} onClose={onClose} onBack={onBack} onSelect={onSelect} />);
  return { onSelect, onClose, onBack };
};

const click = (element: HTMLElement) => fireEvent.click(element);

describe("default season and upcoming rules", () => {
  test("picks the latest regular season that has started airing", () => {
    expect(pickDefaultSeason(series.seasons, TODAY)).toBe(2);
    expect(pickDefaultSeason([season(0), season(1), season(2)], TODAY)).toBe(1);
    expect(pickDefaultSeason([season(0)], TODAY)).toBe(0);
    expect(pickDefaultSeason([], TODAY)).toBeNull();
  });

  test("an episode is upcoming only when its air date is known and in the future", () => {
    expect(isUpcomingEpisode({ airDate: "2027-01-01" }, TODAY)).toBe(true);
    expect(isUpcomingEpisode({ airDate: TODAY }, TODAY)).toBe(false);
    expect(isUpcomingEpisode({ airDate: null }, TODAY)).toBe(false);
  });
});

describe("TvEpisodePicker", () => {
  test("loads the seeded series, defaults to the latest aired season and lazy-loads only that season", async () => {
    renderPicker();
    expect(screen.getByRole("heading", { name: "Special Ops: Lioness" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/loading seasons/i);

    await screen.findByTestId("tv-add-episodes-step");
    expect(tmdb.getTvSeries).toHaveBeenCalledWith(199925, expect.anything());
    expect(screen.getByRole("heading", { name: "Special Ops: Lioness" })).toBeInTheDocument();
    expect(screen.getByText(/2023– · Returning Series · 2 seasons/)).toBeInTheDocument();

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Specials1", "Season 13", "Season 23", "Season 33"]);
    expect(screen.getByRole("tab", { name: /season 2/i })).toHaveAttribute("aria-selected", "true");

    await waitFor(() => expect(screen.getAllByTestId("tv-episode-checkbox")).toHaveLength(4));
    expect(tmdb.getTvSeason).toHaveBeenCalledTimes(1);
    expect(tmdb.getTvSeason).toHaveBeenCalledWith(199925, 2, expect.anything());
  });

  test("future-dated episodes are disabled; undated ones stay selectable", async () => {
    renderPicker();
    const boxes = await screen.findAllByTestId("tv-episode-checkbox");
    await waitFor(() => expect(boxes).toHaveLength(4));
    expect(boxes[2]).toBeDisabled();
    expect(boxes[2]).toHaveAccessibleName(/upcoming/);
    expect(screen.getByText(/Upcoming · 2027-03-01/)).toBeInTheDocument();
    expect(boxes[3]).toBeEnabled();
    expect(screen.getByText(/Air date unknown/)).toBeInTheDocument();

    click(screen.getByRole("button", { name: /select all aired/i }));
    expect(boxes.filter((box) => (box as HTMLInputElement).checked)).toHaveLength(3);
    expect(screen.getByText(/3 episodes · S02 · E01, E02, E04/)).toBeInTheDocument();
  });

  test("Season 0 is a separate tab and loads lazily on demand", async () => {
    renderPicker();
    await screen.findAllByTestId("tv-episode-checkbox");

    click(screen.getByRole("tab", { name: /specials/i }));
    await waitFor(() => expect(tmdb.getTvSeason).toHaveBeenCalledWith(199925, 0, expect.anything()));
    await screen.findByText("Behind the scenes");
    expect(screen.getByText(/kept separate from numbered seasons/i)).toBeInTheDocument();
    expect(screen.getAllByTestId("tv-episode-checkbox")).toHaveLength(1);

    // Switching back reuses the cached season — no refetch.
    click(screen.getByRole("tab", { name: /season 2/i }));
    await screen.findByText(/Upcoming · 2027-03-01/);
    expect(tmdb.getTvSeason).toHaveBeenCalledTimes(2);
  });

  test("continue emits the series and the selected episodes in order, across seasons", async () => {
    const onSelect = vi.fn();
    renderPicker(onSelect);
    const boxes = await screen.findAllByTestId("tv-episode-checkbox");

    const continueButton = screen.getByTestId("tv-add-continue");
    expect(continueButton).toBeDisabled();
    click(boxes[1]);
    click(boxes[0]);

    click(screen.getByRole("tab", { name: /season 1/i }));
    const s1 = await screen.findAllByTestId("tv-episode-checkbox");
    click(s1[1]);
    expect(screen.getByText(/3 episodes · S01 · E02 · S02 · E01–E02/)).toBeInTheDocument();

    click(continueButton);
    expect(onSelect).toHaveBeenCalledTimes(1);
    const selection = onSelect.mock.calls[0][0];
    expect(selection.series.seriesTmdbId).toBe(199925);
    expect(selection.episodes.map((item: TvEpisodeDetails) => `${item.seasonNumber}:${item.episodeNumber}`)).toEqual(["1:2", "2:1", "2:2"]);
    expect(selection.episodes.every((item: TvEpisodeDetails) => !("movieId" in item))).toBe(true);
  });

  test("season load failure shows a retry; series load failure can be retried; back returns to search", async () => {
    tmdb.getTvSeason.mockRejectedValueOnce(new Error("down"));
    const { onBack } = renderPicker();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't load this season/i);
    click(within(alert).getByRole("button", { name: /try again/i }));
    await screen.findAllByTestId("tv-episode-checkbox");

    click(screen.getByRole("button", { name: /back to search/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("series load failure offers retry and then recovers", async () => {
    tmdb.getTvSeries.mockRejectedValueOnce(new Error("down"));
    renderPicker();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't load that series/i);
    click(within(alert).getByRole("button", { name: /try again/i }));
    await screen.findByTestId("tv-add-episodes-step");
    expect(tmdb.getTvSeries).toHaveBeenCalledTimes(2);
  });

  test("closing the picker calls onClose", async () => {
    const { onClose } = renderPicker();
    await screen.findByTestId("tv-add-episodes-step");
    click(screen.getByRole("button", { name: /close dialog/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
