import express, { Request, Response } from "express";

const router = express.Router();

type ComingSoonType = "all" | "digital" | "physical" | "streaming";

type TmdbMovie = {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  vote_average?: number;
};

type TmdbMovieDetails = {
  revenue?: number;
  popularity?: number;
  runtime?: number;
  genres?: { id?: number; name?: string }[];
  vote_average?: number;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
};

type TmdbReleaseDateEntry = {
  type?: number;
  release_date?: string;
};

type TmdbReleaseDatesResponse = {
  results?: {
    iso_3166_1?: string;
    release_dates?: TmdbReleaseDateEntry[];
  }[];
};

type WatchmodeSourceType = "sub" | "rent" | "buy" | "free" | "tve";

type WatchmodeSource = {
  source_id?: number;
  name?: string;
  type?: WatchmodeSourceType | string;
  region?: string;
  web_url?: string | null;
  format?: string | null;
  price?: number | null;
};

type WatchmodeReleaseDate = {
  id: number;
  title?: string;
  title_type?: string;
  region?: string;
  type?: "streaming_movie_release" | "streaming_tv_season_release" | "theatrical_release" | string;
  release_date?: string;
  provider_id?: number | null;
};

type WatchmodeTitleListItem = {
  id: number;
  title?: string;
  year?: number;
  imdb_id?: string | null;
  tmdb_id?: number | null;
  tmdb_type?: string | null;
  type?: string;
};

type WatchmodeTitleDetails = {
  id: number;
  title?: string;
  plot_overview?: string | null;
  type?: string;
  year?: number;
  release_date?: string | null;
  imdb_id?: string | null;
  tmdb_id?: number | null;
  tmdb_type?: string | null;
  user_rating?: number | null;
  critic_score?: number | null;
  poster?: string | null;
  posterMedium?: string | null;
  posterLarge?: string | null;
  backdrop?: string | null;
  sources?: WatchmodeSource[];
};

type WatchmodeProvider = {
  id: number;
  name?: string;
  type?: string;
};

type ComingSoonMovie = {
  id: number;
  imdbID: string;
  title: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  release_date: string;
  vote_average: number;
  type: ComingSoonType;
  watchmodeId?: number;
  tmdbId?: number;
  imdbId?: string;
  sources?: WatchmodeSource[];
  sourceNames?: string[];
  sourceTypes?: string[];
  webUrl?: string;
  revenue?: number;
  popularity?: number;
  runtime?: number;
  genres?: string[];
};

type CacheEntry = {
  expiresAt: number;
  data: ComingSoonMovie[];
};

type ImdbLookup = {
  imdbId: string;
  imdbUrl: string;
};

type ImdbLookupCacheEntry = {
  expiresAt: number;
  data: ImdbLookup | null;
};

const SUPPORTED_TYPES = new Set<ComingSoonType>([
  "all",
  "digital",
  "physical",
  "streaming",
]);
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_VERSION = "release-event-window-v3-boxoffice";
const WATCHMODE_BASE_URL = "https://api.watchmode.com/v1";
const WATCHMODE_ENRICH_LIMIT = 24;
const cache = new Map<string, CacheEntry>();
const imdbLookupCache = new Map<number, ImdbLookupCacheEntry>();
const watchmodeDetailsCache = new Map<number, { expiresAt: number; data: WatchmodeTitleDetails }>();
const tmdbReleaseDatesCache = new Map<number, { expiresAt: number; data: TmdbReleaseDatesResponse }>();
const tmdbMovieDetailsCache = new Map<number, { expiresAt: number; data: TmdbMovieDetails | null }>();
let watchmodeProvidersCache: { expiresAt: number; data: Map<number, WatchmodeProvider> } | null = null;

const formatDate = (date: Date) => date.toISOString().slice(0, 10);
const formatWatchmodeDate = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, "");
const RELEASE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeReleaseDateKey = (value: string | undefined | null) => {
  if (!value) return "";
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  const dateKey = value.slice(0, 10);
  return RELEASE_DATE_PATTERN.test(dateKey) ? dateKey : "";
};

const buildTmdbUrl = (path: string, params: Record<string, string | number | undefined>) => {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
};

