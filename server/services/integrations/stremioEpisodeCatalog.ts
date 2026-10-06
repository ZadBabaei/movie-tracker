import { normalizeImdbTitleId } from "./imdbTitleId";
import { StremioClientError } from "./stremioClient";
import { parseStremioEpisodeId } from "./stremioWatchedBitfield";

export interface StremioEpisodeCatalog {
  getOrderedVideoIds(seriesImdbId: string): Promise<string[]>;
}

export const createStremioEpisodeCatalog = ({ fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {}): StremioEpisodeCatalog => ({
  async getOrderedVideoIds(seriesImdbId) {
    const id = normalizeImdbTitleId(seriesImdbId);
    if (!id) throw new StremioClientError("provider_protocol_error");
    try {
      const response = await fetchImpl(`https://v3-cinemeta.strem.io/meta/series/${id}.json`, {
        signal: AbortSignal.timeout(10_000), headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new StremioClientError("provider_unavailable");
      const payload = await response.json() as { meta?: { videos?: unknown } };
      const videos = payload?.meta?.videos;
      if (!Array.isArray(videos) || videos.length > 100_000) throw new StremioClientError("provider_protocol_error");
      const normalized = videos.map((video: unknown) => {
        if (!video || typeof video !== "object") throw new StremioClientError("provider_protocol_error");
        const row = video as Record<string, unknown>;
        const identity = typeof row.id === "string" ? parseStremioEpisodeId(row.id) : null;
        if (!identity || identity.seriesImdbId !== id || row.season !== identity.seasonNumber || row.episode !== identity.episodeNumber) {
          throw new StremioClientError("provider_protocol_error");
        }
        return { id: row.id as string, ...identity, released: typeof row.released === "string" ? Date.parse(row.released) : 0 };
      });
      normalized.sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber || (a.released || 0) - (b.released || 0));
      const ids = normalized.map(video => video.id);
      if (new Set(ids).size !== ids.length) throw new StremioClientError("provider_protocol_error");
      return ids;
    } catch (error) {
      if (error instanceof StremioClientError) throw error;
      throw new StremioClientError("network_error");
    }
  },
});

export default createStremioEpisodeCatalog();
