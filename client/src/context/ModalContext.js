import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
} from "react";
import axios from "axios";

const ModalContext = createContext();
export const useModal = () => useContext(ModalContext);

export const ModalProvider = ({ children }) => {
  // --- Existing Modals ---
  const [isGroupsModalOpen, setIsGroupsModalOpen] = useState(false);
  const [isGroupNameModalOpen, setIsGroupNameModalOpen] = useState(false);
  const [isInviteFriendsModalOpen, setIsInviteFriendsModalOpen] =
    useState(false);
  const [groupList, setGroupList] = useState([]);
  const [pendingGroupName, setPendingGroupName] = useState("");
  const [createdGroupId, setCreatedGroupId] = useState(null);

  // --- Ranked Voting State ---
  const [suggestedMovies, setSuggestedMovies] = useState([]);
  const [votes, setVotes] = useState({});
  const [isVoteModalOpen, setIsVoteModalOpen] = useState(false);

  const openVoteModal = () => setIsVoteModalOpen(true);
  const closeVoteModal = () => setIsVoteModalOpen(false);

  const addSuggestedMovie = (movie, suggestedBy) => {
    setSuggestedMovies((prev) => {
      if (prev.length >= 6) return prev;
      return [...prev, { movie, suggestedBy }];
    });
  };

// const castVote = (movieId, voter) => {
//   setVotes((prevVotes) => {
//     const newVotes = { ...prevVotes };

//     // Remove the vote from this movie if it already exists
//     const alreadyVoted = newVotes[movieId]?.find(
//       (v) => v.userId === voter.userId
//     );

//     if (alreadyVoted) {
//       // Remove this vote
//       newVotes[movieId] = newVotes[movieId].filter(
//         (v) => v.userId !== voter.userId
//       );

//       // Now re-rank all votes from this user across all movies
//       const remainingVotes = Object.entries(newVotes)
//         .flatMap(([mId, userVotes]) =>
//           userVotes
//             .filter((v) => v.userId === voter.userId)
//             .map((v) => ({ ...v, movieId: mId }))
//         )
//         .sort((a, b) => a.rank - b.rank);

//       remainingVotes.forEach((v, i) => {
//         const mId = v.movieId;
//         newVotes[mId] = newVotes[mId].map((entry) =>
//           entry.userId === voter.userId ? { ...entry, rank: i + 1 } : entry
//         );
//       });

//       return { ...newVotes };
//     }

//     // Get all current user votes (after removal)
//     const currentUserVotes = Object.entries(newVotes)
//       .flatMap(([mId, userVotes]) =>
//         userVotes
//           .filter((v) => v.userId === voter.userId)
//           .map((v) => ({ ...v, movieId: mId }))
//       )
//       .sort((a, b) => a.rank - b.rank);

//     if (currentUserVotes.length >= 4) return prevVotes;

//     const nextRank = currentUserVotes.length + 1;

//     const newVote = {
//       userId: voter.userId,
//       rank: nextRank,
//       initials: voter.initials,
//       profilePic: voter.profilePic,
//     };

//     newVotes[movieId] = [...(newVotes[movieId] || []), newVote];
//     return { ...newVotes };
//   });
// };




  // Winner calculation per priority logic
  const winningMovie = useMemo(() => {
    if (suggestedMovies.length === 0 || Object.keys(votes).length === 0)
      return null;

    const calculateStats = (movieId) => {
      const vList = votes[movieId] || [];
      const rankSum = vList.reduce((sum, v) => sum + v.rank, 0);
      const rankCounts = [0, 0, 0, 0, 0]; // index = rank (1 to 4)

      vList.forEach((v) => {
        if (v.rank >= 1 && v.rank <= 4) rankCounts[v.rank]++;
      });

      return { movieId, rankSum, rankCounts };
    };

    const movieStats = suggestedMovies.map(({ movie }) =>
      calculateStats(movie.id)
    );

    // Sort logic
    movieStats.sort((a, b) => {
      if (a.rankSum !== b.rankSum) return a.rankSum - b.rankSum;

      // Compare number of 1st, 2nd... votes
      for (let i = 1; i <= 4; i++) {
        if (b.rankCounts[i] !== a.rankCounts[i]) {
          return b.rankCounts[i] - a.rankCounts[i];
        }
      }

      // Final tiebreaker: random
      return Math.random() - 0.5;
    });

    const winnerId = movieStats[0]?.movieId;
    return suggestedMovies.find(({ movie }) => movie.id === winnerId) || null;
  }, [votes, suggestedMovies]);

  // --- Group Modal Logic ---
  const openGroupsModal = () => setIsGroupsModalOpen(true);
  const closeGroupsModal = () => setIsGroupsModalOpen(false);

  const openGroupNameModal = () => setIsGroupNameModalOpen(true);
  const closeGroupNameModal = () => setIsGroupNameModalOpen(false);

  const openInviteFriendsModal = (groupId = null) => {
    if (groupId) setCreatedGroupId(groupId);
    setIsInviteFriendsModalOpen(true);
  };

  const closeInviteFriendsModal = () => setIsInviteFriendsModalOpen(false);

  const fetchGroups = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await axios.get("http://localhost:5000/api/groups/mine", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setGroupList(res.data);
    } catch (err) {
      // console.error("Error fetching groups:", err);
    }
  };

  const createGroup = async (name) => {
    const token = localStorage.getItem("token");
    if (!token || !name) return;

    try {
      const res = await axios.post(
        "http://localhost:5000/api/groups/create",
        { groupName: name },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const newGroup = res.data.group;
      setCreatedGroupId(newGroup._id);
      setGroupList((prev) => [...prev, newGroup]);

      console.log("✅ Group created with ID:", newGroup._id);
    } catch (err) {
      // console.error("Error creating group:", err);
    }
  };

  useEffect(() => {
    setIsGroupsModalOpen(false);
    setIsGroupNameModalOpen(false);
    setIsInviteFriendsModalOpen(false);
    fetchGroups();
  }, []);

  return (
    <ModalContext.Provider
      value={{
        // Existing modal state
        isGroupsModalOpen,
        isGroupNameModalOpen,
        isInviteFriendsModalOpen,
        groupList,
        pendingGroupName,
        createdGroupId,

        openGroupsModal,
        closeGroupsModal,
        openGroupNameModal,
        closeGroupNameModal,
        openInviteFriendsModal,
        closeInviteFriendsModal,
        createGroup,
        setPendingGroupName,
        fetchGroups,

        // Voting state
        suggestedMovies,
        addSuggestedMovie,
        votes,
        // castVote,
        winningMovie,
        isVoteModalOpen,
        openVoteModal,
        closeVoteModal,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
};
