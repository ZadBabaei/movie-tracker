import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  FaHome,
  FaUsers,
  FaEnvelope,
  FaInfoCircle,
  FaThList,
  FaCalendarAlt,
  FaSignOutAlt,
  FaComments,
  FaEllipsisH,
} from "react-icons/fa";
import { useModalStore } from "../store/useModalStore";
import { useUserStore } from "../store/useUserStore";
import { useGroupStore } from "../store/useGroupStore";
import { useUnreadCounts } from "../hooks/useUnreadCounts";
import { getAvatarUrl, handleAvatarError } from "../utils/avatar";
import "./VerticalNavbar.css";
import logo from "../assets/Logo PM.png";

const VerticalNavbar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { openGroupsModal } = useModalStore();
  const { profile, fetchProfile } = useUserStore();
  const { favoriteGroups, fetchFavoriteGroups, groupList, fetchGroups } = useGroupStore();
  const { unreadMap, totalUnread } = useUnreadCounts();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  useEffect(() => {
    if (!profile) fetchProfile();
    fetchFavoriteGroups();
    fetchGroups();
  }, [profile, fetchProfile, fetchFavoriteGroups, fetchGroups]);

  useEffect(() => {
    setIsMoreOpen(false);
  }, [location.pathname]);

  const submenuGroups = favoriteGroups.length > 0
    ? favoriteGroups.slice(0, 2)
    : groupList.slice(0, 2);
  const chatQuickGroups = groupList.slice(0, 2);

  const handleGroupsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (location.pathname !== "/my-groups") {
      openGroupsModal();
    }
  };

  const currentGroupId = useMemo(() => {
    const match = location.pathname.match(/^\/group\/([^/]+)/);
    return match?.[1];
  }, [location.pathname]);

  const goToGroupChat = () => {
    if (currentGroupId) {
      navigate(`/group/${currentGroupId}/chat`);
      return;
    }

    const fallbackGroup = favoriteGroups[0] || groupList[0];
    navigate(fallbackGroup ? `/group/${fallbackGroup._id}/chat` : "/my-groups");
  };

  const logout = () => {
    localStorage.removeItem("token");
    useUserStore.getState().clear();
    navigate("/");
  };

  const isActive = (paths: string[]) =>
    paths.some((path) =>
      path.endsWith("*")
        ? location.pathname.startsWith(path.slice(0, -1))
        : location.pathname === path
    );

  return (
    <>
    <nav className="vertical-navbar">
      <img className="logo logo-img" src={logo} alt="Logo" />
      <ul className="navbar-list">
        <li className="navbar-item">
          <Link to="/home" className="navbar-link">
            <span className="icon"><FaHome /></span>
            <span className="label">Home</span>
          </Link>
        </li>
        <li className="navbar-item navbar-item--groups">
          <Link to="/my-groups" className="navbar-link" onClick={handleGroupsClick}>
            <span className="icon"><FaUsers /></span>
            <span className="label">Groups</span>
          </Link>
          <div className="navbar-hover-row" aria-label="Groups quick links">
            <button
              type="button"
              className="navbar-hover-pill navbar-hover-pill--primary"
              onClick={handleGroupsClick}
            >
              Groups
            </button>
            {submenuGroups.map((g) => (
              <button
                key={g._id}
                type="button"
                className="navbar-hover-pill"
                onClick={() => {
                  navigate(`/group/${g._id}`);
                }}
              >
                <span className="navbar-hover-pill-text">{g.name}</span>
              </button>
            ))}
          </div>
        </li>
        <li className="navbar-item">
          <Link to="/watchlist" className="navbar-link">
            <span className="icon"><FaThList /></span>
            <span className="label">Watchlist</span>
          </Link>
        </li>
        <li className="navbar-item">
          <Link to="/coming-soon" className="navbar-link">
            <span className="icon"><FaCalendarAlt /></span>
            <span className="label">Coming Soon</span>
          </Link>
        </li>
        <li className="navbar-item">
          <Link to="/inbox" className="navbar-link">
            <span className="icon"><FaEnvelope /></span>
            <span className="label">Messages</span>
          </Link>
        </li>
        <li className="navbar-item navbar-item--chat">
          <a
            href="#"
            className="navbar-link"
            onClick={(e) => {
              e.preventDefault();
              goToGroupChat();
            }}
          >
            <span className="icon"><FaComments /></span>
            {totalUnread > 0 && <span className="unread-dot" />}
            <span className="label">Group Chats</span>
          </a>
          <div className="navbar-hover-row" aria-label="Group chat quick links">
            <button
              type="button"
              className="navbar-hover-pill navbar-hover-pill--primary"
              onClick={goToGroupChat}
            >
              Group Chats
            </button>
            {chatQuickGroups.map((g) => (
              <button
                key={g._id}
                type="button"
                className="navbar-hover-pill navbar-hover-pill--chat"
                onClick={() => {
                  navigate(`/group/${g._id}/chat`);
                }}
              >
                <span className="navbar-hover-pill-text">{g.name}</span>
                {(unreadMap[g._id] || 0) > 0 && (
                  <span className="unread-badge">{unreadMap[g._id]}</span>
                )}
              </button>
            ))}
          </div>
        </li>
        <li className="navbar-item">
          <Link to="/profile" className="navbar-link navbar-link--profile">
            <img
              src={getAvatarUrl(profile || {})}
              alt=""
              className="navbar-avatar"
              onError={(event) => handleAvatarError(event, profile || {})}
            />
            <span className="label">Profile</span>
          </Link>
        </li>
        <li className="navbar-item">
          <Link to="/about" className="navbar-link">
            <span className="icon"><FaInfoCircle /></span>
            <span className="label">About</span>
          </Link>
        </li>
      </ul>
      <div className="navbar-logout">
        <a
          href="#"
          className="navbar-link navbar-link--logout"
          onClick={(e) => {
            e.preventDefault();
            logout();
          }}
        >
          <span className="icon"><FaSignOutAlt /></span>
          <span className="label">Log Out</span>
        </a>
      </div>
    </nav>
    <nav className="mobile-bottom-nav" aria-label="Primary navigation">
      <button
        type="button"
        className={`mobile-nav-item ${isActive(["/home"]) ? "active" : ""}`}
        onClick={() => navigate("/home")}
      >
        <FaHome />
        <span>Home</span>
      </button>
      <button
        type="button"
        className={`mobile-nav-item ${isActive(["/my-groups", "/group/*"]) ? "active" : ""}`}
        onClick={() => navigate("/my-groups")}
      >
        <FaUsers />
        <span>Groups</span>
      </button>
      <button
        type="button"
        className={`mobile-nav-item ${isActive(["/watchlist"]) ? "active" : ""}`}
        onClick={() => navigate("/watchlist")}
      >
        <FaThList />
        <span>Watchlist</span>
      </button>
      <button
        type="button"
        className={`mobile-nav-item ${location.pathname.endsWith("/chat") ? "active" : ""}`}
        onClick={goToGroupChat}
      >
        <span className="mobile-nav-icon-wrap">
          <FaComments />
          {totalUnread > 0 && <span className="mobile-unread-dot" />}
        </span>
        <span>Chat</span>
      </button>
      <div className="mobile-more-wrap">
        <button
          type="button"
          className={`mobile-nav-item ${isMoreOpen || isActive(["/profile", "/inbox", "/about", "/coming-soon"]) ? "active" : ""}`}
          onClick={() => setIsMoreOpen((open) => !open)}
          aria-expanded={isMoreOpen}
          aria-haspopup="menu"
        >
          <FaEllipsisH />
          <span>More</span>
        </button>
        {isMoreOpen && (
          <div className="mobile-more-menu" role="menu">
            <button type="button" onClick={() => navigate("/profile")} role="menuitem">
              Profile
            </button>
            <button type="button" onClick={() => navigate("/coming-soon")} role="menuitem">
              Coming Soon
            </button>
            <button type="button" onClick={() => navigate("/inbox")} role="menuitem">
              Inbox
            </button>
            <button type="button" onClick={() => navigate("/about")} role="menuitem">
              About
            </button>
            <button type="button" onClick={logout} role="menuitem">
              Log Out
            </button>
          </div>
        )}
      </div>
    </nav>
    </>
  );
};

export default VerticalNavbar;
