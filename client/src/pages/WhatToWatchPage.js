import React, { useState, useEffect } from "react";
import VerticalNavbar from "../component/VerticalNavbar";
import Hero from "../component/Hero";
import "../pages/WhatToWatchPage.css";
import SearchBar from "../component/SearchBar";
import MovieCard from "../component/MovieCard";
import axios from "axios";

const WhatToWatchPage = () => {
  const [suggestedMovies, setSuggestedMovies] = useState([]);
  const [movieList, setMovieList] = useState([]);

  const handleMovieSelect = (movie) => {
    setSuggestedMovies((prev) => [...prev, movie]);
  };

  const TMDB_API_KEY = process.env.REACT_APP_TMDB_API_KEY;

  useEffect(() => {
    const fetchPopularMovies = async () => {
      try {
        const pagesToFetch = 2;
        const allMovies = [];

        for (let page = 1; page <= pagesToFetch; page++) {
          const res = await axios.get(
            `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=en-US&page=${page}`
          );

          allMovies.push(...res.data.results);
        }

        setMovieList(allMovies);
      } catch (error) {
        console.error("Failed to fetch movies from TMDB:", error);
      }
    };

    fetchPopularMovies();
  }, []);
    
    useEffect(() => {
      const container = document.querySelector(
        ".WhatToWatchPage-selected-movie"
      );

      const handleWheel = (e) => {
        if (!container) return;

        const atBottom =
          container.scrollTop + container.clientHeight >=
          container.scrollHeight;

        if (atBottom && e.deltaY > 0) {
          e.preventDefault();
          window.scrollBy({
            top: e.deltaY,
            left: 0,
            behavior: "smooth",
          });
        }
      };

      if (container) {
        container.addEventListener("wheel", handleWheel, { passive: false });
      }

      return () => {
        if (container) {
          container.removeEventListener("wheel", handleWheel);
        }
      };
    }, []);


  return (
    <div className="WhatToWatchPage-content-container">
      <VerticalNavbar />

      <Hero
        backgroundImage="https://image.tmdb.org/t/p/original/2Epx7F9X7DrFptn4seqn4mzBVks.jpg"
        heroText="What to Watch"
        heroTextSub="Pick your next group movie night!"
        variant="group"
        height="50vh"
      />

      <div className="WhatToWatchPage-layout">
        <div className="WhatToWatchPage-left">
          <section className="WhatToWatchPage-section WhatToWatchPage-banner-section">
            <p className="WhatToWatchPage-placeholder">
              [Winning movie banner or poll results here]
            </p>
          </section>

          <section className="WhatToWatchPage-section WhatToWatchPage-chat-section">
            <h2 className="WhatToWatchPage-section-title">Group Chat</h2>
            <p className="WhatToWatchPage-placeholder">
              [Chat box will go here]
            </p>
          </section>
        </div>

        <div className="WhatToWatchPage-search-section">
          <h2 className="WhatToWatchPage-section-title">Search & Suggest</h2>

          <SearchBar onMovieSelect={handleMovieSelect} />

          <div className="WhatToWatchPage-selected-movie">
            {suggestedMovies.map((movie, index) => (
              <MovieCard
                key={movie.id + "-selected-" + index}
                movie={movie}
                onDelete={() => {}}
                onInfoClick={() => {}}
              />
            ))}
          </div>

          <div className="WhatToWatchPage-movie-list">
            <div className="WhatToWatchPage-scroll-wrapper">
              {[...movieList, ...movieList].map((movie, index) => (
                <MovieCard
                  key={movie.id + "-loop-" + index}
                  movie={movie}
                  onDelete={() => {}}
                  onInfoClick={() => {}}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhatToWatchPage;
