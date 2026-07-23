import React, { useEffect, useState, useRef } from "react";
import VerticalNavbar from "../component/VerticalNavbar";
import "./GroupChat.css";
import VoteModal from "../component/VoteModal";
import ChatBox from "../component/ChatBox";
import apiClient from "../api/apiClient";
import { useModalStore } from "../store/useModalStore";
import { usePollStore, PollHistoryItem } from "../store/usePollStore";
import { useParams } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";

const GroupChat: React.FC = () => {
  const { isVoteModalOpen, openVoteModal } = useModalStore();
  const {
    clearVoteSelections,
    setCurrentPoll,
    pollHistory,
    fetchPollHistory,
    fetchPollResults,
    fetchPollById,
    deletePoll,
  } = usePollStore();
  const { slug } = useParams<{ slug: string }>();
  const [groupName, setGroupName] = useState("Loading...");
  const [groupId, setGroupId] = useState("");
  const [userId, setUserId] = useState("");
  const [menuOpenPollId, setMenuOpenPollId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const socket = useSocket(groupId);

  useEffect(() => {
    const uid = localStorage.getItem("userId");
    if (uid) setUserId(uid);
  }, []);

  useEffect(() => {
    if (!slug) return;

    const fetchGroupDetails = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await apiClient.get(`/api/groups/${slug}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setGroupName(res.data.name);
        setGroupId(res.data._id);
      } catch (error) {
        console.error("Failed to fetch group info:", error);
        setGroupName("Unknown Group");
      }
    };

    fetchGroupDetails();
  }, [slug]);

  useEffect(() => {
    if (groupId) {
      fetchPollHistory(groupId);
    }
  }, [fetchPollHistory, groupId]);

  useEffect(() => {
    // Every poll lifecycle event just refreshes the list, so a new poll appears
    // (with its Active badge) and finished ones update in real time.
    const refresh = () => {
      if (groupId) fetchPollHistory(groupId);
    };
    socket.on("poll:created", refresh);
    socket.on("poll:completed", refresh);
    socket.on("poll:runoff", refresh);
    socket.on("poll:cancelled", refresh);

    return () => {
      socket.off("poll:created", refresh);
      socket.off("poll:completed", refresh);
      socket.off("poll:runoff", refresh);
      socket.off("poll:cancelled", refresh);
    };
  }, [fetchPollHistory, socket, groupId]);

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

  // "Create a Poll" always opens a blank create form, regardless of whether
  // other polls are currently active — groups may run several polls at once.
  const handleCreateClick = () => {
    clearVoteSelections();
    setCurrentPoll(null);
    openVoteModal("create");
  };

  const handlePollStatusChange = () => {
    if (groupId) fetchPollHistory(groupId);
  };

  const handlePollCardClick = async (poll: PollHistoryItem) => {
    // Active polls open the voting view; finished ones open their results.
    if (poll.status === "active") {
      await fetchPollById(poll._id);
    } else {
      await fetchPollResults(poll._id);
    }
    openVoteModal("view");
  };

  const handleDeletePoll = async (pollId: string) => {
    await deletePoll(pollId);
    setMenuOpenPollId(null);
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
            {groupId ? <ChatBox groupId={groupId} groupName={groupName} /> : null}
          </section>
        </div>
        <div className="GroupChatPage-search-section">
          <button className="GroupChatPage-vote-btn" onClick={handleCreateClick}>
            Create a Poll
          </button>

          <h3 className="GroupChatPage-polls-title">Polls · Last 30 Days</h3>

          <div className="GroupChatPage-poll-list">
            {pollHistory.length === 0 ? (
              <p className="GroupChatPage-poll-empty">No polls in the last 30 days. Create one!</p>
            ) : (
              pollHistory.map((poll) => (
                <div
                  key={poll._id}
                  className={`GroupChatPage-poll-card${poll.status === "active" ? " GroupChatPage-poll-card--active" : ""}`}
                  data-testid="poll-history-card"
                  onClick={() => handlePollCardClick(poll)}
                >
                  <div className="GroupChatPage-poll-card-info">
                    <div className="GroupChatPage-poll-name-wrapper">
                      <div className="GroupChatPage-poll-name-row">
                        <span className="GroupChatPage-poll-card-title">{poll.name}</span>
                        {poll.status === "active" && (
                          <span className="GroupChatPage-poll-active-badge">Active</span>
                        )}
                      </div>
                      <span className="GroupChatPage-poll-card-date">{formatDate(poll.createdAt)}</span>
                    </div>
                    <span
                      className={`GroupChatPage-poll-card-result${poll.status === "active" ? " GroupChatPage-poll-card-result--active" : ""}`}
                    >
                      {poll.status === "active"
                        ? poll.hasCurrentUserVoted
                          ? "Voted"
                          : "Vote now"
                        : poll.status === "cancelled"
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
        groupId ? <VoteModal groupId={groupId} onPollStatusChange={handlePollStatusChange} /> : null
      )}
    </div>
  );
};

export default GroupChat;
