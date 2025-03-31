// VerticalNavbar.js
import React from "react";
import { useLocation } from "react-router-dom";
import {
  FaHome,
  FaUsers,
  FaEnvelope,
  FaUser,
  FaInfoCircle,
  FaFilm,
  FaThList,
} from "react-icons/fa";
import { useModal } from "../context/ModalContext";
import "./VerticalNavbar.css";
import logo from "../assets/Logo PM.png"; 

const VerticalNavbar = () => {
  const location = useLocation();
  const { openGroupsModal } = useModal();

  const handleGroupsClick = (e) => {
    e.preventDefault();
    if (location.pathname !== "/my-groups") {
      openGroupsModal();
    }
  };

  return (
    <nav className="vertical-navbar">
      <img className = "logo logo-img"  src={logo} alt="Logo" />
      <ul className="navbar-list">
        <li className="navbar-item">
          <a href="/home" className="navbar-link">
            <span className="icon">
              <FaHome />
            </span>
            <span className="label">Home</span>
          </a>
        </li>
        <li className="navbar-item">
          <a href="#" className="navbar-link" onClick={handleGroupsClick}>
            <span className="icon">
              <FaUsers />
            </span>
            <span className="label">Groups</span>
          </a>
        </li>
        <li className="navbar-item">
          <a href="/watchlist" className="navbar-link">
            <span className="icon">
              <FaThList />
            </span>
            <span className="label">Watchlist</span>
          </a>
        </li>
        <li className="navbar-item">
          <a href="/inbox" className="navbar-link">
            <span className="icon">
              <FaEnvelope />
            </span>
            <span className="label">Messages</span>
          </a>
        </li>
        <li className="navbar-item">
          <a href="/profile" className="navbar-link">
            <span className="icon">
              <FaUser />
            </span>
            <span className="label">Profile</span>
          </a>
        </li>
        <li className="navbar-item">
          <a href="/about" className="navbar-link">
            <span className="icon">
              <FaInfoCircle />
            </span>
            <span className="label">About</span>
          </a>
        </li>
      </ul>
    </nav>
  );
};

export default VerticalNavbar;
