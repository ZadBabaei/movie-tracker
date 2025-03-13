import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import "./GroupPage.css";
import Navbar from "../component/Navbar";
import Hero from "../component/Hero";

const GroupPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchGroupDetails();
  }, [id]);

  const fetchGroupDetails = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("❌ No token found. Please log in.");
        return;
      }
      const res = await axios.get(`http://localhost:5000/api/groups/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setGroup(res.data);
    } catch (error) {
      setError("❌ Failed to fetch group details. Try again.");
    }
  };

  const handleSearch = async () => {
    if (!searchQuery) return;
    try {
      setLoading(true);
      const res = await axios.get(
        `https://api.themoviedb.org/3/search/movie?api_key=YOUR_TMDB_API_KEY&query=${searchQuery}`
      );
      setSearchResults(res.data.results || []);
    } catch (error) {
      setError("Failed to fetch movies.");
    } finally {
      setLoading(false);
    }
  };

  if (!group) return <p>Loading group...</p>;


    return (
    <div className="group-page">
      <Navbar userName={group.name} />
      <Hero
        backgroundImage="https://image.tmdb.org/t/p/original/nxmumfhlU7jCCZDlopSzO8hxjBo.jpg"
        heroText="What we watched together so far!"
      />
      <div className="group-content">
        <div className="group-members">
          <h1 className="group-members-title">Group Members</h1>
          <div className="group-member-card-container">
            {group.members.map((member) => (
              <div key={member._id} className="group-members-card">
                <img
                  src={member.profilePic || "https://i.pravatar.cc/100"}
                  alt={member.name}
                />
                <div className="divider"></div>
                <h2>{member.name}</h2>
              </div>
            ))}
          </div>
          <button className="group-member-btn">Invite Friends</button>
        </div>
        <div className="group-movie-search-container">
          <input
            type="text"
            placeholder="Search for a movie..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className="movie-search-bt" onClick={handleSearch}>
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupPage;
