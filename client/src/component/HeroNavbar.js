import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./HeroNavbar.css";
import MovieGroupsDropdown from "./MovieGroupsDropdown";

const HeroNavbar = ({ userName, backgroundImage, heroText }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [groups, setGroups] = useState([]);

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
    <main>
      <nav className="glassy-navbar">
        <div className="nav-left" onClick={() => navigate("/home")} style={{ cursor: "pointer" }}>
          <span>Movie Tracker</span>
        </div>
        <div className="nav-right">
          <MovieGroupsDropdown groups={groups} />
          <li href="/upcoming-movies">🎬 Upcoming Movies</li>
          <li href="/watchlist">📋 Watchlist</li>

          <div className="profile-menu">
            <span className="profile-name">{userName || "User"} ▼</span>
            <ul className="profile-dropdown">
              <li  onClick={() => navigate("/profile")}>Profile</li>
              <li  onClick={() => navigate("/inbox")}>Inbox</li>
              <li  onClick={() => navigate("/")}>Logout</li>
            </ul>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="hero-banner" style={{ backgroundImage: `url(${backgroundImage})` }}>
        <div className="banner-overlay" />
        {heroText && <h1 className="banner-text">{heroText}</h1>}
      </div>
    </main>
  );
};

export default HeroNavbar;
