const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";
const DEFAULT_TIMEOUT_MS = 10_000;
const IMDB_ID_PATTERN = /^tt\d{7,10}$/;

export type TmdbMovieResolverErrorCode =
  | "tmdb_configuration_missing"
  | "tmdb_invalid_imdb_id"
  | "tmdb_network_error"
  | "tmdb_rate_limited"
  | "tmdb_unavailable"
  | "tmdb_protocol_error"
  | "tmdb_ambiguous_match";

export class TmdbMovieResolverError extends Error {
  constructor(public readonly code: TmdbMovieResolverErrorCode) {
    super(code);
    this.name = "TmdbMovieResolverError";
  }
}

export interface ResolvedTmdbMovie {
  tmdbId: number;
  title: string;
  posterPath?: string;
  voteAverage: number;
}

export interface TmdbMovieResolver {
  resolveByImdbId(imdbId: string): Promise<ResolvedTmdbMovie | null>;
}

type FetchImplementation = typeof fetch;
type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeMovie = (value: unknown): ResolvedTmdbMovie | null => {
  if (!isObject(value)) return null;
  const { id, title, poster_path: posterPath, vote_average: voteAverage } = value;
  if (
    !Number.isSafeInteger(id) ||
    (id as number) < 1 ||
    typeof title !== "string" ||
    title.trim().length < 1 ||
    title.length > 300 ||
    !Number.isFinite(voteAverage) ||
    (posterPath !== null && posterPath !== undefined &&
      (typeof posterPath !== "string" || posterPath.length > 1024))
  ) {
    return null;
  }
  return {
    tmdbId: id as number,
    title: title.trim(),
    ...(typeof posterPath === "string" && posterPath.length > 0
      ? { posterPath }
      : {}),
    voteAverage: voteAverage as number,
  };
};

export const createTmdbMovieResolver = ({
  fetchImpl = fetch,
  apiKey,
  baseUrl = TMDB_API_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  fetchImpl?: FetchImplementation;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
} = {}): TmdbMovieResolver => {
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new TmdbMovieResolverError("tmdb_configuration_missing");
  }
  if (parsedBaseUrl.protocol !== "https:") {
    throw new TmdbMovieResolverError("tmdb_configuration_missing");
  }

  return {
    async resolveByImdbId(imdbId) {
      if (!IMDB_ID_PATTERN.test(imdbId)) {
        throw new TmdbMovieResolverError("tmdb_invalid_imdb_id");
      }
      const activeApiKey = apiKey ?? process.env.TMDB_API_KEY;
      if (!activeApiKey || activeApiKey.length > 4096) {
        throw new TmdbMovieResolverError("tmdb_configuration_missing");
      }

      const url = new URL(`${parsedBaseUrl.toString().replace(/\/$/, "")}/find/${imdbId}`);
      url.searchParams.set("api_key", activeApiKey);
      url.searchParams.set("external_source", "imdb_id");
      url.searchParams.set("language", "en-US");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (response.status === 429) {
          throw new TmdbMovieResolverError("tmdb_rate_limited");
        }
        if (response.status >= 500) {
          throw new TmdbMovieResolverError("tmdb_unavailable");
        }
        if (!response.ok) {
          throw new TmdbMovieResolverError("tmdb_protocol_error");
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new TmdbMovieResolverError("tmdb_protocol_error");
        }
        if (!isObject(payload) || !Array.isArray(payload.movie_results)) {
          throw new TmdbMovieResolverError("tmdb_protocol_error");
        }
        const movies = payload.movie_results.map(normalizeMovie);
        if (movies.some((movie) => movie === null)) {
          throw new TmdbMovieResolverError("tmdb_protocol_error");
        }
        if (movies.length === 0) return null;
        if (movies.length > 1) {
          throw new TmdbMovieResolverError("tmdb_ambiguous_match");
        }
        return movies[0];
      } catch (error) {
        if (error instanceof TmdbMovieResolverError) throw error;
        throw new TmdbMovieResolverError("tmdb_network_error");
      } finally {
        clearTimeout(timeout);
      }
    },
  };
};

const tmdbMovieResolver = createTmdbMovieResolver();

export default tmdbMovieResolver;
