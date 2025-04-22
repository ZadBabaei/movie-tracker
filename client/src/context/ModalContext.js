import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import axios from "axios";

const ModalContext = createContext();
export const useModal = () => useContext(ModalContext);

export const ModalProvider = ({ children }) => {
  // Modal states
  const [isGroupsModalOpen, setIsGroupsModalOpen] = useState(false);
  const [isGroupNameModalOpen, setIsGroupNameModalOpen] = useState(false);
  const [isInviteFriendsModalOpen, setIsInviteFriendsModalOpen] =
    useState(false);
  const [isVoteModalOpen, setIsVoteModalOpen] = useState(false);

  // Data states
  const [groupList, setGroupList] = useState([]);
  const [pendingGroupName, setPendingGroupName] = useState("");
  const [createdGroupId, setCreatedGroupId] = useState(null);
  const [suggestedMovies, setSuggestedMovies] = useState([]);
  const [selectedMoviesForVote, setSelectedMoviesForVote] = useState([]);
  const [currentPoll, setCurrentPoll] = useState(null);

  // Modal actions
  const openGroupsModal = () => setIsGroupsModalOpen(true);
  const closeGroupsModal = () => setIsGroupsModalOpen(false);
  const openGroupNameModal = () => setIsGroupNameModalOpen(true);
  const closeGroupNameModal = () => setIsGroupNameModalOpen(false);
  const openInviteFriendsModal = (groupId = null) => {
    if (groupId) setCreatedGroupId(groupId);
    setIsInviteFriendsModalOpen(true);
  };
  const closeInviteFriendsModal = () => setIsInviteFriendsModalOpen(false);
  const openVoteModal = () => setIsVoteModalOpen(true);
  const closeVoteModal = () => setIsVoteModalOpen(false);

  // Movie selection logic (for poll creation)
  const handleMovieSelectForVote = useCallback((movie) => {
    setSelectedMoviesForVote((prev) => {
      const exists = prev.find((m) => m.id === movie.id);
      if (exists) {
        return prev.filter((m) => m.id !== movie.id);
      } else if (prev.length < 6) {
        return [...prev, movie];
      }
      return prev;
    });
  }, []);

  const clearVoteSelections = () => {
    setSelectedMoviesForVote([]);
  };

  // Poll management
  const createPoll = useCallback(
    async (groupId) => {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.post(
          "/api/polls/create",
          {
            groupId,
            movies: selectedMoviesForVote,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setCurrentPoll(response.data);
        return response.data;
      } catch (error) {
        console.error("Failed to create poll:", error);
        throw error;
      }
    },
    [selectedMoviesForVote]
  );

  const fetchCurrentPoll = useCallback(async (groupId) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`/api/polls/group/${groupId}/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCurrentPoll(response.data);
      return response.data;
    } catch (error) {
      console.error("Failed to fetch current poll:", error);
      setCurrentPoll(null);
      return null;
    }
  }, []);

  const completePoll = useCallback(async (pollId, winningMovie) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `/api/polls/${pollId}/complete`,
        { winningMovie },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setCurrentPoll(null);
      clearVoteSelections();
    } catch (error) {
      console.error("Failed to complete poll:", error);
      throw error;
    }
  }, []);

  const cancelPoll = useCallback(async (pollId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `/api/polls/${pollId}/cancel`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setCurrentPoll(null);
      clearVoteSelections();
    } catch (error) {
      console.error("Failed to cancel poll:", error);
      throw error;
    }
  }, []);

  // Group management
  const fetchGroups = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await axios.get("/api/groups/mine", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setGroupList(res.data);
    } catch (err) {
      console.error("Failed to fetch groups:", err);
    }
  };

  const createGroup = async (name) => {
    const token = localStorage.getItem("token");
    if (!token || !name) return;

    try {
      const res = await axios.post(
        "/api/groups/create",
        { groupName: name },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const newGroup = res.data.group;
      setCreatedGroupId(newGroup._id);
      setGroupList((prev) => [...prev, newGroup]);
      return newGroup;
    } catch (err) {
      console.error("Failed to create group:", err);
      throw err;
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  return (
    <ModalContext.Provider
      value={{
        // Modal states
        isGroupsModalOpen,
        isGroupNameModalOpen,
        isInviteFriendsModalOpen,
        isVoteModalOpen,

        // Data states
        groupList,
        pendingGroupName,
        createdGroupId,
        suggestedMovies,
        selectedMoviesForVote,
        currentPoll,

        // Modal actions
        openGroupsModal,
        closeGroupsModal,
        openGroupNameModal,
        closeGroupNameModal,
        openInviteFriendsModal,
        closeInviteFriendsModal,
        openVoteModal,
        closeVoteModal,

        // Data actions
        createGroup,
        setPendingGroupName,
        fetchGroups,
        setSuggestedMovies,
        handleMovieSelectForVote,
        clearVoteSelections,
        createPoll,
        fetchCurrentPoll,
        completePoll,
        cancelPoll,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
};
