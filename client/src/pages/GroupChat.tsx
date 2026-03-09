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
import { useSocket } from "../hooks/useSocket";

const GroupChat: React.FC = () => {
  const { isVoteModalOpen, openVoteModal } = useModalStore();
  const { clearVoteSelections } = usePollStore();
  const { id } = useParams<{ id: string }>();
  const [groupName, setGroupName] = useState("Loading...");
  const [groupMovies, setGroupMovies] = useState<any[]>([]);
  const [pollStatus, setPollStatus] = useState("none");
  const socket = useSocket(id!);

  useEffect(() => {
    const fetchGroupDetails = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get(`/api/groups/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setGroupName(res.data.name);
        setPollStatus(res.data.hasActivePoll ? "active" : "none");
        const movies = (res.data.movies || []).map((m: any) => ({
          ...m,
          poster_path: m.poster,
        }));
        setGroupMovies(movies);
      } catch (error) {
        console.error("Failed to fetch group info:", error);
        setGroupName("Unknown Group");
      }
    };

    fetchGroupDetails();
  }, [id]);

  useEffect(() => {
    socket.on("poll:created", () => setPollStatus("active"));
    socket.on("poll:completed", () => setPollStatus("completed"));
    socket.on("group:movie_added", ({ movie }: any) => {
      setGroupMovies((prev) => {
        const exists = prev.some((m) => m.imdbID === movie.imdbID);
        if (exists) return prev;
        return [...prev, { ...movie, poster_path: movie.poster }];
      });
    });

    return () => {
      socket.off("poll:created");
      socket.off("poll:completed");
      socket.off("group:movie_added");
    };
  }, [socket]);

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
          <h3 className="GroupChatPage-watched-title">Watched Movies</h3>
          <div className="GroupChatPage-movie-list">
            {groupMovies.length === 0 ? (
              <p className="GroupChatPage-empty-msg">No movies watched yet. Add movies from the group page!</p>
            ) : (
              groupMovies.map((movie: any, index: number) => (
                <MovieCard
                  key={`${movie.imdbID || movie._id}-${index}`}
                  movie={movie}
                  onDelete={() => {}}
                  onInfoClick={() => {}}
                />
              ))
            )}
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
