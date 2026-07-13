import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import quotes from "../data/Quotes";
import "./Home.css";
import VerticalNavbar from "../component/VerticalNavbar";
import MovieDetailModal from "../component/MovieDetailModal";
import apiClient from "../api/apiClient";
import { useWatchlistStore } from "../store/useWatchlistStore";
import { useGroupStore } from "../store/useGroupStore";
import fullLogo from "../assets/movie-tracker-logo-full.svg";

const RELEASE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FEATURED_MOVIE_PATTERN = /the death of robin hood/i;
const MAX_ORBIT_MOVIES = 7;

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

const relativeTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 3600) return "Now";
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? "Yesterday" : `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
};

const notability = (movie) =>
  (movie.revenue || 0) * 1000 + (movie.popularity || 0);

const greetingForHour = (hour) => {
  if (hour < 5) return "Late night pick";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const movieKey = (movie) =>
  (movie?._id || movie?.tmdbId || movie?.id || movie?.imdbID || movie?.title || "movie").toString();

const moviePoster = (movie) => getPosterUrl(movie?.poster_path || movie?.poster);

const deterministicTilt = (index, outer = false) => {
  const tilts = outer ? [-13, 8, -5, 14, -9, 5, 11] : [-8, 12, -15, 6, 14, -5, 9];
  return tilts[index % tilts.length];
};

function OrbitBodies({ items, orbit, loading, emptyTo, emptyLabel, onMovieClick }) {
  const radius = orbit === "inner" ? "215px" : "390px";
  const startAngle = orbit === "inner" ? 0 : 15;
  const visibleItems = items.slice(0, MAX_ORBIT_MOVIES);
  const slots = loading ? Array.from({ length: 7 }) : visibleItems;

  if (!loading && visibleItems.length === 0) {
    return (
      <div
        className={`orbit-position orbit-position--empty orbit-position--${orbit}`}
        style={{ "--angle": "-45deg", "--radius": radius }}
      >
        <Link className="orbit-ghost orbit-ghost--action" to={emptyTo}>
          <span>+</span>
          {emptyLabel}
        </Link>
      </div>
    );
  }

  return slots.map((movie, index) => {
    const angle = startAngle + (360 / slots.length) * index;
    const style = {
      "--angle": `${angle}deg`,
      "--radius": radius,
      "--tilt": `${deterministicTilt(index, orbit === "outer")}deg`,
    };

    if (loading) {
      return (
        <div className="orbit-position" style={style} key={`${orbit}-skeleton-${index}`}>
          <span className={`orbit-ghost orbit-ghost--${orbit}`} />
        </div>
      );
    }

    const isFeatured = FEATURED_MOVIE_PATTERN.test(movie.title || "");
    return (
      <div className="orbit-position" style={style} key={`${orbit}-${movieKey(movie)}`}>
        <button
          type="button"
          className={`planet planet--${orbit}${isFeatured ? " planet--featured" : ""}`}
          onClick={() => onMovieClick(movie)}
          title={movie.title}
          aria-label={`Open details for ${movie.title}`}
        >
          {moviePoster(movie) ? (
            <img src={moviePoster(movie)} alt="" loading="lazy" />
          ) : (
            <span className="planet-fallback">{movie.title}</span>
          )}
        </button>
      </div>
    );
  });
}

function PollSatellite({ poll, index, isOpen, rankings, error, saving, onToggle, onRank, onVote }) {
  const options = poll.movies || poll.options || [];
  const isRunoff = (poll.round || 1) > 1;

  return (
    <div className={`poll-satellite poll-satellite--${(index % 7) + 1}`}>
      <button
        type="button"
        className={`satellite-dot${poll.hasCurrentUserVoted ? " is-voted" : ""}`}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={`${poll.hasCurrentUserVoted ? "View" : "Vote in"} ${poll.name}`}
      />
      {isOpen && (
        <div className="poll-popover">
          <p className="poll-group">{poll.groupName}</p>
          <h3>{poll.question || poll.name}</h3>
          {poll.hasCurrentUserVoted ? (
            <div className="poll-received">
              <span>Signal received</span>
              <p>Your ballot is already in orbit.</p>
            </div>
          ) : (
            <form onSubmit={(event) => onVote(event, poll)}>
              <p className="poll-instruction">
                {isRunoff ? "Choose your first pick." : "Rank every film. Each rank is used once."}
              </p>
              <div className="poll-options">
                {options.map((option) => {
                  const id = (option.tmdbId || option.movieId || option.id).toString();
                  return (
                    <label key={id}>
                      <span>{option.title}</span>
                      {isRunoff ? (
                        <input
                          type="radio"
                          name={`poll-${poll._id}`}
                          checked={rankings[id] === 1}
                          onChange={() => onRank(poll._id, id, 1, true)}
                        />
                      ) : (
                        <select
                          value={rankings[id] || ""}
                          onChange={(event) => onRank(poll._id, id, event.target.value)}
                          aria-label={`Rank ${option.title}`}
                        >
                          <option value="">—</option>
                          {options.map((_, rankIndex) => (
                            <option value={rankIndex + 1} key={rankIndex + 1}>
                              #{rankIndex + 1}
                            </option>
                          ))}
                        </select>
                      )}
                    </label>
                  );
                })}
              </div>
              {error && <p className="poll-error">{error}</p>}
              <button className="poll-submit" type="submit" disabled={saving}>
                {saving ? "Transmitting…" : "Transmit ballot"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function Home() {
  const [dashboard, setDashboard] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [activePolls, setActivePolls] = useState([]);
  const [openPollId, setOpenPollId] = useState(null);
  const [pollRankings, setPollRankings] = useState({});
  const [pollErrors, setPollErrors] = useState({});
  const [savingPollId, setSavingPollId] = useState(null);
  const [tonightPickId, setTonightPickId] = useState(null);
  const [isPicking, setIsPicking] = useState(false);
  const pickTimer = useRef(null);
  const [quote] = useState(() => quotes[Math.floor(Math.random() * quotes.length)]);

  const {
    movies: watchlistMovies,
    loading: watchlistLoading,
    fetchWatchlist,
  } = useWatchlistStore();
  const { groupList, fetchGroups } = useGroupStore();

  useEffect(() => {
    fetchWatchlist();
    fetchGroups();
  }, [fetchWatchlist, fetchGroups]);

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("token");

    const fetchHomeData = async () => {
      const dashboardRequest = token
        ? apiClient.get("/api/profile/dashboard", {
            headers: { Authorization: `Bearer ${token}` },
          })
        : Promise.resolve(null);
      const pollsRequest = token
        ? apiClient.get("/api/polls/active-for-user", {
            headers: { Authorization: `Bearer ${token}` },
          })
        : Promise.resolve(null);

      const [dashboardResult, upcomingResult, pollsResult] = await Promise.allSettled([
        dashboardRequest,
        apiClient.get("/api/coming-soon", {
          params: { region: "US", type: "streaming", days: 30 },
        }),
        pollsRequest,
      ]);

      if (cancelled) return;
      if (dashboardResult.status === "fulfilled" && dashboardResult.value) {
        setDashboard(dashboardResult.value.data);
      }
      if (upcomingResult.status === "fulfilled") {
        setUpcoming(Array.isArray(upcomingResult.value.data) ? upcomingResult.value.data : []);
      } else {
        console.error("Error fetching upcoming releases:", upcomingResult.reason);
      }
      if (pollsResult.status === "fulfilled" && pollsResult.value) {
        setActivePolls(Array.isArray(pollsResult.value.data) ? pollsResult.value.data : []);
      }
      setUpcomingLoading(false);
    };

    fetchHomeData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (watchlistLoading) return;
    const storedId = localStorage.getItem(`star-chart-tonight-${toDateKey()}`);
    setTonightPickId(
      storedId && watchlistMovies.some((movie) => movieKey(movie) === storedId)
        ? storedId
        : null
    );
  }, [watchlistLoading, watchlistMovies]);

  useEffect(() => () => window.clearTimeout(pickTimer.current), []);

  const upcomingPicks = useMemo(
    () =>
      upcoming
        .filter((movie) => movie.poster_path && daysUntil(movie.release_date) !== null)
        .sort((a, b) => notability(b) - notability(a))
        .slice(0, MAX_ORBIT_MOVIES),
    [upcoming]
  );

  const watchlistHighlights = useMemo(
    () =>
      [...watchlistMovies]
        .sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        })
        .slice(0, MAX_ORBIT_MOVIES),
    [watchlistMovies]
  );

  const mobileOrbitMovies = useMemo(() => {
    const used = new Set();
    return [...upcomingPicks, ...watchlistHighlights]
      .filter((movie) => {
        const key = movieKey(movie);
        if (used.has(key)) return false;
        used.add(key);
        return true;
      })
      .slice(0, 5);
  }, [upcomingPicks, watchlistHighlights]);

  const tonightPick = watchlistMovies.find((movie) => movieKey(movie) === tonightPickId);
  const recentActivity = (dashboard?.recentActivity || []).slice(0, 5);
  const stats = dashboard?.stats;
  const firstName = (dashboard?.user?.name || "").split(" ")[0];
  const greeting = greetingForHour(new Date().getHours());
  const statsLine = stats
    ? `${stats.moviesWatched} films watched · ${stats.groupsJoined} groups · ${stats.pollsVoted} polls voted`
    : "Charting your cinema universe…";

  const chooseTonight = (reroll = false) => {
    if (!watchlistMovies.length || isPicking) return;
    const choices = reroll && watchlistMovies.length > 1
      ? watchlistMovies.filter((movie) => movieKey(movie) !== tonightPickId)
      : watchlistMovies;
    const nextMovie = choices[Math.floor(Math.random() * choices.length)];
    setIsPicking(true);
    window.clearTimeout(pickTimer.current);
    pickTimer.current = window.setTimeout(() => {
      const nextId = movieKey(nextMovie);
      setTonightPickId(nextId);
      localStorage.setItem(`star-chart-tonight-${toDateKey()}`, nextId);
      setIsPicking(false);
    }, 1150);
  };

  const handlePollRank = (pollId, movieId, value, isRunoff = false) => {
    setPollRankings((current) => ({
      ...current,
      [pollId]: isRunoff
        ? { [movieId]: 1 }
        : { ...(current[pollId] || {}), [movieId]: Number(value) || "" },
    }));
    setPollErrors((current) => ({ ...current, [pollId]: "" }));
  };

  const handleVote = async (event, poll) => {
    event.preventDefault();
    const options = poll.movies || poll.options || [];
    const selections = pollRankings[poll._id] || {};
    const isRunoff = (poll.round || 1) > 1;
    const ids = options.map((option) =>
      (option.tmdbId || option.movieId || option.id).toString()
    );
    const ranks = ids.map((id) => Number(selections[id]));

    if (
      (isRunoff && ranks.filter((rank) => rank === 1).length !== 1) ||
      (!isRunoff &&
        (ranks.some((rank) => !Number.isInteger(rank)) || new Set(ranks).size !== ids.length))
    ) {
      setPollErrors((current) => ({
        ...current,
        [poll._id]: isRunoff ? "Choose one film." : "Use every rank exactly once.",
      }));
      return;
    }

    const rankings = isRunoff
      ? [{ movieTmdbId: ids.find((id) => Number(selections[id]) === 1), rank: 1 }]
      : ids.map((id) => ({ movieTmdbId: id, rank: Number(selections[id]) }));

    setSavingPollId(poll._id);
    try {
      const token = localStorage.getItem("token");
      const response = await apiClient.post(
        "/api/polls/vote",
        { pollId: poll._id, rankings },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const result = response.data.autoCompleted ? response.data.poll : response.data;
      if (!result || result.status === "completed" || result.status === "cancelled") {
        setActivePolls((current) => current.filter((item) => item._id !== poll._id));
        setOpenPollId(null);
      } else {
        const needsRunoffVote = Boolean(
          response.data.runoff && (result.round || 1) > (poll.round || 1)
        );
        setActivePolls((current) =>
          current.map((item) =>
            item._id === poll._id
              ? {
                  ...item,
                  ...result,
                  groupName: item.groupName,
                  hasCurrentUserVoted: needsRunoffVote
                    ? false
                    : result.hasCurrentUserVoted ?? true,
                }
              : item
          )
        );
      }
    } catch (error) {
      setPollErrors((current) => ({
        ...current,
        [poll._id]: error.response?.data?.msg || "The ballot could not be sent.",
      }));
    } finally {
      setSavingPollId(null);
    }
  };

  return (
    <div className="home-page">
      <VerticalNavbar />
      <div className="starfield" aria-hidden="true" />

      <main className="star-chart">
        <header className="chart-masthead">
          <img src={fullLogo} alt="Movie Tracker" />
          <div className="chart-rule">
            <span><b>PM–01</b> · Personal cinema chart</span>
            <span>Observer: <b>{firstName || "Movie lover"}</b></span>
          </div>
        </header>

        <section
          className={`orbital-system${isPicking ? " is-picking" : ""}`}
          aria-label="Your movie star chart"
        >
          <div className="orbit-ring orbit-ring--outer" />
          <div className="orbit-ring orbit-ring--inner" />

          <div className="desktop-orbits">
            <div className="orbit-spin orbit-spin--inner">
              <OrbitBodies
                items={upcomingPicks}
                orbit="inner"
                loading={upcomingLoading}
                emptyTo="/coming-soon"
                emptyLabel="Browse premieres"
                onMovieClick={setSelectedMovie}
              />
            </div>
            <div className="orbit-spin orbit-spin--outer">
              <OrbitBodies
                items={watchlistHighlights}
                orbit="outer"
                loading={watchlistLoading}
                emptyTo="/watchlist"
                emptyLabel="Add your first film"
                onMovieClick={setSelectedMovie}
              />
            </div>
          </div>

          <div className="mobile-orbit">
            <div className="orbit-spin orbit-spin--mobile">
              <OrbitBodies
                items={mobileOrbitMovies}
                orbit="inner"
                loading={upcomingLoading || watchlistLoading}
                emptyTo="/watchlist"
                emptyLabel="Add your first film"
                onMovieClick={setSelectedMovie}
              />
            </div>
          </div>

          {activePolls.map((poll, index) => (
            <PollSatellite
              key={poll._id}
              poll={poll}
              index={index}
              isOpen={openPollId === poll._id}
              rankings={pollRankings[poll._id] || {}}
              error={pollErrors[poll._id]}
              saving={savingPollId === poll._id}
              onToggle={() => setOpenPollId((current) => current === poll._id ? null : poll._id)}
              onRank={handlePollRank}
              onVote={handleVote}
            />
          ))}

          <div className="chart-core">
            {tonightPick ? (
              <div className="docked-pick">
                <span className="core-eyebrow">Tonight’s coordinates</span>
                <button type="button" className="docked-poster" onClick={() => setSelectedMovie(tonightPick)}>
                  {moviePoster(tonightPick) ? (
                    <img src={moviePoster(tonightPick, "w185")} alt="" />
                  ) : (
                    <span>{tonightPick.title}</span>
                  )}
                </button>
                <strong>{tonightPick.title}</strong>
                <div className="docked-actions">
                  <button type="button" onClick={() => chooseTonight(true)}>Re-roll ↻</button>
                  <button type="button" onClick={() => setSelectedMovie(tonightPick)}>Details</button>
                </div>
              </div>
            ) : (
              <>
                <span className="core-eyebrow">Currently orbiting</span>
                <h1>{greeting}{firstName ? `, ${firstName}` : ""}.</h1>
                <p className="core-quote">“{quote}”</p>
                <p className="core-stats">{statsLine}</p>
                {watchlistMovies.length ? (
                  <button type="button" className="tonight-button" onClick={() => chooseTonight()}>
                    What should we watch tonight?
                  </button>
                ) : (
                  <Link className="tonight-button" to="/watchlist">Build a watchlist</Link>
                )}
              </>
            )}
          </div>
        </section>

        <div className="orbit-legend" aria-label="Orbit legend">
          <span className="legend-inner">● Inner orbit — coming to streaming</span>
          <span className="legend-outer">● Outer orbit — your watchlist</span>
        </div>

        <section className="console-split">
          <div className="console-panel">
            <h2><span>Mission log — recent activity</span><i /></h2>
            {recentActivity.length ? recentActivity.map((item) => (
              <div className="log-row" key={item.id}>
                <time>{relativeTime(item.createdAt)}</time>
                <span>{item.title}</span>
              </div>
            )) : (
              <p className="console-empty">No transmissions yet. Add a film or join a group to begin the log.</p>
            )}
          </div>

          <div className="console-panel">
            <h2><span>Signal channels — groups</span><i /></h2>
            {groupList.length ? groupList.slice(0, 6).map((group) => {
              const members = group.members?.length || 0;
              return (
                <Link className="channel-row" to={`/group/${group._id}`} key={group._id}>
                  <span className="channel-signal"><i /><b>{group.name}</b></span>
                  <span className="channel-frequency">{members} {members === 1 ? "member" : "members"}</span>
                </Link>
              );
            }) : (
              <p className="console-empty">No channels found. <Link to="/my-groups">Create a group</Link>.</p>
            )}
          </div>
        </section>

        <footer className="chart-footer">
          <span>
            This product uses the TMDB API but is not endorsed or certified by{" "}
            <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB</a>.
          </span>
          <span>Star chart · Live personal index</span>
        </footer>
      </main>

      {selectedMovie && (
        <MovieDetailModal movie={selectedMovie} onClose={() => setSelectedMovie(null)} />
      )}
    </div>
  );
}

export default Home;
