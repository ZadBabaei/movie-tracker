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
};

type CacheEntry = {
  expiresAt: number;
  data: ComingSoonMovie[];
};

const SUPPORTED_TYPES = new Set<ComingSoonType>([
  "all",
  "digital",
  "physical",
  "streaming",
]);
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const buildTmdbUrl = (path: string, params: Record<string, string | number | undefined>) => {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
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

  return Array.from(deduped.values());
};

router.get("/", async (req: Request, res: Response) => {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    res.status(500).json({ msg: "TMDb API key is not configured on the server." });
    return;
  }

  const region = String(req.query.region || "CA").trim().toUpperCase() || "CA";
  const parsedDays = Number(req.query.days || 30);
  const days = Number.isFinite(parsedDays)
    ? Math.min(Math.max(Math.round(parsedDays), 1), 90)
    : 30;
  const requestedType = String(req.query.type || "all").toLowerCase() as ComingSoonType;
  const type = SUPPORTED_TYPES.has(requestedType) ? requestedType : "all";
  const cacheKey = `${region}:${days}:${type}`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.data);
    return;
  }

  try {
    const movies = await discoverMovies(apiKey, region, days, type);
    cache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: movies,
    });
    res.json(movies);
  } catch (error) {
    console.error("Failed to fetch coming soon movies from TMDb:", error);
    res.status(502).json({
      msg: "Failed to fetch coming soon movies from TMDb.",
    });
  }
});

export default router;