const buildWatchmodeUrl = (path: string, params: Record<string, string | number | undefined>) => {
  const url = new URL(`${WATCHMODE_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
};

const fetchTmdb = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`TMDb ${response.status}: ${body}`);
  }
  return response.json() as Promise<T>;
};

const getReleaseWindow = (days: number) => {
  const today = new Date();
  const maxDate = new Date(today);
  maxDate.setUTCDate(maxDate.getUTCDate() + days);

  return {
    todayKey: formatDate(today),
    maxDateKey: formatDate(maxDate),
  };
};

const isWithinReleaseWindow = (releaseDate: string | undefined, days: number) => {
  if (!releaseDate || !RELEASE_DATE_PATTERN.test(releaseDate)) return false;
  const parsedDate = new Date(`${releaseDate}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || formatDate(parsedDate) !== releaseDate) {
    return false;
  }

  const { todayKey, maxDateKey } = getReleaseWindow(days);
  return releaseDate >= todayKey && releaseDate <= maxDateKey;
};

const filterComingSoonReleaseWindow = (movies: ComingSoonMovie[], days: number) =>
  movies
    // Coming Soon must only return dated release events from today through the requested future window.
    .filter((movie) => isWithinReleaseWindow(movie.release_date, days))
    .sort((a, b) => {
      const dateCompare = a.release_date.localeCompare(b.release_date);
      if (dateCompare !== 0) return dateCompare;
      return Number(b.vote_average || 0) - Number(a.vote_average || 0);
    });

const logComingSoonDebug = (details: Record<string, unknown>) => {
  if (process.env.NODE_ENV !== "production") {
    console.info("[coming-soon]", details);
  }
};

const fetchWatchmode = async <T>(url: string, apiKey: string): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      "X-API-Key": apiKey,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Watchmode ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
};

const normalizeMovie = (
  movie: TmdbMovie,
  type: ComingSoonType,
  releaseDate?: string
): ComingSoonMovie => ({
  id: movie.id,
  imdbID: `tmdb-${movie.id}`,
  title: movie.title || movie.name || "Untitled movie",
  overview: movie.overview || "",
  poster_path: movie.poster_path || "",
  backdrop_path: movie.backdrop_path || "",
  release_date: releaseDate || movie.release_date || "",
  vote_average: Number(movie.vote_average || 0),
  type,
  tmdbId: movie.id,
});

const getWatchmodeSourceTypes = (type: ComingSoonType): WatchmodeSourceType[] => {
  if (type === "streaming") return ["sub", "free"];
  if (type === "digital") return ["rent", "buy"];
  return ["sub", "rent", "buy", "free"];
};

const getWatchmodeType = (
  sourceTypes: string[],
  requestedType: ComingSoonType
): ComingSoonType => {
  if (requestedType === "streaming" || requestedType === "digital") return requestedType;
  if (sourceTypes.some((sourceType) => sourceType === "sub" || sourceType === "free")) {
    return "streaming";
  }
  if (sourceTypes.some((sourceType) => sourceType === "rent" || sourceType === "buy")) {
    return "digital";
  }
  return "all";
};

const getUniqueStrings = (values: (string | undefined | null)[]) =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value))));

const getPrimaryWebUrl = (sources: WatchmodeSource[]) =>
  sources.find((source) => typeof source.web_url === "string" && source.web_url.startsWith("http"))
    ?.web_url;

const getWatchmodeProviders = async (apiKey: string, region: string) => {
  if (watchmodeProvidersCache && watchmodeProvidersCache.expiresAt > Date.now()) {
    return watchmodeProvidersCache.data;
  }

  const providers = await fetchWatchmode<WatchmodeProvider[]>(
    buildWatchmodeUrl("/sources", { regions: region }),
    apiKey
  );
  const providerMap = new Map<number, WatchmodeProvider>();
  providers.forEach((provider) => {
    if (provider.id) {
      providerMap.set(provider.id, provider);
    }
  });

  watchmodeProvidersCache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data: providerMap,
  };
  return providerMap;
};

