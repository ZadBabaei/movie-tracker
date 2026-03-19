import React, { useEffect, useRef, useState } from "react";
import { useScroll, useTransform, motion } from "framer-motion";
import "./WatchTimeline.css";

interface TimelineMovie {
  _id: string;
  title: string;
  poster?: string;
  vote_average?: number;
  createdAt?: string;
}

interface TimelineEntry {
  label: string;
  movies: TimelineMovie[];
}

interface WatchTimelineProps {
  movies: TimelineMovie[];
}

const getPosterUrl = (poster?: string) => {
  if (!poster) return "/default-avatar.png";
  return poster.startsWith("http") ? poster : `https://image.tmdb.org/t/p/w300${poster}`;
};

const getMovieDate = (movie: TimelineMovie): Date => {
  if (movie.createdAt) return new Date(movie.createdAt);
  // Fallback: extract timestamp from MongoDB ObjectID (first 4 bytes = Unix seconds)
  const timestamp = parseInt(movie._id.substring(0, 8), 16);
  return new Date(timestamp * 1000);
};

const groupByMonth = (movies: TimelineMovie[]): TimelineEntry[] => {
  const map: Record<string, TimelineMovie[]> = {};
  movies.forEach((movie) => {
    const date = getMovieDate(movie);
    const key = date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!map[key]) map[key] = [];
    map[key].push(movie);
  });
  // Sort groups newest first
  const sorted = Object.entries(map).sort(([a], [b]) => {
    return new Date(b).getTime() - new Date(a).getTime();
  });
  return sorted.map(([label, movies]) => ({ label, movies }));
};

const WatchTimeline: React.FC<WatchTimelineProps> = ({ movies }) => {
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
        <h2 className="watch-timeline-heading">Your Watch History</h2>
        <p className="watch-timeline-subheading">Movies you've added to your watchlist</p>
      </div>

      <div className="watch-timeline-content" ref={ref}>
        {entries.map((entry, index) => (
          <div key={index} className="watch-timeline-row">
            {/* Sticky label */}
            <div className="watch-timeline-label-col">
              <div className="watch-timeline-dot-wrapper">
                <div className="watch-timeline-dot" />
              </div>
              <h3 className="watch-timeline-label">{entry.label}</h3>
            </div>

            {/* Movie grid */}
            <div className="watch-timeline-movies-col">
              <h3 className="watch-timeline-label-mobile">{entry.label}</h3>
              <div className="watch-timeline-movies-grid">
                {entry.movies.map((movie) => (
                  <div key={movie._id} className="watch-timeline-movie-card">
                    <img
                      src={getPosterUrl(movie.poster)}
                      alt={movie.title}
                      className="watch-timeline-poster"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/default-avatar.png";
                      }}
                    />
                    <p className="watch-timeline-movie-title">{movie.title}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {/* Animated vertical line */}
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
