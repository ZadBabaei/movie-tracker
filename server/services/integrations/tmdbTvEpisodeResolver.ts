import { IWatchHistoryTvEpisode } from "../../models/WatchHistoryEntry";
import { parseStremioEpisodeId } from "./stremioWatchedBitfield";
import { TmdbMovieResolverError } from "./tmdbMovieResolver";

export interface TmdbTvEpisodeResolver {
  resolveEpisode(providerItemId: string): Promise<IWatchHistoryTvEpisode | null>;
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number) => typeof value === "string" && value.trim() && value.length <= max ? value.trim() : undefined;
const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

export const createTmdbTvEpisodeResolver = ({ fetchImpl = fetch, apiKey }: { fetchImpl?: typeof fetch; apiKey?: string } = {}): TmdbTvEpisodeResolver => ({
  async resolveEpisode(providerItemId) {
    const identity = parseStremioEpisodeId(providerItemId);
    if (!identity) throw new TmdbMovieResolverError("tmdb_invalid_imdb_id");
    const key = apiKey ?? process.env.TMDB_API_KEY;
    if (!key || key.length > 4096) throw new TmdbMovieResolverError("tmdb_configuration_missing");
    const request = async (path: string) => {
      const url = new URL(`https://api.themoviedb.org/3/${path}`);
      url.searchParams.set("api_key", key);
      url.searchParams.set("language", "en-US");
      try {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: "application/json" } });
        if (response.status === 404) return null;
        if (response.status === 429) throw new TmdbMovieResolverError("tmdb_rate_limited");
        if (response.status >= 500) throw new TmdbMovieResolverError("tmdb_unavailable");
        if (!response.ok) throw new TmdbMovieResolverError("tmdb_protocol_error");
        const payload: unknown = await response.json();
        if (!object(payload)) throw new TmdbMovieResolverError("tmdb_protocol_error");
        return payload;
      } catch (error) {
        if (error instanceof TmdbMovieResolverError) throw error;
        throw new TmdbMovieResolverError("tmdb_network_error");
      }
    };
    const found = await request(`find/${identity.seriesImdbId}?external_source=imdb_id`);
    if (!found) return null;
    if (!Array.isArray(found.tv_results)) throw new TmdbMovieResolverError("tmdb_protocol_error");
    if (!found.tv_results.length) return null;
    if (found.tv_results.length !== 1) throw new TmdbMovieResolverError("tmdb_ambiguous_match");
    const series = found.tv_results[0] as unknown;
    if (!object(series) || !positiveId(series.id) || !text(series.name, 300)) throw new TmdbMovieResolverError("tmdb_protocol_error");
    const episode = await request(`tv/${series.id}/season/${identity.seasonNumber}/episode/${identity.episodeNumber}`);
    if (!episode) return null;
    if (!positiveId(episode.id) || episode.season_number !== identity.seasonNumber || episode.episode_number !== identity.episodeNumber) {
      throw new TmdbMovieResolverError("tmdb_protocol_error");
    }
    const airDate = typeof episode.air_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(episode.air_date) ? new Date(`${episode.air_date}T00:00:00.000Z`) : undefined;
    return {
      seriesTmdbId: series.id, seasonNumber: identity.seasonNumber, episodeNumber: identity.episodeNumber,
      episodeTmdbId: episode.id, seriesTitle: text(series.name, 300)!,
      episodeTitle: text(episode.name, 300), posterPath: text(series.poster_path, 500),
      backdropPath: text(series.backdrop_path, 500), stillPath: text(episode.still_path, 500),
      ...(airDate && Number.isFinite(airDate.getTime()) ? { airDate } : {}),
    };
  },
});

export default createTmdbTvEpisodeResolver();
