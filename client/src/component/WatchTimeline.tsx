import React, { useEffect, useRef, useState } from "react";
import { useScroll, useTransform, motion } from "framer-motion";
import { FaTrashAlt } from "react-icons/fa";
import { getAvatarUrl } from "../utils/avatar";
import "./WatchTimeline.css";

interface WatchedWithMember {
  _id: string;
  name: string;
  avatar?: string;
}

interface TimelineMovie {
  _id: string;
  historyItemId?: string;
  id?: string;
  title: string;
  poster?: string;
  poster_path?: string;
  vote_average?: number;
  watchedAt?: string;
  watchedDate?: string;
  watchedLocation?: string;
  createdAt?: string;
  watchedWhere?: string;
  watchedWith?: WatchedWithMember[];
  watchedNotes?: string;
}

interface TimelineEntry {
  label: string;
  movies: TimelineMovie[];
  sortTime: number;
}

interface WatchTimelineProps {
  movies: TimelineMovie[];
  onMovieClick?: (movie: TimelineMovie) => void;
  onDeleteClick?: (movie: TimelineMovie) => void;
}

const getPosterUrl = (poster?: string) => {
  if (!poster) return "/default-avatar.png";
  return poster.startsWith("http") ? poster : `https://image.tmdb.org/t/p/w300${poster}`;
};

const getMovieDate = (movie: TimelineMovie): Date | null => {
  const value = movie.watchedAt || movie.watchedDate || movie.createdAt;
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (!movie._id || movie._id.length < 8) return null;
  const timestamp = parseInt(movie._id.substring(0, 8), 16);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp * 1000);
};

const formatDate = (movie: TimelineMovie): string => {
  const date = getMovieDate(movie);
  if (!date) return "Unknown date";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatMonth = (date: Date | null) => {
  if (!date) return "Unknown date";
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const groupByMonth = (movies: TimelineMovie[]): TimelineEntry[] => {
  const map: Record<string, TimelineEntry> = {};
  movies.forEach((movie) => {
    const date = getMovieDate(movie);
    const key = formatMonth(date);
    const sortTime = date ? new Date(date.getFullYear(), date.getMonth(), 1).getTime() : -Infinity;
    if (!map[key]) map[key] = { label: key, movies: [], sortTime };
    map[key].movies.push(movie);
  });
  return Object.values(map)
    .map((entry) => ({
      ...entry,
      movies: entry.movies.sort((a, b) => {
        const aTime = getMovieDate(a)?.getTime() ?? -Infinity;
        const bTime = getMovieDate(b)?.getTime() ?? -Infinity;
        return bTime - aTime;
      }),
    }))
    .sort((a, b) => b.sortTime - a.sortTime);
};

const WatchTimeline: React.FC<WatchTimelineProps> = ({
  movies,
  onMovieClick,
  onDeleteClick,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (ref.current) {
      setHeight(ref.current.getBoundingClientRect().height);
    }
  }, [movies]);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 10%", "end 60%"],
  });

  const heightTransform = useTransform(scrollYProgress, [0, 1], [0, height]);
  const opacityTransform = useTransform(scrollYProgress, [0, 0.1], [0, 1]);

  const entries = groupByMonth(movies);

  if (movies.length === 0) return null;

  return (
    <div className="watch-timeline-container" ref={containerRef}>
      <div className="watch-timeline-header">
        <h2 className="watch-timeline-heading">Group Watch History</h2>
        <p className="watch-timeline-subheading">Movies your group has watched together</p>
      </div>

      <div className="watch-timeline-content" ref={ref}>
        {entries.map((entry, index) => (
          <div key={index} className="watch-timeline-row">
            <div className="watch-timeline-label-col">
              <div className="watch-timeline-dot-wrapper">
                <div className="watch-timeline-dot" />
              </div>
              <h3 className="watch-timeline-label">{entry.label}</h3>
            </div>

            <div className="watch-timeline-movies-col">
              <h3 className="watch-timeline-label-mobile">{entry.label}</h3>
              <div className="watch-timeline-movies-grid">
                {entry.movies.map((movie) => (
                  <div
                    key={movie.historyItemId || movie._id}
                    className="watch-timeline-movie-card"
                  >
                    {onDeleteClick && (
                      <button
                        type="button"
                        className="watch-timeline-delete-btn"
                        title="Delete from history"
                        aria-label={`Delete ${movie.title || "movie"} from history`}
                        onClick={() => onDeleteClick(movie)}
                      >
                        <FaTrashAlt />
                      </button>
                    )}
                    <img
                      src={getPosterUrl(movie.poster || movie.poster_path)}
                      alt={movie.title}
                      className="watch-timeline-poster"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/default-avatar.png";
                      }}
                    />
                    <p className="watch-timeline-movie-title">{movie.title}</p>

                    {/* Metadata bar */}
                    <div className="watch-timeline-meta">
                      <span className="watch-timeline-meta-date">
                        {formatDate(movie)}
                      </span>
                      {(movie.watchedLocation || movie.watchedWhere) && (
                        <span className="watch-timeline-meta-where">
                          {movie.watchedLocation || movie.watchedWhere}
                        </span>
                      )}
                    </div>

                    {movie.watchedWith && movie.watchedWith.length > 0 && (
                      <div className="watch-timeline-meta-who">
                        {movie.watchedWith.slice(0, 4).map((member) => (
                          <div
                            key={member._id}
                            className="watch-timeline-avatar"
                            title={member.name}
                          >
                            <img src={getAvatarUrl(member)} alt={member.name} />
                          </div>
                        ))}
                        {movie.watchedWith.length > 4 && (
                          <div className="watch-timeline-avatar watch-timeline-avatar--more">
                            +{movie.watchedWith.length - 4}
                          </div>
                        )}
                      </div>
                    )}

                    {onMovieClick && (
                      <button
                        type="button"
                        className="watch-timeline-info-btn"
                        onClick={() => onMovieClick(movie)}
                      >
                        Details
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        <div
          className="watch-timeline-track"
          style={{ height: `${height}px` }}
        >
          <motion.div
            className="watch-timeline-progress"
            style={{ height: heightTransform, opacity: opacityTransform }}
          />
        </div>
      </div>
    </div>
  );
};

export default WatchTimeline;
