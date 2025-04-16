import React, { useEffect, useState } from "react";
import VerticalNavbar from "../component/VerticalNavbar";
import Hero from "../component/Hero";
import "./GroupChat.css";
import SearchBar from "../component/SearchBar";
import MovieCard from "../component/MovieCard";
import VoteModal from "../component/VoteModal"; 
import axios from "axios";
import ChatBox from "../component/ChatBox"; 
import { useModal } from "../context/ModalContext"; 
import { useParams } from "react-router-dom";

const GroupChat = () => {
  const {
    suggestedMovies,
    addSuggestedMovie,
    isVoteModalOpen,
    openVoteModal,
    closeVoteModal,
  } = useModal();

const { id } = useParams();
const [groupName, setGroupName] = useState("Loading...");



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
useEffect(() => {
  const fetchGroupDetails = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`/api/groups/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setGroupName(res.data.name);
    } catch (error) {
      console.error("❌ Failed to fetch group info:", error);
      setGroupName("Unknown Group");
    }
  };

  fetchGroupDetails();
}, [id]);

  return (
    <div className="GroupChatPage-content-container">
      <VerticalNavbar />
      <Hero
        backgroundImage="https://image.tmdb.org/t/p/original/2Epx7F9X7DrFptn4seqn4mzBVks.jpg"
        heroText={`Group: ${groupName}`}
        heroTextSub="Plan your next movie night!"
        variant="group"
        height="50vh"
      />

      <div className="GroupChatPage-layout">
        <div className="GroupChatPage-left">
          <section className="GroupChatPage-section GroupChatPage-banner-section">
            <h2 className="GroupChatPage-section-title">Suggested Movies</h2>

            <div className="GroupChatPage-suggested-container">
              {suggestedMovies?.map(({ movie, suggestedBy }, index) => (
                <div
                  key={movie.id + "-suggested-" + index}
                  className="GroupChatPage-suggested-wrapper"
                >
                  <MovieCard
                    movie={movie}
                    onDelete={() => {}}
                    onInfoClick={() => {}}
                  />
                  <div className="GroupChatPage-movie-badge">
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

            <button className="GroupChatPage-vote-btn" onClick={openVoteModal}>
              Let's Vote
            </button>
          </section>

          <section className="GroupChatPage-section GroupChatPage-chat-section">
            <ChatBox groupId={id} />
            
          </section>
        </div>
        <div className="GroupChatPage-search-section">
          <h2 className="GroupChatPage-section-title">Search & Suggest</h2>
          <SearchBar onMovieSelect={""} />

          <div className="GroupChatPage-movie-list">
            <div className="GroupChatPage-scroll-wrapper">
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

export default GroupChat;
