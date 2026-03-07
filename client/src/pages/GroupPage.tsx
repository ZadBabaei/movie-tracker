import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import "./GroupPage.css";
import Hero from "../component/Hero";
import SearchBar from "../component/SearchBar";
import MovieCard from "../component/MovieCard";
import InviteModal from "../component/InviteFriendsModal";
import VerticalNavbar from "../component/VerticalNavbar";
import MovieModal from "../component/MovieModal";
import { useGroupStore } from "../store/useGroupStore";

interface Member {
  _id: string;
  name: string;
  profilePic?: string;
}

interface Movie {
  id: string;
  _id: string;
  title: string;
  poster_path?: string;
  vote_average: number;
}

interface GroupData {
  _id: string;
  name: string;
  members: Member[];
}

const GroupPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [group, setGroup] = useState<GroupData | null>(null);
  const [addedMovies, setAddedMovies] = useState<Movie[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

  const { openInviteFriendsModal } = useGroupStore();

  useEffect(() => {
    fetchGroupDetails();
  }, [id]);

  const fetchGroupDetails = async () => {
    const token = localStorage.getItem("token");
    const res = await axios.get(`http://localhost:5000/api/groups/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setGroup(res.data);

    const fetchedMovies: Movie[] = res.data.movies.map((m: any) => ({
      id: m.imdbID,
      _id: m._id,
      title: m.title,
      poster_path: m.poster,
      vote_average: m.vote_average || 0,
    }));
    setAddedMovies(fetchedMovies);
  };

  const handleMovieAdd = async (movie: any) => {
    const token = localStorage.getItem("token");
    const res = await axios.post(
      `http://localhost:5000/api/groups/${id}/add-movie`,
      { movie },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const saved = res.data.movie;
    setAddedMovies((prev) => [
      ...prev,
      {
        id: saved.imdbID,
        _id: saved._id,
        title: saved.title,
        poster_path: saved.poster,
        vote_average: saved.vote_average || 0,
      },
    ]);
  };

  const handleDeleteMovie = async (movieId: string) => {
    const token = localStorage.getItem("token");
    await axios.delete(
      `http://localhost:5000/api/groups/${id}/remove-movie/${movieId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setAddedMovies((prev) => prev.filter((m) => m._id !== movieId));
  };

  if (!group) return <p>Loading group...</p>;

  return (
    <div className="group-page">
      <VerticalNavbar />
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
        <h1 className="group-members-title">Group Members</h1>
        <div className="group-members">
          <div className="group-member-card-container">
            <div className="group-member-cards-wrapper">
              {group.members.map((member) => (
                <div key={member._id} className="member-card-glow">
                  <div className="member-avatar-wrapper">
                    <img
                      src={member.profilePic || "https://i.pravatar.cc/100?u=" + member._id}
                      alt={member.name}
                      className="member-avatar"
                    />
                    <span className="status-dot offline"></span>
                  </div>
                  <div className="member-name">{member.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="group-member-btns">
          <button
            className="group-member-btn"
            onClick={() => openInviteFriendsModal(group._id)}
          >
            Invite Friends
          </button>
          <button
            className="group-member-btn"
            onClick={() => navigate(`/group/${group._id}/chat`)}
          >
            Group chat
          </button>
        </div>

        <SearchBar onMovieSelect={handleMovieAdd} />
        <div style={{ marginTop: "30px", textAlign: "center" }}>
          <div className="movie-callout">
            <h2>🎬 Add a new movie or scroll down to relive the magic!</h2>
            <p>
              Want to talk about the latest movie? Head to the group chat and share your thoughts!
            </p>
          </div>
        </div>

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
                  onInfoClick={(m: any) => setSelectedMovie(m)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

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
