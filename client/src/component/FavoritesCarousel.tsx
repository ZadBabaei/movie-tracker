import React, { useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { FaChevronLeft, FaChevronRight, FaHeart, FaHeartBroken } from "react-icons/fa";
import "./SuggestionsCarousel.css";
import "./FavoritesCarousel.css";

interface FavoriteMovie {
  _id: string;
  title: string;
  poster?: string;
  vote_average?: number;
}

interface FavoritesCarouselProps {
  favorites: FavoriteMovie[];
  onRemoveFavorite: (movieId: string) => void;
}

const FavoritesCarousel: React.FC<FavoritesCarouselProps> = ({ favorites, onRemoveFavorite }) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: "start", slidesToScroll: 1 });
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  if (favorites.length === 0) return null;

  return (
    <div className="suggestions-carousel-wrapper favorites-carousel-wrapper">
      <h2 className="suggestions-title favorites-title">
        <FaHeart className="favorites-heart-icon" /> My Favorites
      </h2>
      <div className="suggestions-carousel">
        <button className="carousel-btn carousel-btn-prev" onClick={scrollPrev}>
          <FaChevronLeft />
        </button>
        <div className="carousel-viewport" ref={emblaRef}>
          <div className="carousel-container">
            {favorites.map((movie) => (
              <div className="carousel-slide" key={movie._id}>
                <div className="carousel-poster-wrapper">
                  <img
                    className="carousel-poster"
                    src={
                      movie.poster
                        ? movie.poster.startsWith("http")
                          ? movie.poster
                          : `https://image.tmdb.org/t/p/w500${movie.poster}`
                        : "/default-avatar.png"
                    }
                    alt={movie.title}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/default-avatar.png";
                    }}
                  />
                  <div className="carousel-overlay">
                    <span className="carousel-movie-title">{movie.title}</span>
                    <button
                      className="carousel-add-btn favorites-remove-btn"
                      onClick={() => onRemoveFavorite(movie._id)}
                    >
                      <FaHeartBroken /> Remove
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

export default FavoritesCarousel;
