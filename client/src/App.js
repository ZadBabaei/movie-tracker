import React from "react";
import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import Inbox from "./pages/inbox";
import GroupPage from "./pages/GroupPage";
import MyGroupsPage from "./pages/MyGroupsPage";
import Watchlist from "./pages/Watchlist";
import Profile from "./pages/Profile";
import About from "./pages/About";
import GroupsModal from "./component/GroupsModal";
import GroupNameModal from "./component/GroupNameModal";
import InviteFriendsModal from "./component/InviteFriendsModal";
import ToastWrapper from "./component/ToastWrapper";
import { useModal } from "./context/ModalContext";
import "./App.css";

function App({ isAuthenticated, isAuthPage }) {
  const {
    isGroupsModalOpen,
    isGroupNameModalOpen,
    isInviteFriendsModalOpen,
    closeGroupsModal,
    closeGroupNameModal,
    closeInviteFriendsModal,
    openInviteFriendsModal,
    createGroup,
    setPendingGroupName,
    groupList,
  } = useModal();

  const showModals = isAuthenticated && !isAuthPage;

  const handleInvite = async (groupName) => {
    setPendingGroupName(groupName);
    await createGroup(groupName);
    openInviteFriendsModal();
    closeGroupNameModal();
  };

  const handleSkip = async (groupName) => {
    await createGroup(groupName);
    closeGroupNameModal();
  };

  return (
    <>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/home" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/group/:id" element={<GroupPage />} />
        <Route path="/my-groups" element={<MyGroupsPage />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/about" element={<About />} />
      </Routes>

      {showModals && (
        <>
          <GroupsModal
            isOpen={isGroupsModalOpen}
            onClose={closeGroupsModal}
            groups={groupList}
          />
          <GroupNameModal
            isOpen={isGroupNameModalOpen}
            onClose={closeGroupNameModal}
            onInvite={handleInvite}
            onSkip={handleSkip}
          />
          <InviteFriendsModal
            isOpen={isInviteFriendsModalOpen}
            onClose={closeInviteFriendsModal}
          />
        </>
      )}

      <ToastWrapper />
    </>
  );
}

export default App;
