import React, { useEffect, useState, useRef } from "react";
import VerticalNavbar from "../component/VerticalNavbar";
import "./GroupChat.css";
import VoteModal from "../component/VoteModal";
import ChatBox from "../component/ChatBox";
import apiClient from "../api/apiClient";
import { useModalStore } from "../store/useModalStore";
import { usePollStore } from "../store/usePollStore";
import { useParams } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";

const GroupChat: React.FC = () => {
  const { isVoteModalOpen, openVoteModal } = useModalStore();
  const { clearVoteSelections, pollHistory, fetchPollHistory, fetchPollResults, deletePoll } = usePollStore();
  const { id } = useParams<{ id: string }>();
  const [groupName, setGroupName] = useState("Loading...");
  const [pollStatus, setPollStatus] = useState("none");
  const [userId, setUserId] = useState("");
  const [menuOpenPollId, setMenuOpenPollId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const socket = useSocket(id!);

  useEffect(() => {
    const uid = localStorage.getItem("userId");
    if (uid) setUserId(uid);
  }, []);

  useEffect(() => {
    if (!id) return;

    const fetchGroupDetails = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await apiClient.get(`/api/groups/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setGroupName(res.data.name);
        setPollStatus(res.data.hasActivePoll ? "active" : "none");
      } catch (error) {
        console.error("Failed to fetch group info:", error);
        setGroupName("Unknown Group");
      }
    };

    fetchGroupDetails();
    fetchPollHistory(id);
  }, [fetchPollHistory, id]);

  useEffect(() => {
    socket.on("poll:created", () => {
      setPollStatus("active");
      if (id) fetchPollHistory(id);
    });
    socket.on("poll:completed", () => {
      setPollStatus("completed");
      if (id) fetchPollHistory(id);
    });
    socket.on("poll:runoff", () => {
      setPollStatus("active");
    });
    socket.on("poll:cancelled", () => {
      setPollStatus("none");
      if (id) fetchPollHistory(id);
    });

    return () => {
      socket.off("poll:created");
      socket.off("poll:completed");
      socket.off("poll:runoff");
      socket.off("poll:cancelled");
    };
  }, [fetchPollHistory, socket, id]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenPollId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleVoteButtonClick = () => {
    if (pollStatus === "completed") {
      clearVoteSelections();
      setPollStatus("none");
    }
    openVoteModal();
  };

  const handlePollStatusChange = (newStatus: string) => {
    setPollStatus(newStatus);
    if (newStatus === "completed" || newStatus === "none") {
      if (id) fetchPollHistory(id);
    }
  };

  const handlePollCardClick = async (pollId: string) => {
    await fetchPollResults(pollId);
    openVoteModal();
  };

  const handleDeletePoll = async (pollId: string) => {
    await deletePoll(pollId);
    setMenuOpenPollId(null);
  };

  const getButtonText = () => {
    switch (pollStatus) {
      case "active": return "Check Current Poll";
      case "completed": return "Create New Poll";
      default: return "Create a Poll";
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const isCreatorOfPoll = (poll: any) => {
    if (!poll.creator) return false;
    const creatorId = typeof poll.creator === "object" ? poll.creator._id : poll.creator;
    return creatorId === userId;
  };

  return (
    <div className="GroupChatPage-content-container">
      <VerticalNavbar />
      <header className="gc2-header">
        <p className="gc2-eyebrow">Group chat</p>
        <h1 className="gc2-title">{groupName}</h1>
        <p className="gc2-sub">Plan your next movie night together.</p>
      </header>

      <div className="GroupChatPage-layout">
        <div className="GroupChatPage-left">
          <section className="GroupChatPage-section GroupChatPage-chat-section">
            <ChatBox groupId={id!} groupName={groupName} />
          </section>
        </div>
        <div className="GroupChatPage-search-section">
          <button className="GroupChatPage-vote-btn" onClick={handleVoteButtonClick}>
            {getButtonText()}
          </button>

          <h3 className="GroupChatPage-polls-title">Polls</h3>

          <div className="GroupChatPage-poll-list">
            {pollHistory.length === 0 ? (
              <p className="GroupChatPage-poll-empty">No polls yet. Create one!</p>
            ) : (
              pollHistory.map((poll) => (
                <div
                  key={poll._id}
                  className="GroupChatPage-poll-card"
                  data-testid="poll-history-card"
                  onClick={() => handlePollCardClick(poll._id)}
                >
                  <div className="GroupChatPage-poll-card-info">
                    <div className="GroupChatPage-poll-name-wrapper">
                      <span className="GroupChatPage-poll-card-title">{poll.name}</span>
                      <span className="GroupChatPage-poll-card-date">{formatDate(poll.createdAt)}</span>
                    </div>
                    <span className="GroupChatPage-poll-card-result">
                      {poll.status === "cancelled"
                        ? "Cancelled"
                        : poll.winnerTitle
                          ? `🏆 ${poll.winnerTitle}`
                          : "In progress"
                      }
                    </span>
                  </div>
                  {isCreatorOfPoll(poll) && (
                    <div
                      className="GroupChatPage-poll-card-menu"
                      ref={menuOpenPollId === poll._id ? menuRef : null}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="GroupChatPage-poll-card-menu-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenPollId(menuOpenPollId === poll._id ? null : poll._id);
                        }}
                      >
                        ⋮
                      </button>
                      {menuOpenPollId === poll._id && (
                        <div className="GroupChatPage-poll-card-dropdown">
                          <button onClick={() => handleDeletePoll(poll._id)}>Delete</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
