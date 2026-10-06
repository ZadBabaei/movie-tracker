import { inflateSync } from "node:zlib";
import { normalizeImdbTitleId } from "./imdbTitleId";

export interface StremioEpisodeIdentity {
  seriesImdbId: string;
  seasonNumber: number;
  episodeNumber: number;
}

export const parseStremioEpisodeId = (value: string): StremioEpisodeIdentity | null => {
  const match = /^(tt\d{7,12}):(0|[1-9]\d*):([1-9]\d*)$/i.exec(value);
  if (!match) return null;
  const seasonNumber = Number(match[2]);
  const episodeNumber = Number(match[3]);
  if (!Number.isSafeInteger(seasonNumber) || !Number.isSafeInteger(episodeNumber)) return null;
  return { seriesImdbId: normalizeImdbTitleId(match[1])!, seasonNumber, episodeNumber };
};

// Stremio's official WatchedField is anchorVideoId:anchorLength:base64(zlib).
// The anchor is the highest set index, NOT the most recently watched episode.
// Callers must supply the provider's season/episode/release ordered video IDs.
export const decodeStremioWatchedVideos = (value: string, videoIds: string[]): string[] | null => {
  if (value.length > 32_768 || videoIds.length > 100_000) return null;
  const match = /^(.*):([1-9]\d*):([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  const anchorLength = Number(match[2]);
  if (!Number.isSafeInteger(anchorLength) || anchorLength > 100_000) return null;
  const anchorIndex = videoIds.indexOf(match[1]);
  if (anchorIndex < 0 || new Set(videoIds).size !== videoIds.length) return null;
  try {
    const compressed = Buffer.from(match[3], "base64");
    if (compressed.toString("base64") !== match[3]) return null;
    const bits = inflateSync(compressed, { maxOutputLength: 12_500 });
    const bitAt = (index: number) => index >= 0 && index < bits.length * 8 &&
      ((bits[Math.floor(index / 8)] >> (index % 8)) & 1) === 1;
    if (!bitAt(anchorLength - 1)) return null;
    const offset = anchorLength - anchorIndex - 1;
    return videoIds.filter((_, index) => bitAt(index + offset));
  } catch {
    return null;
  }
};
