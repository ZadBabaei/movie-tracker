/**
 * Typed TMDB client for TV metadata.
 *
 * Existing movie screens talk to TMDB directly (SearchBar, MovieDetailModal,
 * SuggestionsCarousel …) and are intentionally left untouched. New TV code
 * goes through this module so raw TMDB shapes never leak into components.
 *
 * Auth: the same public `VITE_TMDB_API_KEY` the movie code already ships in
 * the bundle, sent as the `api_key` query parameter. Nothing new is exposed.
 *
 * Identity: numeric TMDB ids plus season/episode numbers only — never titles.
 */

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";
const DEFAULT_LANGUAGE = "en-US";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type TmdbErrorKind =
  | "config" // no API key configured
  | "not_found" // 404 — series / season / episode does not exist
  | "unauthorized" // 401 — bad key
  | "rate_limited" // 429
  | "http" // any other non-2xx
  | "network" // fetch rejected (offline, DNS, CORS)
  | "aborted" // caller aborted via AbortSignal
  | "malformed"; // 2xx but the payload lacks required identity fields

export class TmdbError extends Error {
  readonly kind: TmdbErrorKind;
  readonly status?: number;

  constructor(kind: TmdbErrorKind, message: string, status?: number) {
    super(message);
    this.name = "TmdbError";
    this.kind = kind;
    this.status = status;
  }
}

export const isTmdbError = (error: unknown): error is TmdbError => error instanceof TmdbError;

// ---------------------------------------------------------------------------
// App-facing types. Field names mirror the WatchHistoryEntry `tv` snapshot
// (seriesTmdbId, seasonNumber, episodeNumber, episodeTmdbId, seriesTitle,
// episodeTitle, posterPath, backdropPath, stillPath, airDate) so Phase 3 can
// copy straight across. Anything TMDB may omit is `null`, never invented.
// ---------------------------------------------------------------------------

export interface TvGenre {
  id: number;
  name: string;
}

export interface TvNetwork {
  id: number;
  name: string;
  logoPath: string | null;
}

export interface TvImage {
  filePath: string;
  width: number | null;
  height: number | null;
  language: string | null;
  voteAverage: number | null;
}

export interface TvCastMember {
  personTmdbId: number;
  name: string;
  character: string | null;
  profilePath: string | null;
  order: number | null;
}

export interface TvCrewMember {
  personTmdbId: number;
  name: string;
  job: string | null;
  department: string | null;
  profilePath: string | null;
}

export interface TvExternalIds {
  imdbId: string | null;
  tvdbId: number | null;
  wikidataId: string | null;
  facebookId: string | null;
  instagramId: string | null;
  twitterId: string | null;
}

export interface TvSearchResult {
  seriesTmdbId: number;
  seriesTitle: string;
  originalTitle: string | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  firstAirDate: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  popularity: number | null;
  genreIds: number[];
  originCountry: string[];
}

export interface TvSearchPage {
  page: number;
  totalPages: number;
  totalResults: number;
  results: TvSearchResult[];
}

export interface TvSeasonSummary {
  seasonTmdbId: number | null;
  seasonNumber: number;
  name: string;
  overview: string | null;
  posterPath: string | null;
  airDate: string | null;
  episodeCount: number | null;
  voteAverage: number | null;
  /** TMDB numbers specials as season 0. Never fold these into season 1. */
  isSpecials: boolean;
}

export interface TvEpisodeSummary {
  episodeTmdbId: number | null;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string;
  airDate: string | null;
  runtime: number | null;
  stillPath: string | null;
  overview: string | null;
  voteAverage: number | null;
}

export interface TvSeriesDetails {
  seriesTmdbId: number;
  seriesTitle: string;
  originalTitle: string | null;
  tagline: string | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  firstAirDate: string | null;
  lastAirDate: string | null;
  /** TMDB status text, e.g. "Returning Series", "Ended", "Canceled". */
  status: string | null;
  type: string | null;
  inProduction: boolean | null;
  genres: TvGenre[];
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
  /** Typical episode runtime in minutes (TMDB gives a list; first wins). */
  episodeRunTime: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  popularity: number | null;
  originalLanguage: string | null;
  originCountry: string[];
  networks: TvNetwork[];
  createdBy: TvCrewMember[];
  seasons: TvSeasonSummary[];
  lastEpisodeToAir: TvEpisodeSummary | null;
  nextEpisodeToAir: TvEpisodeSummary | null;
  cast: TvCastMember[];
  externalIds: TvExternalIds;
  images: { posters: TvImage[]; backdrops: TvImage[] };
}