const getWatchmodeDetails = async (apiKey: string, watchmodeId: number, region: string) => {
  const cached = watchmodeDetailsCache.get(watchmodeId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const details = await fetchWatchmode<WatchmodeTitleDetails>(
    buildWatchmodeUrl(`/title/${watchmodeId}/details`, {
      append_to_response: "sources",
      regions: region,
    }),
    apiKey
  );

  watchmodeDetailsCache.set(watchmodeId, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data: details,
  });
  return details;
};

const normalizeWatchmodeMovie = (
  base: WatchmodeReleaseDate | WatchmodeTitleListItem,
  details: WatchmodeTitleDetails | null,
  fallbackSources: WatchmodeSource[],
  requestedType: ComingSoonType,
  allowedSourceTypes: WatchmodeSourceType[],
  releaseDate?: string
): ComingSoonMovie | null => {
  const allSources = [...(details?.sources || []), ...fallbackSources];
  const isReleaseEvent = "release_date" in base;
  const filteredSources = allSources.filter((source) =>
    allowedSourceTypes.includes(source.type as WatchmodeSourceType)
  );
  const sources = isReleaseEvent ? allSources : filteredSources;

  if (sources.length === 0) {
    return null;
  }

  const sourceNames = getUniqueStrings(sources.map((source) => source.name));
  const sourceTypes = getUniqueStrings(sources.map((source) => source.type));
  const watchmodeId = base.id;
  const tmdbId = details?.tmdb_id || ("tmdb_id" in base ? base.tmdb_id || undefined : undefined);
  const imdbId = details?.imdb_id || ("imdb_id" in base ? base.imdb_id || undefined : undefined);
  const title = details?.title || base.title || "Untitled movie";

  return {
    id: tmdbId || watchmodeId,
    imdbID: imdbId || `watchmode-${watchmodeId}`,
    title,
    overview: details?.plot_overview || "",
    poster_path: details?.posterLarge || details?.posterMedium || details?.poster || "",
    backdrop_path: details?.backdrop || "",
    release_date: normalizeReleaseDateKey(releaseDate),
    vote_average: Number(details?.user_rating || 0),
    type: requestedType === "streaming" || isReleaseEvent
      ? "streaming"
      : getWatchmodeType(sourceTypes, requestedType),
    watchmodeId,
    tmdbId,
    imdbId: imdbId || undefined,
    sources,
    sourceNames,
    sourceTypes,
    webUrl: getPrimaryWebUrl(sources),
  };
};

const getTmdbMovieDetails = async (apiKey: string, tmdbId: number) => {
  const cached = tmdbMovieDetailsCache.get(tmdbId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const data = await fetchTmdb<TmdbMovieDetails>(
    buildTmdbUrl(`/movie/${tmdbId}`, { api_key: apiKey, language: "en-US" })
  ).catch(() => null);

  tmdbMovieDetailsCache.set(tmdbId, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data,
  });
  return data;
};

const enrichWithBoxOffice = async (movies: ComingSoonMovie[]) => {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return movies;

  return Promise.all(
    movies.map(async (movie) => {
      if (!movie.tmdbId) return movie;
      const details = await getTmdbMovieDetails(apiKey, movie.tmdbId);
      if (!details) return movie;

      return {
        ...movie,
        overview: movie.overview || details.overview || "",
        poster_path:
          movie.poster_path ||
          (details.poster_path
            ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
            : ""),
        backdrop_path:
          movie.backdrop_path ||
          (details.backdrop_path
            ? `https://image.tmdb.org/t/p/original${details.backdrop_path}`
            : ""),
        vote_average: Number(details.vote_average || movie.vote_average || 0),
        revenue: Number(details.revenue || 0),
        popularity: Number(details.popularity || 0),
        runtime: Number(details.runtime || 0) || undefined,
        genres: (details.genres || [])
          .map((genre) => genre.name)
          .filter((name): name is string => Boolean(name))
          .slice(0, 3),
      };
    })
  );
};

