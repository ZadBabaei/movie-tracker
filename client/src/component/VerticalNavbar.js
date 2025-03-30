import React from "react";
import "./VerticalNavbar.css";
import logo from "../assets/Logo PM.png";
import { Link } from "react-router-dom";
import {
  FaHome,
  FaUsers,
  FaListUl,
  FaEnvelope,
  FaUser,
  FaInfoCircle,
} from "react-icons/fa";

const VerticalNavbar = ({ onGroupsClick }) => {
  return (
    <nav className="vertical-navbar">
      <div className="logo">
        <img src={logo} alt="Movie Tracker Logo" className="logo-img" />
      </div>
      <ul className="navbar-menu">
        <li className="navbar-item">
          <Link to="/home " className="navbar-link">
            <span className="icon">
              <FaHome />
            </span>
            <span className="label">Home</span>
          </Link>
        </li>

        <li className="navbar-item">
          <a
            href="#"
            className="navbar-link"
            onClick={(e) => {
              e.preventDefault();
              onGroupsClick();
            }}
          >
            <span className="icon">
              <FaUsers />
            </span>
            <span className="label">Groups</span>
          </a>
        </li>

        <li className="navbar-item">
          <Link to="/watchlist" className="navbar-link">
            <span className="icon">
              <FaListUl />
            </span>
            <span className="label">Watchlist</span>
          </Link>
        </li>

        <li className="navbar-item">
          <Link to="/inbox" className="navbar-link">
            <span className="icon">
              <FaEnvelope />
            </span>
            <span className="label">Messages</span>
          </Link>
        </li>

        <li className="navbar-item">
          <Link to="/profile" className="navbar-link">
            <span className="icon">
              <FaUser />
            </span>
            <span className="label">Profile</span>
          </Link>
        </li>

        <li className="navbar-item">
          <Link to="/about" className="navbar-link">
            <span className="icon">
              <FaInfoCircle />
            </span>
            <span className="label">About</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
};

export default VerticalNavbar;
