import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import Inbox from "./pages/inbox";
import GroupPage from "./pages/GroupPage";
import MyGroupsPage from "./pages/MyGroupsPage";
import Watchlist from "./pages/Watchlist";
import ComingSoon from "./pages/ComingSoon";
import Profile from "./pages/Profile";
import About from "./pages/About";
import GroupsModal from "./component/GroupsModal";
import GroupNameModal from "./component/GroupNameModal";
import InviteFriendsModal from "./component/InviteFriendsModal";
import OnboardingModal from "./component/OnboardingModal";

import ToastWrapper from "./component/ToastWrapper";
import GroupChat from "./pages/GroupChat";
import JoinByLink from "./pages/JoinByLink";
import Terms from "./pages/Terms";
import ResetPassword from "./pages/ResetPassword";
import ProtectedRoute from "./utils/ProtectedRoute";
import { useModalStore } from "./store/useModalStore";
import { useGroupStore } from "./store/useGroupStore";
import { useUserStore } from "./store/useUserStore";

import "./App.css";

interface AppProps {
  isAuthenticated: boolean;
  isAuthPage: boolean;
}

function App({ isAuthenticated, isAuthPage }: AppProps) {
  const {
    isGroupsModalOpen,
    isGroupNameModalOpen,
    closeGroupsModal,
    closeGroupNameModal,
  } = useModalStore();

  const {
    isInviteFriendsModalOpen,
    closeInviteFriendsModal,
    openInviteFriendsModal,
    createGroup,
    setPendingGroupName,
    groupList,
  } = useGroupStore();

  const { profile, fetchProfile } = useUserStore();
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Fetch profile on auth to check firstLogin
  useEffect(() => {
    if (isAuthenticated && !isAuthPage) {
      fetchProfile().then((p) => {
        if (p && p.firstLogin) {
          setShowOnboarding(true);
        }
      });
    }
  }, [isAuthenticated, isAuthPage, fetchProfile]);

  const showModals = isAuthenticated && !isAuthPage;

  const handleInvite = async (groupName: string) => {
    setPendingGroupName(groupName);
    await createGroup(groupName);
    openInviteFriendsModal();
    closeGroupNameModal();
  };

  const handleSkip = async (groupName: string) => {
    await createGroup(groupName);
    closeGroupNameModal();
  };

  return (
    <>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={isAuthenticated ? <Navigate to="/home" replace /> : <Login />} />
        <Route path="/signup" element={isAuthenticated ? <Navigate to="/home" replace /> : <Signup />} />
        <Route path="/invite/:token" element={<JoinByLink />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="/terms" element={<Terms />} />

        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/home" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/group/:slug" element={<GroupPage />} />
          <Route path="/group/:slug/chat" element={<GroupChat />} />
          <Route path="/my-groups" element={<MyGroupsPage />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/coming-soon" element={<ComingSoon />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/about" element={<About />} />
        </Route>
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

      {/* Onboarding for first-time users */}
      {showOnboarding && (
        <OnboardingModal onComplete={() => setShowOnboarding(false)} />
      )}

      <ToastWrapper />
    </>
  );
}

export default App;