const fetchWatchmodeComingSoon = async (
  apiKey: string,
  region: string,
  days: number,
  type: ComingSoonType
) => {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setUTCDate(endDate.getUTCDate() + days);
  const start = formatWatchmodeDate(today);
  const end = formatWatchmodeDate(endDate);
  const allowedSourceTypes = getWatchmodeSourceTypes(type);
  const providers = await getWatchmodeProviders(apiKey, region);

  const releaseDates = await fetchWatchmode<WatchmodeReleaseDate[]>(
    buildWatchmodeUrl("/title-release-dates", {
      start_date: start,
      end_date: end,
      regions: region,
    }),
    apiKey
  );

  const movieReleases = releaseDates
    .filter((release) => release.title_type === "movie")
    .filter((release) => release.type === "streaming_movie_release")
    .filter((release) => release.provider_id)
    .slice(0, WATCHMODE_ENRICH_LIMIT);

  const movies = await Promise.all(
    movieReleases.map(async (release) => {
      const provider = release.provider_id ? providers.get(release.provider_id) : undefined;
      const fallbackSources: WatchmodeSource[] = [
        {
          source_id: release.provider_id || undefined,
          name: provider?.name,
          type: provider?.type === "purchase" ? "buy" : provider?.type,
          region,
        },
      ];
      const details = await getWatchmodeDetails(apiKey, release.id, region).catch(() => null);
      return normalizeWatchmodeMovie(
        release,
        details,
        fallbackSources,
        type,
        allowedSourceTypes,
        release.release_date
      );
    })
  );

  const normalizedMovies = movies.filter((movie): movie is ComingSoonMovie => Boolean(movie));
  const enrichedMovies = await enrichWithBoxOffice(normalizedMovies);
  const filteredMovies = filterComingSoonReleaseWindow(enrichedMovies, days);
  logComingSoonDebug({
    type,
    region,
    source: "watchmode:title-release-dates",
    sourceCount: releaseDates.length,
    normalizedCount: normalizedMovies.length,
    filteredCount: filteredMovies.length,
  });

  // /list-titles returns currently available/popular catalog items, not strict upcoming
  // availability events, so it is intentionally not used as a Coming Soon fallback.
  return filteredMovies;
};

const getStreamingProviderIds = async (apiKey: string, region: string) => {
  const url = buildTmdbUrl("/watch/providers/movie", {
    api_key: apiKey,
    watch_region: region,
    language: "en-US",
  });
  const data = await fetchTmdb<{ results?: { provider_id: number }[] }>(url);
  return (data.results || [])
    .map((provider) => provider.provider_id)
    .filter(Boolean)
    .slice(0, 12);
};

const getTmdbReleaseDates = async (apiKey: string, movieId: number) => {
  const cached = tmdbReleaseDatesCache.get(movieId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const data = await fetchTmdb<TmdbReleaseDatesResponse>(
    buildTmdbUrl(`/movie/${movieId}/release_dates`, { api_key: apiKey })
  );
  tmdbReleaseDatesCache.set(movieId, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data,
  });
  return data;
};

const getTmdbReleaseEventDate = async (
  apiKey: string,
  movieId: number,
  region: string,
  releaseType: number,
  days: number
) => {
  const data = await getTmdbReleaseDates(apiKey, movieId);
  const regionRelease = (data.results || []).find(
    (release) => release.iso_3166_1?.toUpperCase() === region
  );

  const eventDates = (regionRelease?.release_dates || [])
    .filter((release) => release.type === releaseType)
    .map((release) => normalizeReleaseDateKey(release.release_date))
    .filter((releaseDate) => isWithinReleaseWindow(releaseDate, days))
    .sort();

  return eventDates[0] || "";
};

