import React, { useEffect, useState } from "react";
import VerticalNavbar from "../component/VerticalNavbar";
import Hero from "../component/Hero";
import "./GroupChat.css";
import MovieCard from "../component/MovieCard";
import VoteModal from "../component/VoteModal";
import axios from "axios";
import ChatBox from "../component/ChatBox";
import { useModalStore } from "../store/useModalStore";
import { usePollStore } from "../store/usePollStore";
import { useParams } from "react-router-dom";

const GroupChat: React.FC = () => {
  const { isVoteModalOpen, openVoteModal } = useModalStore();
  const { clearVoteSelections } = usePollStore();
  const { id } = useParams<{ id: string }>();
  const [groupName, setGroupName] = useState("Loading...");
  const [movieList, setMovieList] = useState<any[]>([]);
  const [pollStatus, setPollStatus] = useState("none");

  useEffect(() => {
    const fetchGroupDetails = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get(`/api/groups/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setGroupName(res.data.name);
        setPollStatus(res.data.hasActivePoll ? "active" : "none");
      } catch (error) {
        console.error("Failed to fetch group info:", error);
        setGroupName("Unknown Group");
      }
    };

    const fetchMovieList = async () => {
      try {
        const pagesToFetch = 2;
        const allMovies: any[] = [];
        for (let page = 1; page <= pagesToFetch; page++) {
          const res = await axios.get(
            `https://api.themoviedb.org/3/movie/popular?api_key=${process.env.REACT_APP_TMDB_API_KEY}&language=en-US&page=${page}`
          );
          allMovies.push(...res.data.results);
        }
        setMovieList(allMovies);
      } catch (error) {
        console.error("Failed to fetch movies from TMDB:", error);
      }
    };

    fetchGroupDetails();
    fetchMovieList();

    const pollInterval = setInterval(fetchGroupDetails, 15000);
    return () => clearInterval(pollInterval);
  }, [id]);

  const handleVoteButtonClick = () => {
    if (pollStatus === "completed") {
      clearVoteSelections();
      setPollStatus("none");
    }
    openVoteModal();
  };

  const handlePollStatusChange = (newStatus: string) => {
    setPollStatus(newStatus);
  };

  const getButtonText = () => {
    switch (pollStatus) {
      case "active": return "Check Current Poll";
      case "completed": return "Create New Poll";
      default: return "Create a Poll";
    }
  };

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
          <section className="GroupChatPage-section GroupChatPage-chat-section">
            <ChatBox groupId={id!} />
          </section>
        </div>
        <div className="GroupChatPage-search-section">
          <button className="GroupChatPage-vote-btn" onClick={handleVoteButtonClick}>
            {getButtonText()}
          </button>
          <div className="GroupChatPage-movie-list">
            <div className="GroupChatPage-scroll-wrapper">
              {movieList.map((movie, index) => (
                <MovieCard
                  key={`${movie.id}-${index}`}
                  movie={movie}
                  onDelete={() => {}}
                  onInfoClick={() => {}}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      {isVoteModalOpen && (
        <VoteModal groupId={id!} onPollStatusChange={handlePollStatusChange} />
      )}
    </div>
  );
};

export default GroupChat;
