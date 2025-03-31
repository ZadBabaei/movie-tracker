import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
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
import ToastWrapper from "./component/ToastWrapper";
import { useModal } from "./context/ModalContext"; 
import "./App.css";

function App() {
  const { isGroupsModalOpen, closeGroupsModal, groupList } = useModal();

  return (
    <Router>
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


      <GroupsModal
        isOpen={isGroupsModalOpen}
        onClose={closeGroupsModal}
        groups={groupList}
        onCreateGroup={closeGroupsModal}
      />
      <ToastWrapper />
    </Router>
  );
}

export default App;