const discoverMovies = async (
  apiKey: string,
  region: string,
  days: number,
  type: ComingSoonType
) => {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setUTCDate(endDate.getUTCDate() + days);

  const start = formatDate(today);
  const end = formatDate(endDate);
  const baseParams: Record<string, string | number | undefined> = {
    api_key: apiKey,
    language: "en-US",
    region,
    include_adult: "false",
    sort_by: "popularity.desc",
    "release_date.gte": start,
    "release_date.lte": end,
  };

  if (type === "digital") {
    baseParams.with_release_type = 4;
  }

  if (type === "physical") {
    baseParams.with_release_type = 5;
  }

  if (type !== "digital" && type !== "physical") {
    baseParams["primary_release_date.gte"] = start;
    baseParams["primary_release_date.lte"] = end;
  }

  if (type === "streaming") {
    const providerIds = await getStreamingProviderIds(apiKey, region);
    baseParams.watch_region = region;
    baseParams.with_watch_monetization_types = "flatrate";
    if (providerIds.length > 0) {
      baseParams.with_watch_providers = providerIds.join("|");
    }
    // TMDb watch-provider data is useful for streaming discovery, but it does
    // not reliably expose exact future streaming release dates for every movie.
  }

  const pages = [1, 2];
  const responses = await Promise.all(
    pages.map((page) =>
      fetchTmdb<{ results?: TmdbMovie[] }>(
        buildTmdbUrl("/discover/movie", { ...baseParams, page })
      )
    )
  );

  const deduped = new Map<number, ComingSoonMovie>();
  const candidates = responses
    .flatMap((response) => response.results || [])
    .filter((movie) => movie.id)
    .filter((movie) => {
      if (type === "digital" || type === "physical") return true;
      return movie.release_date && movie.release_date >= start && movie.release_date <= end;
    });

  const releaseType = type === "digital" ? 4 : type === "physical" ? 5 : undefined;
  const moviesWithEventDates = await Promise.all(
    candidates.map(async (movie) => {
      const eventDate = releaseType
        ? await getTmdbReleaseEventDate(apiKey, movie.id, region, releaseType, days).catch(
            () => ""
          )
        : movie.release_date || "";
      return { movie, eventDate };
    })
  );

  moviesWithEventDates
    .filter(({ eventDate }) => isWithinReleaseWindow(eventDate, days))
    .forEach(({ movie, eventDate }) => {
      if (!deduped.has(movie.id)) {
        deduped.set(movie.id, normalizeMovie(movie, type, eventDate));
      }
    });

  const enrichedMovies = await enrichWithBoxOffice(Array.from(deduped.values()));
  const filteredMovies = filterComingSoonReleaseWindow(enrichedMovies, days);
  logComingSoonDebug({
    type,
    region,
    source: "tmdb:discover",
    sourceCount: candidates.length,
    normalizedCount: deduped.size,
    filteredCount: filteredMovies.length,
  });

  return filteredMovies;
};

const getDedupeKey = (movie: ComingSoonMovie) => {
  if (movie.tmdbId) return `tmdb:${movie.tmdbId}`;
  if (movie.imdbId) return `imdb:${movie.imdbId}`;
  if (movie.watchmodeId) return `watchmode:${movie.watchmodeId}`;
  return `title:${movie.title.toLowerCase()}:${movie.release_date}`;
};

const combineComingSoonMovies = (groups: ComingSoonMovie[][], days: number) => {
  const deduped = new Map<string, ComingSoonMovie>();

  groups.flat().forEach((movie) => {
    const key = getDedupeKey(movie);
    const existing = deduped.get(key);
    if (!existing || Number(movie.vote_average || 0) > Number(existing.vote_average || 0)) {
      deduped.set(key, movie);
    }
  });

  return filterComingSoonReleaseWindow(Array.from(deduped.values()), days);
};

router.get("/:tmdbId/imdb", async (req: Request, res: Response) => {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    res.status(500).json({ msg: "TMDb API key is not configured on the server." });
    return;
  }

  const tmdbId = Number(req.params.tmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    res.status(400).json({ msg: "A valid TMDb movie ID is required." });
    return;
  }

  const cached = imdbLookupCache.get(tmdbId);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.data) {
      res.json(cached.data);
      return;
    }

    res.status(404).json({ msg: "IMDb page is not available for this movie yet." });
    return;
  }

  try {
    const data = await fetchTmdb<{ imdb_id?: string | null }>(
      buildTmdbUrl(`/movie/${tmdbId}/external_ids`, { api_key: apiKey })
    );
    const imdbId = data.imdb_id || "";
    const imdbLookup = imdbId.startsWith("tt")
      ? {
          imdbId,
          imdbUrl: `https://www.imdb.com/title/${imdbId}/`,
        }
      : null;

    imdbLookupCache.set(tmdbId, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: imdbLookup,
    });

    if (!imdbLookup) {
      res.status(404).json({ msg: "IMDb page is not available for this movie yet." });
      return;
    }

    res.json(imdbLookup);
  } catch (error) {
    console.error("Failed to fetch IMDb ID from TMDb:", error);
    res.status(502).json({
      msg: "Failed to fetch IMDb ID from TMDb.",
    });
  }
});

