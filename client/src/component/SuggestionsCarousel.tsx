import React, { useEffect, useState, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import axios from "axios";
import { FaChevronLeft, FaChevronRight, FaPlus } from "react-icons/fa";
import "./SuggestionsCarousel.css";

interface TmdbMovie {
  id: number;
  title: string;
  poster_path: string | null;
  vote_average: number;
}

interface SuggestionsCarouselProps {
  onAddToWatchlist: (movie: {
    imdbID: string;
    title: string;
    poster_path: string;
    vote_average: number;
  }) => void;
}

const SuggestionsCarousel: React.FC<SuggestionsCarouselProps> = ({ onAddToWatchlist }) => {
  const [movies, setMovies] = useState<TmdbMovie[]>([]);
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: "start", slidesToScroll: 1 },
    [Autoplay({ delay: 4000, stopOnInteraction: true })]
  );

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_TMDB_API_KEY;
    if (!apiKey) return;

    axios
      .get(`https://api.themoviedb.org/3/trending/movie/week?api_key=${apiKey}`)
      .then((res) => setMovies(res.data.results || []))
      .catch((err) => console.error("Failed to fetch trending movies:", err));
  }, []);

  const handleAdd = (movie: TmdbMovie) => {
    onAddToWatchlist({
      imdbID: `tmdb-${movie.id}`,
      title: movie.title,
      poster_path: movie.poster_path
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
        : "",
      vote_average: movie.vote_average || 0,
    });
  };

  if (movies.length === 0) return null;

  return (
    <div className="suggestions-carousel-wrapper">
      <h2 className="suggestions-title">Trending This Week</h2>
      <div className="suggestions-carousel">
        <button className="carousel-btn carousel-btn-prev" onClick={scrollPrev}>
          <FaChevronLeft />
        </button>
        <div className="carousel-viewport" ref={emblaRef}>
          <div className="carousel-container">
            {movies.map((movie) => (
              <div className="carousel-slide" key={movie.id}>
                <div className="carousel-poster-wrapper">
                  <img
                    className="carousel-poster"
                    src={
                      movie.poster_path
                        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
                        : "/default-avatar.png"
                    }
                    alt={movie.title}
                  />
                  <div className="carousel-overlay">
                    <span className="carousel-movie-title">{movie.title}</span>
                    <button
                      className="carousel-add-btn"
                      onClick={() => handleAdd(movie)}
                    >
                      <FaPlus /> Watchlist
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button className="carousel-btn carousel-btn-next" onClick={scrollNext}>
          <FaChevronRight />
        </button>
      </div>
    </div>
  );
};

export default SuggestionsCarousel;
