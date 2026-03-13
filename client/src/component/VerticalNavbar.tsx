import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FaHome,
  FaUsers,
  FaEnvelope,
  FaInfoCircle,
  FaThList,
  FaSignOutAlt,
} from "react-icons/fa";
import { useModalStore } from "../store/useModalStore";
import { useUserStore } from "../store/useUserStore";
import "./VerticalNavbar.css";
import logo from "../assets/Logo PM.png";

const VerticalNavbar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { openGroupsModal } = useModalStore();
  const { profile, fetchProfile } = useUserStore();

  useEffect(() => {
    if (!profile) fetchProfile();
  }, [profile, fetchProfile]);

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
        <li className="navbar-item">
          <a href="#" className="navbar-link" onClick={handleGroupsClick}>
            <span className="icon"><FaUsers /></span>
            <span className="label">Groups</span>
          </a>
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
