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
const CACHE_VERSION = "release-window-v1";
const WATCHMODE_BASE_URL = "https://api.watchmode.com/v1";
const WATCHMODE_ENRICH_LIMIT = 24;
const cache = new Map<string, CacheEntry>();
const imdbLookupCache = new Map<number, ImdbLookupCacheEntry>();
const watchmodeDetailsCache = new Map<number, { expiresAt: number; data: WatchmodeTitleDetails }>();
let watchmodeProvidersCache: { expiresAt: number; data: Map<number, WatchmodeProvider> } | null = null;

const formatDate = (date: Date) => date.toISOString().slice(0, 10);
const formatWatchmodeDate = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, "");
const RELEASE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
    // Coming Soon must only return dated releases from today through the requested future window.
    .filter((movie) => isWithinReleaseWindow(movie.release_date, days))
    .sort((a, b) => {
      const dateCompare = a.release_date.localeCompare(b.release_date);
      if (dateCompare !== 0) return dateCompare;
      return Number(b.vote_average || 0) - Number(a.vote_average || 0);
    });

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
  type: ComingSoonType
): ComingSoonMovie => ({
  id: movie.id,
  imdbID: `tmdb-${movie.id}`,
  title: movie.title || movie.name || "Untitled movie",
  overview: movie.overview || "",
  poster_path: movie.poster_path || "",
  backdrop_path: movie.backdrop_path || "",
  release_date: movie.release_date || "",
  vote_average: Number(movie.vote_average || 0),
  type,
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
  const sources = allSources.filter((source) =>
    allowedSourceTypes.includes(source.type as WatchmodeSourceType)
  );

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
    release_date: releaseDate || details?.release_date || "",
    vote_average: Number(details?.user_rating || 0),
    type: getWatchmodeType(sourceTypes, requestedType),
    watchmodeId,
    tmdbId,
    imdbId: imdbId || undefined,
    sources,
    sourceNames,
    sourceTypes,
    webUrl: getPrimaryWebUrl(sources),
  };
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

  let normalizedMovies: ComingSoonMovie[] = [];

  try {
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
        const fallbackSources: WatchmodeSource[] = provider
          ? [
              {
                source_id: release.provider_id || undefined,
                name: provider.name,
                type: provider.type === "purchase" ? "buy" : provider.type,
                region,
              },
            ]
          : [];
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

    normalizedMovies = movies.filter((movie): movie is ComingSoonMovie => Boolean(movie));
  } catch (error) {
    console.warn("Watchmode release-date lookup failed; falling back to title list:", error);
  }

  if (normalizedMovies.length > 0) {
    return filterComingSoonReleaseWindow(normalizedMovies, days);
  }

  const listResponse = await fetchWatchmode<{ titles?: WatchmodeTitleListItem[] }>(
    buildWatchmodeUrl("/list-titles", {
      types: "movie",
      regions: region,
      source_types: allowedSourceTypes.join(","),
      sort_by: "popularity_desc",
      limit: WATCHMODE_ENRICH_LIMIT,
    }),
    apiKey
  );

  const fallbackMovies = await Promise.all(
    (listResponse.titles || []).slice(0, WATCHMODE_ENRICH_LIMIT).map(async (title) => {
      const details = await getWatchmodeDetails(apiKey, title.id, region).catch(() => null);
      return normalizeWatchmodeMovie(title, details, [], type, allowedSourceTypes);
    })
  );

  return filterComingSoonReleaseWindow(
    fallbackMovies.filter((movie): movie is ComingSoonMovie => Boolean(movie)),
    days
  );
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
    "primary_release_date.gte": start,
    "primary_release_date.lte": end,
    "release_date.gte": start,
    "release_date.lte": end,
  };

  if (type === "digital") {
    baseParams.with_release_type = 4;
  }

  if (type === "physical") {
    baseParams.with_release_type = 5;
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
  responses
    .flatMap((response) => response.results || [])
    .filter((movie) => movie.id && movie.release_date >= start && movie.release_date <= end)
    .forEach((movie) => {
      if (!deduped.has(movie.id)) {
        deduped.set(movie.id, normalizeMovie(movie, type));
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
    if (type === "physical") {
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

    const watchmodeApiKey = process.env.WATCHMODE_API_KEY;
    if (!watchmodeApiKey) {
      res.status(500).json({ msg: "Watchmode API key is not configured on the server." });
      return;
    }

    const movies = filterComingSoonReleaseWindow(
      await fetchWatchmodeComingSoon(watchmodeApiKey, region, days, type),
      days
    );
    cache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: movies,
    });
    res.json(movies);
  } catch (error) {
    console.error("Failed to fetch coming soon movies from Watchmode:", error);
    res.status(502).json({
      msg: "Failed to fetch coming soon movies from Watchmode.",
    });
  }
});

export default router;
