import React, { useEffect, useState, useCallback } from "react";
import { FaFilm } from "react-icons/fa";
import axios from "axios";
import "./Watchlist.css";
import Hero from "../component/Hero";
import SearchBar from "../component/SearchBar";
import MovieCard from "../component/MovieCard";
import MovieDetailModal from "../component/MovieDetailModal";
import VerticalNavbar from "../component/VerticalNavbar";
import SuggestionsCarousel from "../component/SuggestionsCarousel";
import FavoritesCarousel from "../component/FavoritesCarousel";
import WatchTimeline from "../component/WatchTimeline";
import GroupSelectModal from "../component/GroupSelectModal";
import { useWatchlistStore, WatchlistMovie } from "../store/useWatchlistStore";
import { useGroupStore } from "../store/useGroupStore";

const Watchlist: React.FC = () => {
  const {
    movies,
    loading,
    fetchWatchlist,
    addMovie,
    removeMovie,
    markAsWatched,
  } = useWatchlistStore();

  const { groupList, fetchGroups } = useGroupStore();

  const [selectedMovie, setSelectedMovie] = useState<any>(null);
  const [groupSelectOpen, setGroupSelectOpen] = useState(false);
  const [pendingMovie, setPendingMovie] = useState<WatchlistMovie | null>(null);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const fetchFavorites = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("/api/watchlist/favorites", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFavorites(res.data);
      setFavoriteIds(new Set(res.data.map((m: any) => m._id)));
    } catch (err) {
      console.error("Failed to fetch favorites:", err);
    }
  }, []);

  const handleFavoriteToggle = async (movie: any) => {
    try {
      const token = localStorage.getItem("token");
      const movieId = movie._id;
      const res = await axios.post(`/api/watchlist/favorites/${movieId}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.favorited) {
        setFavorites((prev) => [...prev, movie]);
        setFavoriteIds((prev) => new Set(Array.from(prev).concat(movieId)));
      } else {
        setFavorites((prev) => prev.filter((m) => m._id !== movieId));
        setFavoriteIds((prev) => { const s = new Set(prev); s.delete(movieId); return s; });
      }
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    }
  };

  useEffect(() => {
    fetchWatchlist();
    fetchGroups();
    fetchFavorites();
  }, [fetchWatchlist, fetchGroups, fetchFavorites]);

  const handleAddMovie = (movie: {
    imdbID: string;
    title: string;
    poster_path?: string;
    vote_average?: number;
  }) => {
    addMovie(movie);
  };

  const handleMarkWatched = (movie: WatchlistMovie) => {
    if (groupList.length === 0) {
      setGroupSelectOpen(true);
      setPendingMovie(movie);
      return;
    }

    if (groupList.length === 1) {
      markAsWatched(movie._id, groupList[0]._id);
      return;
    }

    setPendingMovie(movie);
    setGroupSelectOpen(true);
  };

  const handleGroupSelect = (groupId: string) => {
    if (pendingMovie) {
      markAsWatched(pendingMovie._id, groupId);
    }
    setGroupSelectOpen(false);
    setPendingMovie(null);
  };

  const formatMovieForCard = (movie: WatchlistMovie) => ({
    ...movie,
    poster_path: movie.poster,
  });

  return (
    <div className="watchlist-page">
      <VerticalNavbar />

      <Hero
        backgroundImage="https://image.tmdb.org/t/p/original/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg"
        variant="group"
        heroText="My Watchlist"
        heroTextSub="Movies you're planning to watch"
      />

      <div className="watchlist-main">
        <FavoritesCarousel
          favorites={favorites}
          onRemoveFavorite={(movieId) => handleFavoriteToggle({ _id: movieId })}
        />

        <SuggestionsCarousel onAddToWatchlist={handleAddMovie} />

        <SearchBar onMovieSelect={handleAddMovie} />

        <div className="watchlist-content">
          <div className="watchlist-stats-bar">
            <p>
              <FaFilm /> {movies.length} {movies.length === 1 ? "movie" : "movies"} in your watchlist
            </p>
          </div>

          {loading ? (
            <div className="empty-state">
              <p>Loading your watchlist...</p>
            </div>
          ) : movies.length === 0 ? (
            <div className="empty-state">
              <h2>Your watchlist is empty</h2>
              <p>Search for movies or add from trending suggestions above</p>
            </div>
          ) : (
            <div className="movie-grid fade-in-grid">
              {movies.map((movie) => (
                <MovieCard
                  key={movie._id}
                  movie={formatMovieForCard(movie)}
                  onDelete={() => removeMovie(movie._id)}
                  onInfoClick={(m: any) => setSelectedMovie(m)}
                  onMarkWatched={() => handleMarkWatched(movie)}
                  isFavorited={favoriteIds.has(movie._id)}
                  onFavoriteToggle={() => handleFavoriteToggle(formatMovieForCard(movie))}
                />
              ))}
            </div>
          )}
        </div>

        {movies.length > 0 && <WatchTimeline movies={movies.map((m) => ({ ...m, poster: m.poster }))} />}
      </div>

      {selectedMovie && (
        <MovieDetailModal
          movie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
        />
      )}

      <GroupSelectModal
        isOpen={groupSelectOpen}
        onClose={() => {
          setGroupSelectOpen(false);
          setPendingMovie(null);
        }}
        onSelect={handleGroupSelect}
        groups={groupList}
        movieTitle={pendingMovie?.title || ""}
      />
    </div>
  );
};

export default Watchlist;
