import React from "react";
import { motion } from "framer-motion";

const HeroNavbar = () => {
  return (
    <>
    {/* Navbar */}
        <nav className="glassy-navbar">
          <div className="nav-left">
            <span>Movie Tracker</span>
          </div>
          <div className="nav-right">
            <a href="#">Home</a>
            <a href="#">Movies</a>
            <a href="#">Watchlist</a>
            <a href="#">Profile (Username)</a>
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
