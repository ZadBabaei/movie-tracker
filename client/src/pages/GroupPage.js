import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import "./GroupPage.css";
import HeroNavbar from "../component/Hero";



const GroupPage = () => {
  const { id } = useParams(); // Get group ID from URL
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedMovie, setSelectedMovie] = useState(null);

  useEffect(() => {
    fetchGroupDetails();
  }, [id]);

  // ✅ Fetch Group Details from Backend
  const fetchGroupDetails = async () => {
    try {
      const token = localStorage.getItem("token"); // ✅ Get the token from local storage
      if (!token) {
        console.error("❌ No token found. User must log in.");
        return;
      }

      const res = await axios.get(`http://localhost:5000/api/groups/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setGroup(res.data);
    } catch (error) {
      console.error("❌ Failed to fetch group details:", error);
      setError("Unauthorized. Please log in.");
    }
  };

  // ✅ Handle Movie Search
  const handleSearch = async () => {
    if (!searchQuery) return;
    try {
      setLoading(true);
      const res = await axios.get(
        `https://www.omdbapi.com/?s=${searchQuery}&apikey=YOUR_API_KEY`
      );
      setSearchResults(res.data.Search || []);
    } catch (error) {
      setError("Failed to fetch movies.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Handle Adding a Movie to the Group
  const addMovieToGroup = async (movie) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `http://localhost:5000/api/groups/${id}/add-movie`,
        { movie },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchGroupDetails();
    } catch (error) {
      setError("Failed to add movie.");
    }
  };

  // ✅ Handle Removing a Movie (Only Creator)
  const removeMovieFromGroup = async (movieId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `http://localhost:5000/api/groups/${id}/remove-movie/${movieId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchGroupDetails();
    } catch (error) {
      setError("Failed to remove movie.");
    }
  };

  // ✅ Open Movie Details Modal
  const openMovieDetails = (movie) => {
    setSelectedMovie(movie);
  };

  if (!group) return <p>Loading group...</p>;

  return (
    <div className="group-page" >
      <div className="navbarContainer">
            <HeroNavbar
              userName={group.name}
              backgroundImage="https://image.tmdb.org/t/p/original/ybkpiCNXusXx3BrkDwLlonNaTmx.jpg"
              heroText="What we watched together so far!"
            />
      </div>
          
          <div className="group-hero">
            <h1>{group.name}</h1>
            <p>{group.members.length} Members | {group.movies.length} Movies Watched</p>
          </div>
          <div className="members-section">
            <h2>Members</h2>
            <div className="members-list" style={{ overflowX: "auto", whiteSpace: "nowrap" }}>
              {group.members.map((member) => (
                <div key={member._id} className="member-card">{member.name}</div>
              ))}
            </div>
          </div>
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search for a movie..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button onClick={handleSearch} disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map((movie) => (
                <div key={movie.imdbID} className="search-item">
                  <p>{movie.Title} ({movie.Year})</p>
                  <button onClick={() => addMovieToGroup(movie)}>Add</button>
                </div>
              ))}
            </div>
          )}
          <div className="movies-section">
            <h2>Watched Movies</h2>
            <div className="movies-grid">
              {group.movies.map((movie) => (
                <div key={movie._id} className="movie-card" onClick={() => openMovieDetails(movie)}>
                  <img src={movie.poster || "/default-movie.jpg"} alt={movie.title} />
                  <p>{movie.title}</p>
                  {group.creator === localStorage.getItem("userId") && (
                    <button onClick={() => removeMovieFromGroup(movie._id)}>Remove</button>
                  )}
                </div>
              ))}
            </div>
          </div>
          {selectedMovie && (
            <div className="movie-modal">
              <h2>{selectedMovie.title}</h2>
              <img src={selectedMovie.poster} alt={selectedMovie.title} />
              <p>More details...</p>
              <button onClick={() => setSelectedMovie(null)}>Close</button>
            </div>
          )}
          {error && <p className="error-message">{error}</p>}
          </div>
  );
};

export default GroupPage;
