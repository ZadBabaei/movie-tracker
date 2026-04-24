import React, { useEffect, useRef, useState } from "react";
import { useScroll, useTransform, motion } from "framer-motion";
import "./WatchTimeline.css";

interface WatchedWithMember {
  _id: string;
  name: string;
  avatar?: string;
}

interface TimelineMovie {
  _id: string;
  title: string;
  poster?: string;
  vote_average?: number;
  createdAt?: string;
  watchedWhere?: string;
  watchedWith?: WatchedWithMember[];
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
  const timestamp = parseInt(movie._id.substring(0, 8), 16);
  return new Date(timestamp * 1000);
};

const formatDate = (movie: TimelineMovie): string => {
  const date = getMovieDate(movie);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const groupByMonth = (movies: TimelineMovie[]): TimelineEntry[] => {
  const map: Record<string, TimelineMovie[]> = {};
  movies.forEach((movie) => {
    const date = getMovieDate(movie);
    const key = date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!map[key]) map[key] = [];
    map[key].push(movie);
  });
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

                    {/* Metadata bar */}
                    <div className="watch-timeline-meta">
                      <span className="watch-timeline-meta-date">
                        {formatDate(movie)}
                      </span>
                      {movie.watchedWhere && (
                        <span className="watch-timeline-meta-where">
                          📍 {movie.watchedWhere}
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
                            {member.avatar ? (
                              <img src={member.avatar} alt={member.name} />
                            ) : (
                              <span>{member.name.charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                        ))}
                        {movie.watchedWith.length > 4 && (
                          <div className="watch-timeline-avatar watch-timeline-avatar--more">
                            +{movie.watchedWith.length - 4}
                          </div>
                        )}
                      </div>
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
