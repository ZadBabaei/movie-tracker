import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import "./HeroNavbar.css";
import MovieGroupsDropdown from "./MovieGroupsDropdown";

const HeroNavbar = ({ userName }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const timeoutRef = useRef(null);
  const [groups, setGroups] = useState([]);

  const getActiveSubmenu = () => {
    if (window.location.pathname === "/inbox") return "Inbox";
    return userName; // Default to user's name
  };
    // Determine Hero Section Background and Text
  const getHeroContent = () => {
    if (window.location.pathname === "/inbox") {
      return {
        image: "https://image.tmdb.org/t/p/original/dkPPPpgs9ME6V5qrdK9yIJ7JUrI.jpg",
        text: "",
      };
    }
    return {
      image: "https://image.tmdb.org/t/p/original/7ucaMpXAmlIM24qZZ8uI9hCY0hm.jpg",
      text: "WATCH, TRACK, AND RELIVE THE FUN!",
    };
  };

  const heroContent = getHeroContent();
useEffect(() => {
    const fetchUserData = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          setLoading(false);
          return;
        }

        const res = await axios.get("http://localhost:5000/api/user/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        setUser(res.data);

        // ✅ Fetch groups
        const groupsRes = await axios.get("http://localhost:5000/api/user/groups", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setGroups(groupsRes.data);
      } catch (error) {
        console.error("❌ Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
}, []);
  
  return (
    <div>
      <nav className="glassy-navbar">
         {/* Clickable Movie Tracker Title */}
        <div className="nav-left" onClick={() => navigate("/home")} style={{ cursor: "pointer" }}>
          <span>Movie Tracker</span>
        </div>
        <div className="nav-right">
        <MovieGroupsDropdown groups={groups} /> {/* ✅ Pass groups to dropdown */}
          <a href="/upcoming-movies" >🎬 Upcoming Movies
           
          </a>
          <a href="/watchlist" >📋 Watchlist</a>

          {/* Profile Menu with Delayed Close */}
          <div className="profile-menu">
            <span className="profile-name">{getActiveSubmenu()} ▼</span>
            <div className="profile-dropdown">
              <a href="#" onClick={() => navigate("/profile")}>Profile</a>
              <a href="#" onClick={() => navigate("/inbox")}>Inbox</a>
              <a href="#" onClick={() => navigate("/")} >Logout</a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="hero-banner">
        <img src={heroContent.image} alt="Banner" className="banner-image" />
        <div className="banner-overlay" />
        <h1 className="banner-text">{heroContent.text}</h1>
      </div>
    </div>
  );
};
export default HeroNavbar;
