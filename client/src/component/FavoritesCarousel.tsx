import React, { useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { FaChevronLeft, FaChevronRight, FaHeart, FaHeartBroken } from "react-icons/fa";
import { getAvatarUrl, handleAvatarError } from "../utils/avatar";
import "./SuggestionsCarousel.css";
import "./FavoritesCarousel.css";

interface FavoriteLover {
  _id: string;
  name: string;
  avatar?: string;
}

interface FavoriteMovie {
  _id: string;
  title: string;
  poster?: string;
  vote_average?: number;
  lovedBy?: FavoriteLover[];
}

interface FavoritesCarouselProps {
  favorites: FavoriteMovie[];
  onRemoveFavorite: (movieId: string) => void;
  title?: string;
  currentUserId?: string;
  onAddFavorite?: (movieId: string) => void;
}

const MAX_VISIBLE_AVATARS = 4;

const FavoritesCarousel: React.FC<FavoritesCarouselProps> = ({
  favorites,
  onRemoveFavorite,
  title = "Favorites",
  currentUserId,
  onAddFavorite,
}) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: "start", slidesToScroll: 1 });
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  if (favorites.length === 0) return null;

  return (
    <div className="suggestions-carousel-wrapper favorites-carousel-wrapper">
      <h2 className="suggestions-title favorites-title">
        <FaHeart className="favorites-heart-icon" /> {title}
      </h2>
      <div className="suggestions-carousel">
        <button className="carousel-btn carousel-btn-prev" onClick={scrollPrev}>
          <FaChevronLeft />
        </button>
        <div className="carousel-viewport" ref={emblaRef}>
          <div className="carousel-container">
            {favorites.map((movie) => {
              const lovedBy = movie.lovedBy;
              const hasLovedByInfo = Array.isArray(lovedBy);
              // The favorite endpoint toggles, so we must know who the viewer is
              // before offering an action — otherwise "Love it too" would render
              // on a movie they already love and silently un-favorite it.
              const knowsViewer = !hasLovedByInfo || !!currentUserId;
              const iAlreadyLoveIt = hasLovedByInfo
                ? !!currentUserId && lovedBy!.some((m) => m._id === currentUserId)
                : true;
              const visibleLovers = hasLovedByInfo ? lovedBy!.slice(0, MAX_VISIBLE_AVATARS) : [];
              const overflowCount = hasLovedByInfo
                ? Math.max(lovedBy!.length - MAX_VISIBLE_AVATARS, 0)
                : 0;

              return (
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
                      {hasLovedByInfo && (
                        <div className="favorites-lovedby-row">
                          <div className="favorites-lovedby-avatars">
                            {visibleLovers.map((lover) => (
                              <img
                                key={lover._id}
                                className="favorites-lovedby-avatar"
                                src={getAvatarUrl(lover)}
                                alt={lover.name}
                                title={lover.name}
                                onError={(event) => handleAvatarError(event, lover)}
                              />
                            ))}
                            {overflowCount > 0 && (
                              <span className="favorites-lovedby-overflow">
                                +{overflowCount}
                              </span>
                            )}
                          </div>
                          <span className="favorites-lovedby-count">
                            <FaHeart /> {lovedBy!.length}
                          </span>
                        </div>
                      )}
                      {!knowsViewer ? null : hasLovedByInfo && !iAlreadyLoveIt ? (
                        <button
                          className="carousel-add-btn favorites-love-btn"
                          onClick={() => onAddFavorite?.(movie._id)}
                        >
                          <FaHeart /> Love it too
                        </button>
                      ) : (
                        <button
                          className="carousel-add-btn favorites-remove-btn"
                          onClick={() => onRemoveFavorite(movie._id)}
                        >
                          <FaHeartBroken /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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
