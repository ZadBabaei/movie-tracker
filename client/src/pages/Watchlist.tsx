import React, { useEffect, useState } from "react";
import { FaFilm } from "react-icons/fa";
import "./Watchlist.css";
import Hero from "../component/Hero";
import SearchBar from "../component/SearchBar";
import MovieCard from "../component/MovieCard";
import MovieModal from "../component/MovieModal";
import VerticalNavbar from "../component/VerticalNavbar";
import SuggestionsCarousel from "../component/SuggestionsCarousel";
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

  useEffect(() => {
    fetchWatchlist();
    fetchGroups();
  }, [fetchWatchlist, fetchGroups]);

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
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedMovie && (
        <MovieModal
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
