import React, { useState, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import "./HeroNavbar.css";

const HeroNavbar = ({ userName }) => {
  const [isProfileMenuOpen, setProfileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const timeoutRef = useRef(null);

  const handleMouseEnter = () => {
    setProfileMenuOpen(true);
    clearTimeout(timeoutRef.current);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setProfileMenuOpen(false);
    }, 2000); // Close after 2 seconds
  };

  return (
    <>
      <nav className="glassy-navbar">
        <div className="nav-left">
          <span>Movie Tracker</span>
        </div>
        <div className="nav-right">
          <a href="#">Home</a>
          <a href="#">Movies</a>
          <a href="#">Watchlist</a>
          
          {/* Profile Menu with Delayed Close */}
          <div
            className="profile-menu"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <span className="profile-name">{userName} ▼</span>
            {isProfileMenuOpen && (
              <div className="profile-dropdown">
                <a href="#">Profile</a>
                <a href="#" onClick={() => navigate("/inbox")}>Inbox</a>
                <a href="#">Logout</a>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <motion.div
        className="hero-banner"
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
      >
        <img
          src="https://image.tmdb.org/t/p/original/7ucaMpXAmlIM24qZZ8uI9hCY0hm.jpg"
          alt="Banner"
          className="banner-image"
        />
        <div className="banner-overlay" />
        <motion.h1
          className="banner-text"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
        >
          WATCH, TRACK, AND RELIVE THE FUN!
        </motion.h1>
      </motion.div>
    </>
  );
};
export default HeroNavbar;
