import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import quotes from "../data/Quotes";
import "./Home.css";
import VerticalNavbar from "../component/VerticalNavbar";
import apiClient from "../api/apiClient";
import { useWatchlistStore } from "../store/useWatchlistStore";
import { useGroupStore } from "../store/useGroupStore";

const RELEASE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toDateKey = (date = new Date()) => date.toISOString().slice(0, 10);

const getPosterUrl = (path, size = "w342") => {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/")) return `https://image.tmdb.org/t/p/${size}${path}`;
  return "";
};

const daysUntil = (value) => {
  if (!value || !RELEASE_DATE_PATTERN.test(value)) return null;
  const target = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(`${toDateKey()}T00:00:00.000Z`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

const countdownLabel = (value) => {
  const days = daysUntil(value);
  if (days === null) return "Date TBA";
  if (days <= 0) return "Streaming today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
};

const formatShortDate = (value) => {
  if (!value) return "TBA";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "TBA";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const relativeTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 3600) return "Just now";
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? "Yesterday" : `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "1 month ago" : `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? "1 year ago" : `${years} years ago`;
};

const greetingForHour = (hour) => {
  if (hour < 5) return "Late night pick";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const ACTIVITY_GLYPHS = {
  watchlist: "◈",
  group: "◉",
  "poll-vote": "✓",
  "poll-created": "✎",
  profile: "★",
};

function Home() {
  const [dashboard, setDashboard] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [quote] = useState(
    () => quotes[Math.floor(Math.random() * quotes.length)]
  );

  const { movies: watchlistMovies, fetchWatchlist } = useWatchlistStore();
  const { groupList, fetchGroups } = useGroupStore();

  useEffect(() => {
    fetchWatchlist();
    fetchGroups();
  }, [fetchWatchlist, fetchGroups]);

  useEffect(() => {
    let cancelled = false;

    const fetchDashboard = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;
        const res = await apiClient.get("/api/profile/dashboard", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) setDashboard(res.data);
      } catch (error) {
        console.error("Error fetching dashboard:", error);
      }
    };

    const fetchUpcoming = async () => {
      try {
        const res = await apiClient.get("/api/coming-soon", {
          params: { region: "US", type: "streaming", days: 30 },
        });
        if (!cancelled) setUpcoming(Array.isArray(res.data) ? res.data : []);
      } catch (error) {
        console.error("Error fetching upcoming releases:", error);
      } finally {
        if (!cancelled) setUpcomingLoading(false);
      }
    };

    fetchDashboard();
    fetchUpcoming();

    return () => {
      cancelled = true;
    };
  }, []);

  const upcomingPicks = useMemo(() => {
    const notability = (movie) =>
      (movie.revenue || 0) * 1000 + (movie.popularity || 0);
    return upcoming
      .filter((movie) => movie.poster_path && daysUntil(movie.release_date) !== null)
      .sort((a, b) => notability(b) - notability(a))
      .slice(0, 6)
      .sort((a, b) => (a.release_date || "").localeCompare(b.release_date || ""));
  }, [upcoming]);

  const watchlistHighlights = useMemo(() => {
    return [...watchlistMovies]
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 6);
  }, [watchlistMovies]);

  const recentActivity = (dashboard?.recentActivity || []).slice(0, 5);
  const stats = dashboard?.stats;
  const userName = dashboard?.user?.name || "";
  const firstName = userName.split(" ")[0];
  const greeting = greetingForHour(new Date().getHours());

  const statsLine = stats
    ? [
        `${watchlistMovies.length} ${watchlistMovies.length === 1 ? "film" : "films"} on your watchlist`,
        `${stats.groupsJoined} ${stats.groupsJoined === 1 ? "group" : "groups"}`,
        `${stats.pollsVoted} ${stats.pollsVoted === 1 ? "poll" : "polls"} voted`,
      ].join("   ·   ")
    : "";

  return (
    <div className="home-page">
      <VerticalNavbar />

      <header className="hub-header">
        <div className="hub-header-inner">
          <p className="hub-eyebrow">Movie Tracker</p>
          <h1 className="hub-title">
            {greeting}
            {firstName ? `, ${firstName}` : ""}.
          </h1>
          {quote && <p className="hub-quote">“{quote}”</p>}
          {statsLine && <p className="hub-stats">{statsLine}</p>}
        </div>
      </header>

      <main className="hub-main">
        {/* ---- Coming to streaming ---- */}
        <section className="hub-section">
          <div className="hub-section-head">
            <div>
              <p className="hub-section-eyebrow">Next 30 days</p>
              <h2 className="hub-section-title">Coming to streaming</h2>
            </div>
            <Link to="/coming-soon" className="hub-section-link">
              View the calendar
            </Link>
          </div>

          {upcomingLoading ? (
            <div className="hub-poster-row" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="hub-poster-card hub-poster-card--skeleton" />
              ))}
            </div>
          ) : upcomingPicks.length > 0 ? (
            <div className="hub-poster-row">
              {upcomingPicks.map((movie) => (
                <Link
                  key={movie.id}
                  to="/coming-soon"
                  className="hub-poster-card"
                  title={movie.title}
                >
                  <div className="hub-poster-frame">
                    <img
                      src={getPosterUrl(movie.poster_path)}
                      alt={movie.title}
                      loading="lazy"
                    />
                    <span className="hub-poster-badge">
                      {countdownLabel(movie.release_date)}
                    </span>
                  </div>
                  <p className="hub-poster-title">{movie.title}</p>
                  <p className="hub-poster-meta">
                    {formatShortDate(movie.release_date)}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="hub-empty">
              No upcoming streaming premieres found right now — check the{" "}
              <Link to="/coming-soon">release calendar</Link> for the full
              picture.
            </p>
          )}
        </section>

        {/* ---- Watchlist highlights ---- */}
        <section className="hub-section">
          <div className="hub-section-head">
            <div>
              <p className="hub-section-eyebrow">Recently added</p>
              <h2 className="hub-section-title">Your watchlist</h2>
            </div>
            <Link to="/watchlist" className="hub-section-link">
              Open watchlist
            </Link>
          </div>

          {watchlistHighlights.length > 0 ? (
            <div className="hub-poster-row">
              {watchlistHighlights.map((movie) => (
                <Link
                  key={movie._id}
                  to="/watchlist"
                  className="hub-poster-card"
                  title={movie.title}
                >
                  <div className="hub-poster-frame">
                    {getPosterUrl(movie.poster) ? (
                      <img
                        src={getPosterUrl(movie.poster)}
                        alt={movie.title}
                        loading="lazy"
                      />
                    ) : (
                      <span className="hub-poster-fallback">{movie.title}</span>
                    )}
                  </div>
                  <p className="hub-poster-title">{movie.title}</p>
                  {movie.vote_average > 0 && (
                    <p className="hub-poster-meta">
                      ★ {Number(movie.vote_average).toFixed(1)}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <p className="hub-empty">
              Your watchlist is empty. <Link to="/watchlist">Add your first film</Link>{" "}
              and it will show up here.
            </p>
          )}
        </section>

        {/* ---- Activity & groups ---- */}
        <section className="hub-section hub-section--split">
          <div className="hub-activity">
            <div className="hub-section-head">
              <div>
                <p className="hub-section-eyebrow">What's new</p>
                <h2 className="hub-section-title">Recent activity</h2>
              </div>
            </div>

            {recentActivity.length > 0 ? (
              <ul className="hub-activity-list">
                {recentActivity.map((item) => (
                  <li key={item.id} className="hub-activity-item">
                    <span className="hub-activity-glyph" aria-hidden="true">
                      {ACTIVITY_GLYPHS[item.type] || "◈"}
                    </span>
                    <span className="hub-activity-text">{item.title}</span>
                    <span className="hub-activity-time">
                      {relativeTime(item.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hub-empty">
                Nothing yet — add a film or join a group to get things rolling.
              </p>
            )}
          </div>

          <div className="hub-groups">
            <div className="hub-section-head">
              <div>
                <p className="hub-section-eyebrow">Movie nights</p>
                <h2 className="hub-section-title">Your groups</h2>
              </div>
              <Link to="/my-groups" className="hub-section-link">
                All groups
              </Link>
            </div>

            {groupList.length > 0 ? (
              <ul className="hub-group-list">
                {groupList.slice(0, 5).map((group) => (
                  <li key={group._id}>
                    <Link to={`/group/${group._id}`} className="hub-group-item">
                      <span className="hub-group-name">{group.name}</span>
                      <span className="hub-group-meta">
                        {group.members?.length || 0}{" "}
                        {(group.members?.length || 0) === 1 ? "member" : "members"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hub-empty">
                You're not in any groups yet.{" "}
                <Link to="/my-groups">Create one</Link> to plan movie nights
                together.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default Home;
