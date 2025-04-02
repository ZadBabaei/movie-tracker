
import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

const ModalContext = createContext();

export const useModal = () => useContext(ModalContext);

export const ModalProvider = ({ children }) => {
  const [isGroupsModalOpen, setIsGroupsModalOpen] = useState(false);
  const [isGroupNameModalOpen, setIsGroupNameModalOpen] = useState(false);
  const [isInviteFriendsModalOpen, setIsInviteFriendsModalOpen] =
    useState(false);
  const [groupList, setGroupList] = useState([]);
  const [pendingGroupName, setPendingGroupName] = useState("");
  const [createdGroupId, setCreatedGroupId] = useState(null);

  // Modal control functions
  const openGroupsModal = () => setIsGroupsModalOpen(true);
  const closeGroupsModal = () => setIsGroupsModalOpen(false);

  const openGroupNameModal = () => setIsGroupNameModalOpen(true);
  const closeGroupNameModal = () => setIsGroupNameModalOpen(false);

const openInviteFriendsModal = (groupId = null) => {
  if (groupId) {
    setCreatedGroupId(groupId); 
  }
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


  // Reset all modals when app loads
  useEffect(() => {
    setIsGroupsModalOpen(false);
    setIsGroupNameModalOpen(false);
    setIsInviteFriendsModalOpen(false);
    fetchGroups();
  }, []);

  return (
    <ModalContext.Provider
      value={{
        // state
        isGroupsModalOpen,
        isGroupNameModalOpen,
        isInviteFriendsModalOpen,
        groupList,
        pendingGroupName,
        createdGroupId,

        // modal handlers
        openGroupsModal,
        closeGroupsModal,
        openGroupNameModal,
        closeGroupNameModal,
        openInviteFriendsModal,
        closeInviteFriendsModal,

        // actions
        createGroup,
        setPendingGroupName,
        fetchGroups,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
};
