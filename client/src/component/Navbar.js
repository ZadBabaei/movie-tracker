import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MovieGroupsDropdown from './MovieGroupsDropdown';
import "./Navbar.css";
import axios from "axios";

const Navbar = ({ groups: initialGroups, userName, groupName }) => {
    const navigate = useNavigate();
      const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [groups, setGroups] = useState(initialGroups);

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
      <nav className="glassy-navbar">
        <div
          className="nav-left"
          onClick={() => navigate("/home")}
          style={{ cursor: "pointer" }}
        >
          <span>Movie Tracker</span>
        </div>
        <ul className="nav-right">
          <MovieGroupsDropdown groups={groups} />
          <li> Upcoming Movies</li>
          <li> Watchlist</li>
          <li className="profile-menu">
            <span className="profile-name">
              {useLocation().pathname.startsWith("/group/")
                ? groupName || "Group"
                : user
                ? user.name
                : "User"}
            </span>

            <ul className="profile-dropdown">
              <li onClick={() => navigate("/profile")}>Profile</li>
              <li onClick={() => navigate("/inbox")}>Inbox</li>
              <li onClick={() => navigate("/")}>Logout</li>
            </ul>
          </li>
        </ul>
      </nav>
    );
};

export default Navbar;