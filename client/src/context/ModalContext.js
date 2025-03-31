// ModalContext.js
import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

const ModalContext = createContext();

export const ModalProvider = ({ children }) => {
  const [isGroupsModalOpen, setIsGroupsModalOpen] = useState(false);
  const [groupList, setGroupList] = useState([]);

  const openGroupsModal = () => setIsGroupsModalOpen(true);
  const closeGroupsModal = () => setIsGroupsModalOpen(false);

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

  return (
    <ModalContext.Provider
      value={{
        isGroupsModalOpen,
        openGroupsModal,
        closeGroupsModal,
        groupList,
        setGroupList,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
};

export const useModal = () => useContext(ModalContext);
