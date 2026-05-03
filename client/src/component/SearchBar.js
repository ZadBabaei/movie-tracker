import React, { useEffect, useState } from "react";
import axios from "axios";
import "./SearchBar.css";

const SearchBar = ({ onMovieSelect }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const apiKey = process.env.REACT_APP_TMDB_API_KEY; 
  const baseUrl = "https://api.themoviedb.org/3/search/movie";

  const fetchMovies = async (q, signal) => {
    if (q.length <= 1) {
      setResults([]);
      return;
    }
    try {
      setLoading(true);

      const res = await axios.get(
        `${baseUrl}?api_key=${apiKey}&language=en-US&include_adult=false&query=${encodeURIComponent(
          q
        )}`,
        { signal }
      );
      setResults(res.data.results || []);
    } catch (error) {
      if (axios.isCancel(error) || error.name === "CanceledError") return;
      console.error("API Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const trimmedQuery = query.trim();
    const controller = new AbortController();

    if (trimmedQuery.length <= 1) {
      setResults([]);
      setLoading(false);
      return () => controller.abort();
    }

    const timeoutId = setTimeout(() => {
      fetchMovies(trimmedQuery, controller.signal);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query]);

  const handleChange = (e) => {
    setQuery(e.target.value);
  };

  const handleSearchClick = () => {
    fetchMovies(query.trim());
  };

  const handleSelect = (movie) => {
    const formattedMovie = {
      id: movie.id, 
      imdbID: `tmdb-${movie.id}`,
      title: movie.title,
      poster_path: `https://image.tmdb.org/t/p/w500${movie.poster_path}`,
      vote_average: movie.vote_average || 0,
    };

    onMovieSelect(formattedMovie);
    setQuery("");
    setResults([]);
  };

  return (
    <div className="search-bar-glass-wrapper">
      <div className="search-bar-glass">
        <input
          type="text"
          placeholder="Search for a movie..."
          value={query}
          onChange={handleChange}
        />
        <button onClick={handleSearchClick} className="search-btn-glass">
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {results.length > 0 && (
        <ul className="suggestions-list-glass">
          {results.slice(0, 5).map((movie) => (
            <li key={movie.id} onClick={() => handleSelect(movie)}>
              {movie.title} ({movie.release_date?.substring(0, 4)})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchBar;
