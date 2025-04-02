import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import "./GroupPage.css";
import Hero from "../component/Hero";
import SearchBar from "../component/SearchBar";
import MovieCard from "../component/MovieCard";
import InviteModal from "../component/InviteFriendsModal"; 
import VerticalNavbar from "../component/VerticalNavbar";
import MovieModal from "../component/MovieModal";
import { useModal } from "../context/ModalContext";






const GroupPage = () => {
  const { id } = useParams();
  const [group, setGroup] = useState(null);
  const [addedMovies, setAddedMovies] = useState([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState(null);


  useEffect(() => {
    fetchGroupDetails();
  }, [id]);

  const fetchGroupDetails = async () => {
    const token = localStorage.getItem("token");
    const res = await axios.get(`http://localhost:5000/api/groups/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setGroup(res.data);
    // Populate movies from DB
    const fetchedMovies = res.data.movies.map((m) => ({
      id: m.imdbID,
      _id: m._id,
      title: m.title,
      poster_path: m.poster,
      vote_average: m.vote_average || 0, // fallback if needed
    }));
    setAddedMovies(fetchedMovies);
  };

  const handleMovieAdd = async (movie) => {
      console.log("💡 Movie being added:", movie); 
    const token = localStorage.getItem("token");

    // Save movie to DB
    await axios.post(
      `http://localhost:5000/api/groups/${id}/add-movie`,
      { movie },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Optimistically add to local state
    setAddedMovies((prev) => [...prev, movie]);
  };

  const handleDeleteMovie = async (movieId) => {
    const token = localStorage.getItem("token");
    await axios.delete(
      `http://localhost:5000/api/groups/${id}/remove-movie/${movieId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setAddedMovies((prev) => prev.filter((m) => m._id !== movieId));

  };
const { openInviteFriendsModal } = useModal();





  if (!group) return <p>Loading group...</p>;

  return (
    <div className="group-page">
      <VerticalNavbar></VerticalNavbar>
      <Hero
        height="60vh"
        backgroundImage="https://image.tmdb.org/t/p/original/vW7JMRiXuXGfxgUYovvR7iqRGtl.jpg"
        heroText={`🎬 ${group.name} Watch Club`}
        heroTextSub="lets watch movies like there is no tomorrow"
      />

      <div className="group-stats-bar">
        <p>
          👥 <strong>{group.members.length}</strong> Members &nbsp;&nbsp; 🎞️{" "}
          <strong>{addedMovies.length}</strong> Movies Watched
        </p>
      </div>

      <div className="group-content">
        {/* Members */}
        <h1 className="group-members-title">Group Members</h1>
        <div className="group-members">
          <div className="group-member-card-container">
            <div className="group-member-cards-wrapper">
              {group.members.map((member) => (
                <div key={member._id} className="member-card-glow">
                  <div className="member-avatar-wrapper">
                    <img
                      src={
                        member.profilePic ||
                        "https://i.pravatar.cc/100?u=" + member._id
                      }
                      alt={member.name}
                      className="member-avatar"
                    />
                    <span
                      className={`status-dot ${
                        member._id.endsWith("1") ? "online" : "offline"
                      }`}
                    ></span>
                  </div>
                  <div className="member-name">{member.name}</div>
                  {/* Optional badge */}
                  {member._id.endsWith("2") && (
                    <div className="badge">Top Contributor</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <button
          className="group-member-btn"
          onClick={() => openInviteFriendsModal(group._id)}
        >
          Invite Friends
        </button>

        <SearchBar onMovieSelect={handleMovieAdd} />
        <div style={{ marginTop: "30px", textAlign: "center" }}>
          <div className="movie-callout">
            <h2>🎬 Add a new movie or scroll down to relive the magic!</h2>
            <p>
              Want to talk about the latest movie? Head to the group chat and
              share your thoughts!
            </p>
          </div>
        </div>

        {/* Movies Section */}
        <div className="added-movies-wrapper">
          {addedMovies.length === 0 ? (
            <div className="empty-state">
              <h2>🎬 No movies yet!</h2>
              <p>Start adding your favorites using the search bar above.</p>
            </div>
          ) : (
            <div className="movie-grid fade-in-grid">
              {addedMovies.map((movie) => (
                <MovieCard
                  key={movie._id}
                  movie={movie}
                  onDelete={() => handleDeleteMovie(movie._id)}
                  onInfoClick={(m) => setSelectedMovie(m)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ✅ Place modal inside return */}
      {showInviteModal && (
        <InviteModal
          groupId={group._id}
          onClose={() => setShowInviteModal(false)}
        />
      )}
      {selectedMovie && (
        <MovieModal
          movie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
        />
      )}
    </div>
  );
};

export default GroupPage;