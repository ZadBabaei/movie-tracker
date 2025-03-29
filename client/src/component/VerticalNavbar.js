// VerticalNavbar.js
import React from "react";
import "./VerticalNavbar.css";
import logo from "../assets/Logo PM.png"; 
import {
  FaHome,
  FaUsers,
  FaListUl,
  FaEnvelope,
  FaUser,
  FaInfoCircle,
} from "react-icons/fa";

const VerticalNavbar = () => {
  const navItems = [
    { icon: <FaHome />, label: "Home", link: "#" },
    { icon: <FaUsers />, label: "Groups", link: "#" },
    { icon: <FaListUl />, label: "Watchlist", link: "#" },
    { icon: <FaEnvelope />, label: "Messages", link: "#" },
    { icon: <FaUser />, label: "Profile", link: "#" },
    { icon: <FaInfoCircle />, label: "About", link: "#" },
  ];

  return (
    <nav className="vertical-navbar">
      <div className="logo">
        <img src={logo} alt="Movie Tracker Logo" className="logo-img" />
      </div>
      <ul className="navbar-menu">
        {navItems.map((item, index) => (
          <li className="navbar-item" key={index}>
            <a href={item.link} className="navbar-link">
              <span className="icon">{item.icon}</span>
              <span className="label">{item.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default VerticalNavbar;
