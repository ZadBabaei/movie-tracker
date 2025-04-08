import React, { useEffect, useState } from "react";
import VerticalNavbar from "../component/VerticalNavbar";
import Hero from "../component/Hero";
import "../pages/WhatToWatchPage.css";
import SearchBar from "../component/SearchBar";
import MovieCard from "../component/MovieCard";
import VoteModal from "../component/VoteModal"; 
import axios from "axios";
import ChatBox from "../component/ChatBox"; // Assuming you have a ChatBox component
import { useModal } from "../context/ModalContext"; // Import your custom context

const WhatToWatchPage = () => {
  const {
    suggestedMovies,
    addSuggestedMovie,
    isVoteModalOpen,
    openVoteModal,
    closeVoteModal,
  } = useModal();

  const currentUser = {
    name: "Zad Babaei",
    initials: "ZB",
    profilePic: null,
    userId: "user-zad", // you can customize as needed
  };

  const handleMovieSelect = (movie) => {
    addSuggestedMovie(movie, currentUser);
  };

  const [movieList, setMovieList] = useState([]);
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
            <h2 className="WhatToWatchPage-section-title">Suggested Movies</h2>

            <div className="WhatToWatchPage-suggested-container">
              {suggestedMovies.map(({ movie, suggestedBy }, index) => (
                <div
                  key={movie.id + "-suggested-" + index}
                  className="WhatToWatchPage-suggested-wrapper"
                >
                  <MovieCard
                    movie={movie}
                    onDelete={() => {}}
                    onInfoClick={() => {}}
                  />
                  <div className="WhatToWatchPage-movie-badge">
                    {suggestedBy.profilePic ? (
                      <img
                        src={suggestedBy.profilePic}
                        alt={suggestedBy.name}
                      />
                    ) : (
                      <span>{suggestedBy.initials}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              className="WhatToWatchPage-vote-btn"
              onClick={openVoteModal}
            >
              Let's Vote
            </button>
          </section>

          <section className="WhatToWatchPage-section WhatToWatchPage-chat-section">
           <ChatBox /> {/* Assuming you have a ChatBox component */}
          </section>
        </div>

        <div className="WhatToWatchPage-search-section">
          <h2 className="WhatToWatchPage-section-title">Search & Suggest</h2>
          <SearchBar onMovieSelect={handleMovieSelect} />

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

      {isVoteModalOpen && <VoteModal />}
    </div>
  );
};

export default WhatToWatchPage;