export interface TvEpisodeDetails extends TvEpisodeSummary {
  seriesTmdbId: number;
  voteCount: number | null;
  productionCode: string | null;
  cast: TvCastMember[];
  guestStars: TvCastMember[];
  crew: TvCrewMember[];
  /** Only populated by getTvEpisode; season payloads do not carry these. */
  externalIds: TvExternalIds | null;
}

export interface TvSeasonDetails extends TvSeasonSummary {
  seriesTmdbId: number;
  episodes: TvEpisodeDetails[];
}

export interface TmdbRequestOptions {
  signal?: AbortSignal;
  language?: string;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export type TmdbPosterSize = "w185" | "w342" | "w500" | "w780" | "original";
export type TmdbBackdropSize = "w300" | "w780" | "w1280" | "original";
export type TmdbStillSize = "w185" | "w300" | "original";
export type TmdbProfileSize = "w45" | "w185" | "h632" | "original";

/** Absolute image URL, or "" when TMDB has no artwork. Never a placeholder. */
export const tmdbImageUrl = (
  path: string | null | undefined,
  size: TmdbPosterSize | TmdbBackdropSize | TmdbStillSize | TmdbProfileSize = "w500"
): string => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${TMDB_IMAGE_BASE_URL}/${size}${path.startsWith("/") ? path : `/${path}`}`;
};

/** Display label for a season number; season 0 is TMDB's specials bucket. */
export const tvSeasonLabel = (seasonNumber: number, seasonName?: string | null): string => {
  if (seasonNumber === 0) return seasonName?.trim() || "Specials";
  return `Season ${seasonNumber}`;
};

// ---------------------------------------------------------------------------
// Normalizers (exported for tests). Each tolerates a partial or malformed
// payload and only throws when the identity fields are unusable.
// ---------------------------------------------------------------------------

type Raw = Record<string, any>;

const asRecord = (value: unknown): Raw => (value && typeof value === "object" ? (value as Raw) : {});
const asArray = (value: unknown): Raw[] => (Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : []);
const asId = (value: unknown): number | null => (Number.isInteger(value) && (value as number) > 0 ? (value as number) : null);
const asInt = (value: unknown, min = 0): number | null => (Number.isInteger(value) && (value as number) >= min ? (value as number) : null);
const asNumber = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const asText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};
const asPath = (value: unknown): string | null => asText(value);
const asDate = (value: unknown): string | null => {
  const text = asText(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};
const asStrings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const asBoolean = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);

const requireId = (value: unknown, what: string): number => {
  const id = asId(value);
  if (id === null) throw new TmdbError("malformed", `TMDB ${what} payload is missing a numeric id.`);
  return id;
};

const normalizeGenre = (raw: Raw): TvGenre | null => {
  const id = asId(raw.id);
  const name = asText(raw.name);
  return id !== null && name ? { id, name } : null;
};

const normalizeNetwork = (raw: Raw): TvNetwork | null => {
  const id = asId(raw.id);
  const name = asText(raw.name);
  return id !== null && name ? { id, name, logoPath: asPath(raw.logo_path) } : null;
};

const normalizeImage = (raw: Raw): TvImage | null => {
  const filePath = asPath(raw.file_path);
  return filePath
    ? {
        filePath,
        width: asInt(raw.width, 1),
        height: asInt(raw.height, 1),
        language: asText(raw.iso_639_1),
        voteAverage: asNumber(raw.vote_average),
      }
    : null;
};

export const normalizeCastMember = (raw: Raw): TvCastMember | null => {
  const personTmdbId = asId(raw.id);
  const name = asText(raw.name);
  if (personTmdbId === null || !name) return null;
  return {
    personTmdbId,
    name,
    character: asText(raw.character) ?? asText(raw.roles?.[0]?.character),
    profilePath: asPath(raw.profile_path),
    order: asInt(raw.order),
  };
};

export const normalizeCrewMember = (raw: Raw): TvCrewMember | null => {
  const personTmdbId = asId(raw.id);
  const name = asText(raw.name);
  if (personTmdbId === null || !name) return null;
  return {
    personTmdbId,
    name,
    job: asText(raw.job) ?? asText(raw.jobs?.[0]?.job),
    department: asText(raw.department),
    profilePath: asPath(raw.profile_path),
  };
};

const compact = <T>(items: Array<T | null>): T[] => items.filter((item): item is T => item !== null);

export const normalizeExternalIds = (raw: unknown): TvExternalIds => {
  const ids = asRecord(raw);
  const imdbId = asText(ids.imdb_id);
  return {
    imdbId: imdbId && /^tt\d+$/.test(imdbId) ? imdbId : null,
    tvdbId: asId(ids.tvdb_id),
    wikidataId: asText(ids.wikidata_id),
    facebookId: asText(ids.facebook_id),
    instagramId: asText(ids.instagram_id),
    twitterId: asText(ids.twitter_id),
  };
};

export const normalizeTvSearchResult = (raw: unknown): TvSearchResult | null => {
  const item = asRecord(raw);
  const seriesTmdbId = asId(item.id);
  const seriesTitle = asText(item.name) ?? asText(item.original_name);
  if (seriesTmdbId === null || !seriesTitle) return null;
  return {
    seriesTmdbId,
    seriesTitle,
    originalTitle: asText(item.original_name),
    overview: asText(item.overview),
    posterPath: asPath(item.poster_path),
    backdropPath: asPath(item.backdrop_path),
    firstAirDate: asDate(item.first_air_date),
    voteAverage: asNumber(item.vote_average),
    voteCount: asInt(item.vote_count),
    popularity: asNumber(item.popularity),
    genreIds: (Array.isArray(item.genre_ids) ? item.genre_ids : []).filter((id: unknown) => asId(id) !== null),
    originCountry: asStrings(item.origin_country),
  };
};

export const normalizeTvSearchPage = (raw: unknown): TvSearchPage => {
  const page = asRecord(raw);
  return {
    page: asInt(page.page, 1) ?? 1,
    totalPages: asInt(page.total_pages) ?? 0,
    totalResults: asInt(page.total_results) ?? 0,
    results: compact(asArray(page.results).map(normalizeTvSearchResult)),
  };
};

export const normalizeTvSeasonSummary = (raw: unknown): TvSeasonSummary | null => {
  const season = asRecord(raw);
  const seasonNumber = asInt(season.season_number);
  if (seasonNumber === null) return null;
  return {
    seasonTmdbId: asId(season.id),
    seasonNumber,
    name: asText(season.name) ?? tvSeasonLabel(seasonNumber),
    overview: asText(season.overview),
    posterPath: asPath(season.poster_path),
    airDate: asDate(season.air_date),
    episodeCount: asInt(season.episode_count) ?? (Array.isArray(season.episodes) ? season.episodes.length : null),
    voteAverage: asNumber(season.vote_average),
    isSpecials: seasonNumber === 0,
  };
};

export const normalizeTvEpisodeSummary = (raw: unknown): TvEpisodeSummary | null => {
  const episode = asRecord(raw);
  const seasonNumber = asInt(episode.season_number);
  const episodeNumber = asInt(episode.episode_number, 1);
  if (seasonNumber === null || episodeNumber === null) return null;
  return {
    episodeTmdbId: asId(episode.id),
    seasonNumber,
    episodeNumber,
    episodeTitle: asText(episode.name) ?? `Episode ${episodeNumber}`,
    airDate: asDate(episode.air_date),
    runtime: asInt(episode.runtime, 1),
    stillPath: asPath(episode.still_path),
    overview: asText(episode.overview),
    voteAverage: asNumber(episode.vote_average),
  };
};

export const normalizeTvEpisodeDetails = (raw: unknown, seriesTmdbId: number): TvEpisodeDetails => {
  const episode = asRecord(raw);
  const summary = normalizeTvEpisodeSummary(episode);
  if (!summary) throw new TmdbError("malformed", "TMDB episode payload is missing season/episode numbers.");
  const credits = asRecord(episode.credits);
  // Episode credits: `credits.cast` is the regular cast, guest stars may be at
  // the top level (season payloads) or under credits (episode endpoint).
  const guestStars = asArray(episode.guest_stars).length ? asArray(episode.guest_stars) : asArray(credits.guest_stars);
  const crew = asArray(episode.crew).length ? asArray(episode.crew) : asArray(credits.crew);
  return {
    ...summary,
    seriesTmdbId,
    voteCount: asInt(episode.vote_count),
    productionCode: asText(episode.production_code),
    cast: compact(asArray(credits.cast).map(normalizeCastMember)),
    guestStars: compact(guestStars.map(normalizeCastMember)),
    crew: compact(crew.map(normalizeCrewMember)),
    externalIds: episode.external_ids && typeof episode.external_ids === "object" ? normalizeExternalIds(episode.external_ids) : null,
  };
};

export const normalizeTvSeasonDetails = (raw: unknown, seriesTmdbId: number): TvSeasonDetails => {
  const season = asRecord(raw);
  const summary = normalizeTvSeasonSummary(season);
  if (!summary) throw new TmdbError("malformed", "TMDB season payload is missing a season number.");
  const episodes = compact(
    asArray(season.episodes).map((episode) => {
      try {
        return normalizeTvEpisodeDetails(episode, seriesTmdbId);
      } catch {
        return null;
      }
    })
  ).sort((a, b) => a.episodeNumber - b.episodeNumber);
  return { ...summary, seriesTmdbId, episodeCount: episodes.length || summary.episodeCount, episodes };
};

export const normalizeTvSeriesDetails = (raw: unknown): TvSeriesDetails => {
  const series = asRecord(raw);
  const seriesTmdbId = requireId(series.id, "series");
  const seriesTitle = asText(series.name) ?? asText(series.original_name);
  if (!seriesTitle) throw new TmdbError("malformed", "TMDB series payload is missing a name.");
  const credits = asRecord(series.credits);
  const images = asRecord(series.images);
  const runTimes = Array.isArray(series.episode_run_time) ? series.episode_run_time : [];
  return {
    seriesTmdbId,
    seriesTitle,
    originalTitle: asText(series.original_name),
    tagline: asText(series.tagline),
    overview: asText(series.overview),
    posterPath: asPath(series.poster_path),
    backdropPath: asPath(series.backdrop_path),
    firstAirDate: asDate(series.first_air_date),
    lastAirDate: asDate(series.last_air_date),
    status: asText(series.status),
    type: asText(series.type),
    inProduction: asBoolean(series.in_production),
    genres: compact(asArray(series.genres).map(normalizeGenre)),
    numberOfSeasons: asInt(series.number_of_seasons),
    numberOfEpisodes: asInt(series.number_of_episodes),
    episodeRunTime: runTimes.map((value: unknown) => asInt(value, 1)).find((value: number | null) => value !== null) ?? null,
    voteAverage: asNumber(series.vote_average),
    voteCount: asInt(series.vote_count),
    popularity: asNumber(series.popularity),
    originalLanguage: asText(series.original_language),
    originCountry: asStrings(series.origin_country),
    networks: compact(asArray(series.networks).map(normalizeNetwork)),
    createdBy: compact(asArray(series.created_by).map(normalizeCrewMember)),
    seasons: compact(asArray(series.seasons).map(normalizeTvSeasonSummary)).sort((a, b) => a.seasonNumber - b.seasonNumber),
    lastEpisodeToAir: normalizeTvEpisodeSummary(series.last_episode_to_air),
    nextEpisodeToAir: normalizeTvEpisodeSummary(series.next_episode_to_air),
    cast: compact(asArray(credits.cast).map(normalizeCastMember)),
    externalIds: normalizeExternalIds(series.external_ids),
    images: {
      posters: compact(asArray(images.posters).map(normalizeImage)),
      backdrops: compact(asArray(images.backdrops).map(normalizeImage)),
    },
  };
};

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

const getApiKey = () => import.meta.env.VITE_TMDB_API_KEY || "";

const buildUrl = (path: string, params: Record<string, string | number | undefined>) => {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", getApiKey());
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  });
  return url.toString();
};

// Identical GETs issued while one is still in flight share a single request
// (Phase 3 will fetch a series and its season concurrently from sibling
// components). Nothing is retained once the request settles.
const inFlight = new Map<string, Promise<unknown>>();

const tmdbGet = async <T>(path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T> => {
  if (!getApiKey()) throw new TmdbError("config", "TMDB API key is not configured (VITE_TMDB_API_KEY).");
  const url = buildUrl(path, params);

  const existing = inFlight.get(url);
  if (existing && !signal) return existing as Promise<T>;

  const request = (async () => {
    let response: Response;
    try {
      response = await fetch(url, { signal, headers: { Accept: "application/json" } });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") throw new TmdbError("aborted", "TMDB request aborted.");
      throw new TmdbError("network", `TMDB request failed: ${(error as Error)?.message || "network error"}`);
    }
    if (!response.ok) {
      let detail = "";
      try {
        detail = asText(asRecord(await response.json()).status_message) ?? "";
      } catch {
        detail = "";
      }
      const message = detail || `TMDB responded with HTTP ${response.status}.`;
      if (response.status === 404) throw new TmdbError("not_found", message, 404);
      if (response.status === 401) throw new TmdbError("unauthorized", message, 401);
      if (response.status === 429) throw new TmdbError("rate_limited", message, 429);
      throw new TmdbError("http", message, response.status);
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new TmdbError("malformed", "TMDB returned a non-JSON body.", response.status);
    }
  })();

  if (!signal) {
    inFlight.set(url, request);
    request.finally(() => inFlight.delete(url)).catch(() => undefined);
  }
  return request;
};

// ---------------------------------------------------------------------------
// Public TV operations
// ---------------------------------------------------------------------------

export interface SearchTvOptions extends TmdbRequestOptions {
  page?: number;
  includeAdult?: boolean;
  firstAirDateYear?: number;
}

// ---------------------------------------------------------------------------
// Mixed movie + TV search (history "Add to History" only). Movie-only
// surfaces keep using their own /search/movie call.
// ---------------------------------------------------------------------------

export type MediaSearchKind = "movie" | "tv";

export interface MediaSearchResult {
  kind: MediaSearchKind;
  tmdbId: number;
  title: string;
  originalTitle: string | null;
  year: number | null;
  /** Full release / first-air date when TMDB has it. */
  date: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  voteAverage: number | null;
  popularity: number | null;
  originCountry: string[];
}

export interface MediaSearchPage {
  page: number;
  totalPages: number;
  totalResults: number;
  results: MediaSearchResult[];
}

/** One /search/multi row → app result; people and unknown kinds → null. */
export const normalizeMediaSearchResult = (raw: unknown): MediaSearchResult | null => {
  const item = asRecord(raw);
  const kind = item.media_type === "movie" || item.media_type === "tv" ? (item.media_type as MediaSearchKind) : null;
  const tmdbId = asId(item.id);
  if (!kind || tmdbId === null) return null;
  const title = kind === "movie" ? asText(item.title) ?? asText(item.original_title) : asText(item.name) ?? asText(item.original_name);
  if (!title) return null;
  const date = asDate(kind === "movie" ? item.release_date : item.first_air_date);
  return {
    kind,
    tmdbId,
    title,
    originalTitle: kind === "movie" ? asText(item.original_title) : asText(item.original_name),
    year: date ? Number(date.slice(0, 4)) : null,
    date,
    posterPath: asPath(item.poster_path),
    backdropPath: asPath(item.backdrop_path),
    overview: asText(item.overview),
    voteAverage: asNumber(item.vote_average),
    popularity: asNumber(item.popularity),
    originCountry: asStrings(item.origin_country),
  };
};

export const normalizeMediaSearchPage = (raw: unknown): MediaSearchPage => {
  const page = asRecord(raw);
  return {
    page: asInt(page.page, 1) ?? 1,
    totalPages: asInt(page.total_pages) ?? 0,
    totalResults: asInt(page.total_results) ?? 0,
    results: compact(asArray(page.results).map(normalizeMediaSearchResult)),
  };
};

export interface SearchMediaOptions extends TmdbRequestOptions {
  page?: number;
  includeAdult?: boolean;
}

/**
 * GET /search/multi — one provider-ranked list of movies and TV series.
 * People and other kinds are dropped. Blank queries resolve to an empty page.
 */
export const searchMedia = async (query: string, options: SearchMediaOptions = {}): Promise<MediaSearchPage> => {
  const trimmed = query.trim();
  if (!trimmed) return { page: 1, totalPages: 0, totalResults: 0, results: [] };
  const raw = await tmdbGet<unknown>(
    "/search/multi",
    {
      query: trimmed,
      page: options.page,
      include_adult: options.includeAdult ? "true" : "false",
      language: options.language ?? DEFAULT_LANGUAGE,
    },
    options.signal
  );
  return normalizeMediaSearchPage(raw);
};

/** GET /search/tv — empty or whitespace queries resolve to an empty page. */
export const searchTv = async (query: string, options: SearchTvOptions = {}): Promise<TvSearchPage> => {
  const trimmed = query.trim();
  if (!trimmed) return { page: 1, totalPages: 0, totalResults: 0, results: [] };
  const raw = await tmdbGet<unknown>(
    "/search/tv",
    {
      query: trimmed,
      page: options.page,
      include_adult: options.includeAdult ? "true" : "false",
      first_air_date_year: options.firstAirDateYear,
      language: options.language ?? DEFAULT_LANGUAGE,
    },
    options.signal
  );
  return normalizeTvSearchPage(raw);
};

/**
 * GET /tv/{id} with credits, external_ids and images appended — one request
 * covers the series page hero, metadata, cast carousel and season list.
 */
export const getTvSeries = async (seriesTmdbId: number, options: TmdbRequestOptions = {}): Promise<TvSeriesDetails> => {
  const raw = await tmdbGet<unknown>(
    `/tv/${encodeURIComponent(seriesTmdbId)}`,
    {
      append_to_response: "credits,external_ids,images",
      include_image_language: "en,null",
      language: options.language ?? DEFAULT_LANGUAGE,
    },
    options.signal
  );
  const details = normalizeTvSeriesDetails(raw);
  if (details.seriesTmdbId !== seriesTmdbId) {
    throw new TmdbError("malformed", `TMDB returned series ${details.seriesTmdbId} for request ${seriesTmdbId}.`);
  }
  return details;
};

/**
 * GET /tv/{id}/season/{n} — includes every episode with its crew and guest
 * stars, so listing a season needs no per-episode requests. Season 0 is the
 * specials bucket and is returned as-is with `isSpecials: true`.
 */
export const getTvSeason = async (
  seriesTmdbId: number,
  seasonNumber: number,
  options: TmdbRequestOptions = {}
): Promise<TvSeasonDetails> => {
  const raw = await tmdbGet<unknown>(
    `/tv/${encodeURIComponent(seriesTmdbId)}/season/${encodeURIComponent(seasonNumber)}`,
    { language: options.language ?? DEFAULT_LANGUAGE },
    options.signal
  );
  const season = normalizeTvSeasonDetails(raw, seriesTmdbId);
  if (season.seasonNumber !== seasonNumber) {
    throw new TmdbError("malformed", `TMDB returned season ${season.seasonNumber} for request ${seasonNumber}.`);
  }
  return season;
};

/** GET /tv/{id}/season/{s}/episode/{e} with credits and external_ids appended. */
export const getTvEpisode = async (
  seriesTmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  options: TmdbRequestOptions = {}
): Promise<TvEpisodeDetails> => {
  const raw = await tmdbGet<unknown>(
    `/tv/${encodeURIComponent(seriesTmdbId)}/season/${encodeURIComponent(seasonNumber)}/episode/${encodeURIComponent(episodeNumber)}`,
    { append_to_response: "credits,external_ids", language: options.language ?? DEFAULT_LANGUAGE },
    options.signal
  );
  const episode = normalizeTvEpisodeDetails(raw, seriesTmdbId);
  if (episode.seasonNumber !== seasonNumber || episode.episodeNumber !== episodeNumber) {
    throw new TmdbError(
      "malformed",
      `TMDB returned S${episode.seasonNumber}E${episode.episodeNumber} for request S${seasonNumber}E${episodeNumber}.`
    );
  }
  return episode;
};

/** GET /tv/{id}/external_ids on its own, for callers that only need ids. */
export const getTvSeriesExternalIds = async (seriesTmdbId: number, options: TmdbRequestOptions = {}): Promise<TvExternalIds> => {
  const raw = await tmdbGet<unknown>(`/tv/${encodeURIComponent(seriesTmdbId)}/external_ids`, {}, options.signal);
  return normalizeExternalIds(raw);
};
