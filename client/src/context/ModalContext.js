import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

const ModalContext = createContext();

export const ModalProvider = ({ children }) => {
  const [isGroupsModalOpen, setIsGroupsModalOpen] = useState(false);
  const [groupList, setGroupList] = useState([]);

  const [isGroupNameModalOpen, setIsGroupNameModalOpen] = useState(false);
  const [isInviteFriendsModalOpen, setIsInviteFriendsModalOpen] =
    useState(false);

  const [pendingGroupName, setPendingGroupName] = useState("");
  const [pendingGroupId, setPendingGroupId] = useState(null);

  const openGroupsModal = () => setIsGroupsModalOpen(true);
  const closeGroupsModal = () => setIsGroupsModalOpen(false);

const openGroupNameModal = () => {
  console.log("🔔 openGroupNameModal called!");
  setIsGroupNameModalOpen(true);
};

  const closeGroupNameModal = () => setIsGroupNameModalOpen(false);

  const openInviteFriendsModal = () => setIsInviteFriendsModalOpen(true);
  const closeInviteFriendsModal = () => setIsInviteFriendsModalOpen(false);

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get("http://localhost:5000/api/groups/mine", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setGroupList(res.data);
      } catch (error) {
        console.error("Error fetching groups:", error);
      }
    };

    if (isGroupsModalOpen) {
      fetchGroups();
    }
  }, [isGroupsModalOpen]);

  const createGroup = async (groupName) => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        "http://localhost:5000/api/groups",
        { name: groupName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const newGroup = res.data;
      setGroupList((prev) => [...prev, newGroup]);
      setPendingGroupId(newGroup._id);
      return newGroup._id;
    } catch (error) {
      console.error("Failed to create group:", error);
    }
  };

  return (
    <ModalContext.Provider
      value={{
        isGroupsModalOpen,
        openGroupsModal,
        closeGroupsModal,
        isGroupNameModalOpen,
        openGroupNameModal,
        closeGroupNameModal,
        isInviteFriendsModalOpen,
        openInviteFriendsModal,
        closeInviteFriendsModal,
        pendingGroupName,
        setPendingGroupName,
        pendingGroupId,
        setPendingGroupId,
        groupList,
        setGroupList,
        createGroup,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
};

export const useModal = () => useContext(ModalContext);
