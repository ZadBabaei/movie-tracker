import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FaHome,
  FaUsers,
  FaEnvelope,
  FaInfoCircle,
  FaThList,
  FaSignOutAlt,
  FaComments,
} from "react-icons/fa";
import { useModalStore } from "../store/useModalStore";
import { useUserStore } from "../store/useUserStore";
import { useGroupStore } from "../store/useGroupStore";
import { useUnreadCounts } from "../hooks/useUnreadCounts";
import "./VerticalNavbar.css";
import logo from "../assets/Logo PM.png";

const VerticalNavbar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { openGroupsModal } = useModalStore();
  const { profile, fetchProfile } = useUserStore();
  const { favoriteGroups, fetchFavoriteGroups, groupList, fetchGroups } = useGroupStore();
  const [showGroupSubmenu, setShowGroupSubmenu] = useState(false);
  const [showChatSubmenu, setShowChatSubmenu] = useState(false);
  const { unreadMap, totalUnread } = useUnreadCounts();

  useEffect(() => {
    if (!profile) fetchProfile();
    fetchFavoriteGroups();
    fetchGroups();
  }, [profile, fetchProfile, fetchFavoriteGroups, fetchGroups]);

  const submenuGroups = favoriteGroups.length > 0
    ? favoriteGroups.slice(0, 2)
    : groupList.slice(0, 2);

  const handleGroupsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (location.pathname !== "/my-groups") {
      openGroupsModal();
    }
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <nav className="vertical-navbar">
      <img className="logo logo-img" src={logo} alt="Logo" />
      <ul className="navbar-list">
        <li className="navbar-item">
          <a href="/home" className="navbar-link">
            <span className="icon"><FaHome /></span>
            <span className="label">Home</span>
          </a>
        </li>
        <li
          className="navbar-item navbar-item--groups"
          onMouseEnter={() => setShowGroupSubmenu(true)}
          onMouseLeave={() => setShowGroupSubmenu(false)}
        >
          <a href="#" className="navbar-link" onClick={handleGroupsClick}>
            <span className="icon"><FaUsers /></span>
            <span className="label">Groups</span>
          </a>
          {showGroupSubmenu && submenuGroups.length > 0 && (
            <div className="navbar-group-submenu">
              {submenuGroups.map((g) => (
                <div
                  key={g._id}
                  className="navbar-group-submenu-item"
                  onClick={() => {
                    setShowGroupSubmenu(false);
                    navigate(`/group/${g._id}`);
                  }}
                >
                  {g.name}
                </div>
              ))}
              <div
                className="navbar-group-submenu-item navbar-group-submenu-all"
                onClick={() => {
                  setShowGroupSubmenu(false);
                  navigate("/my-groups");
                }}
              >
                All Groups
              </div>
            </div>
          )}
        </li>
        <li className="navbar-item">
          <a href="/watchlist" className="navbar-link">
            <span className="icon"><FaThList /></span>
            <span className="label">Watchlist</span>
          </a>
        </li>
        <li className="navbar-item">
          <a href="/inbox" className="navbar-link">
            <span className="icon"><FaEnvelope /></span>
            <span className="label">Messages</span>
          </a>
        </li>
        <li
          className="navbar-item navbar-item--chat"
          onMouseEnter={() => setShowChatSubmenu(true)}
          onMouseLeave={() => setShowChatSubmenu(false)}
        >
          <a href="#" className="navbar-link" onClick={(e) => e.preventDefault()}>
            <span className="icon"><FaComments /></span>
            {totalUnread > 0 && <span className="unread-dot" />}
            <span className="label">Group Chats</span>
          </a>
          {showChatSubmenu && groupList.length > 0 && (
            <div className="navbar-chat-submenu">
              {groupList.slice(0, 5).map((g) => (
                <div
                  key={g._id}
                  className="navbar-chat-submenu-item"
                  onClick={() => {
                    setShowChatSubmenu(false);
                    navigate(`/group/${g._id}/chat`);
                  }}
                >
                  <span>{g.name}</span>
                  {(unreadMap[g._id] || 0) > 0 && (
                    <span className="unread-badge">{unreadMap[g._id]}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </li>
        <li className="navbar-item">
          <a href="/profile" className="navbar-link navbar-link--profile">
            {profile?.avatar ? (
              <img src={profile.avatar} alt="" className="navbar-avatar" />
            ) : (
              <span className="navbar-avatar-placeholder">
                {profile ? getInitials(profile.name) : "?"}
              </span>
            )}
            <span className="label">Profile</span>
          </a>
        </li>
        <li className="navbar-item">
          <a href="/about" className="navbar-link">
            <span className="icon"><FaInfoCircle /></span>
            <span className="label">About</span>
          </a>
        </li>
      </ul>
      <div className="navbar-logout">
        <a
          href="#"
          className="navbar-link navbar-link--logout"
          onClick={(e) => {
            e.preventDefault();
            localStorage.removeItem("token");
            useUserStore.getState().clear();
            navigate("/");
          }}
        >
          <span className="icon"><FaSignOutAlt /></span>
          <span className="label">Log Out</span>
        </a>
      </div>
    </nav>
  );
};

export default VerticalNavbar;