router.get("/", async (req: Request, res: Response) => {
  const region = String(req.query.region || process.env.WATCHMODE_REGION || "CA")
    .trim()
    .toUpperCase() || "CA";
  const parsedDays = Number(req.query.days || 30);
  const days = Number.isFinite(parsedDays)
    ? Math.min(Math.max(Math.round(parsedDays), 1), 90)
    : 30;
  const requestedType = String(req.query.type || "all").toLowerCase() as ComingSoonType;
  const type = SUPPORTED_TYPES.has(requestedType) ? requestedType : "all";
  const cacheKey = `${CACHE_VERSION}:${region}:${days}:${type}`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.data);
    return;
  }

  try {
    if (type === "digital" || type === "physical") {
      const tmdbApiKey = process.env.TMDB_API_KEY;
      if (!tmdbApiKey) {
        res.status(500).json({ msg: "TMDb API key is not configured on the server." });
        return;
      }

      const movies = filterComingSoonReleaseWindow(
        await discoverMovies(tmdbApiKey, region, days, type),
        days
      );
      cache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data: movies,
      });
      res.json(movies);
      return;
    }

    if (type === "streaming") {
      const watchmodeApiKey = process.env.WATCHMODE_API_KEY;
      const tmdbApiKey = process.env.TMDB_API_KEY;
      if (!watchmodeApiKey && !tmdbApiKey) {
        res.status(500).json({ msg: "Watchmode API key is not configured on the server." });
        return;
      }

      let streamingMovies: ComingSoonMovie[] = [];
      if (watchmodeApiKey) {
        streamingMovies = await fetchWatchmodeComingSoon(
          watchmodeApiKey,
          region,
          days,
          type
        ).catch((error) => {
          console.warn("Watchmode streaming release events unavailable:", error);
          return [];
        });
      }

      // Watchmode's release-dates endpoint requires a paid plan; TMDB digital
      // release events are the closest free equivalent for home availability.
      if (streamingMovies.length === 0 && tmdbApiKey) {
        streamingMovies = await discoverMovies(tmdbApiKey, region, days, "digital");
      }

      const movies = filterComingSoonReleaseWindow(streamingMovies, days);
      cache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data: movies,
      });
      res.json(movies);
      return;
    }

    const watchmodeApiKey = process.env.WATCHMODE_API_KEY;
    if (!watchmodeApiKey) {
      res.status(500).json({ msg: "Watchmode API key is not configured on the server." });
      return;
    }

    const tmdbApiKey = process.env.TMDB_API_KEY;
    const digitalMovies = tmdbApiKey
      ? await discoverMovies(tmdbApiKey, region, days, "digital")
      : [];
    const physicalMovies = tmdbApiKey
      ? await discoverMovies(tmdbApiKey, region, days, "physical")
      : [];
    const streamingMovies = await fetchWatchmodeComingSoon(
      watchmodeApiKey,
      region,
      days,
      "streaming"
    ).catch((error) => {
      console.warn("Watchmode streaming release events unavailable for combined results:", error);
      return [];
    });
    const movies = combineComingSoonMovies(
      [digitalMovies, physicalMovies, streamingMovies],
      days
    );
    logComingSoonDebug({
      type,
      region,
      source: "combined",
      sourceCount: digitalMovies.length + physicalMovies.length + streamingMovies.length,
      normalizedCount: movies.length,
      filteredCount: movies.length,
    });
    cache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: movies,
    });
    res.json(movies);
  } catch (error) {
    console.error("Failed to fetch coming soon movies:", error);
    res.status(502).json({
      msg: "Failed to fetch coming soon movies.",
    });
  }
});

export default router;
