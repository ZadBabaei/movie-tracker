import React from "react";
import { FaStar } from "react-icons/fa";
import { Link } from "react-router-dom";
import { historyImageUrl } from "../utils/historyEntry";
import type { TvSessionTimelineItem } from "../utils/historyTimeline";
import "./TvSessionCard.css";

/**
 * The permanent TV card in the main Watch History timeline: one grouped
 * session (series + UTC day) rendered as a fixed three-layer stack.
 *
 * The stack is the TV identity, never a count. The two rear layers are
 * `::before` / `::after` on the non-semantic wrapper, so whatever the session
 * holds — one episode or ten — there is exactly one interactive front card and
 * exactly two decorative layers behind it. The front card is a link to the
 * series page (`/history/tv/:seriesTmdbId`) in the scope it was opened from.
 */

export interface TvSessionCardProps {
  session: TvSessionTimelineItem;
  formattedDay: string;
  /** Series page URL, including the scope query (see WatchHistory.seriesHref). */
  to: string;
}

export const DEFAULT_ARTWORK = "/default-avatar.png";

export interface SessionArtwork {
  /** Cinematic backdrop when the session has one, else the poster, else the default. */
  src: string;
  /** Tried once if `src` fails to load; the default artwork comes after it. */
  fallback: string;
}

export const sessionArtwork = (session: Pick<TvSessionTimelineItem, "posterPath" | "backdropPath">): SessionArtwork => {
  const backdrop = session.backdropPath ? historyImageUrl(session.backdropPath) : "";
  const poster = session.posterPath ? historyImageUrl(session.posterPath) : "";
  if (backdrop) return { src: backdrop, fallback: poster || DEFAULT_ARTWORK };
  return { src: poster || DEFAULT_ARTWORK, fallback: DEFAULT_ARTWORK };
};

/**
 * A session rating is only shown when it is unambiguous: a single watch
 * record's own rating. Multi-record sessions keep their ratings per episode
 * (in the session detail) rather than being blended into one number.
 */
export const sessionRating = (session: Pick<TvSessionTimelineItem, "entries">): number | null => {
  if (session.entries.length !== 1) return null;
  const [entry] = session.entries;
  return entry.averageRating ?? entry.currentUserRating ?? null;
};

export const watchCountLabel = (watchCount: number) => (watchCount === 1 ? "1 episode watch" : `${watchCount} episode watches`);

const handleArtworkError = (event: React.SyntheticEvent<HTMLImageElement>) => {
  const image = event.currentTarget;
  const next = image.dataset.fallback || DEFAULT_ARTWORK;
  if (image.getAttribute("src") === next) return;
  image.dataset.fallback = DEFAULT_ARTWORK;
  image.src = next;
};

const TvSessionCard: React.FC<TvSessionCardProps> = ({ session, formattedDay, to }) => {
  const artwork = sessionArtwork(session);
  const rating = sessionRating(session);

  return (
    <div className="history-tv-stack" data-testid="history-tv-stack">
      <Link
        to={to}
        className="history-card history-card--tv"
        data-testid="history-session"
        aria-label={`TV: ${session.seriesTitle}, ${session.episodeSummary}, ${watchCountLabel(session.watchCount)} on ${formattedDay}. View series history`}
      >
        <span className="history-card-poster-wrap history-tv-art-wrap">
          <img
            className="history-card-poster history-tv-art"
            src={artwork.src}
            data-fallback={artwork.fallback}
            alt={`${session.seriesTitle} artwork`}
            loading="lazy"
            onError={handleArtworkError}
          />
          <span className="history-tv-badge">TV</span>
          {rating != null && (
            <span className="history-card-rating"><FaStar aria-hidden="true" /> {rating}</span>
          )}
        </span>
        <span className="history-card-body">
          <strong className="history-card-title">{session.seriesTitle}</strong>
          <span className="history-card-episode">{session.episodeSummary}</span>
          <span className="history-card-meta">
            <span>{formattedDay}</span>
            <span>{watchCountLabel(session.watchCount)}</span>
          </span>
          <span className="history-card-action">View Series</span>
        </span>
      </Link>
    </div>
  );
};

export default TvSessionCard;
