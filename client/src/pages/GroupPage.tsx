import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import apiClient from "../api/apiClient";

import "./GroupPage.css";
import Hero from "../component/Hero";
import SearchBar from "../component/SearchBar";
import MovieCard from "../component/MovieCard";
import InviteModal from "../component/InviteFriendsModal";
import VerticalNavbar from "../component/VerticalNavbar";
import MovieDetailModal from "../component/MovieDetailModal";
import WatchTimeline from "../component/WatchTimeline";
import { useGroupStore } from "../store/useGroupStore";
import { jwtDecode } from "jwt-decode";
import { FaTimes } from "react-icons/fa";

interface Member {
  _id: string;
  name: string;
  avatar?: string;
}

interface WatchedWithMember {
  _id: string;
  name: string;
  avatar?: string;
}

interface Movie {
  id: string;
  _id: string;
  title: string;
  poster_path?: string;
  vote_average: number;
  watchedDate?: string;
  watchedWhere?: string;
  watchedWith?: WatchedWithMember[];
}

interface GroupData {
  _id: string;
  name: string;
  members: Member[];
  creator: { _id: string; name: string };
}

const GroupPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [group, setGroup] = useState<GroupData | null>(null);
  const [addedMovies, setAddedMovies] = useState<Movie[]>([]);
  const [timelineMovies, setTimelineMovies] = useState<any[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

  const { openInviteFriendsModal } = useGroupStore();

  const token = localStorage.getItem("token");
  const currentUserId = token ? jwtDecode<{ id: string }>(token).id : null;

  useEffect(() => {
    fetchGroupDetails();
  }, [id]);

  const fetchGroupDetails = async () => {
    const token = localStorage.getItem("token");
    const res = await apiClient.get(`/api/groups/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setGroup(res.data);

    const rawMovies = res.data.movies || [];
    const fetchedMovies: Movie[] = rawMovies.map((m: any) => {
      // Handle both subdocument (m.movieId) and legacy (direct) formats
      const movie = m.movieId || m;
      return {
        id: movie.imdbID,
        _id: movie._id,
        title: movie.title,
        poster_path: movie.poster,
        vote_average: movie.vote_average || 0,
        watchedDate: m.watchedDate || undefined,
        watchedWhere: m.watchedWhere || undefined,
        watchedWith: m.watchedWith || undefined,
      };
    });
    setAddedMovies(fetchedMovies);

    // Build timeline data with watch metadata
    const timeline = rawMovies
      .filter((m: any) => m.movieId)
      .map((m: any) => ({
        _id: m.movieId._id,
        title: m.movieId.title,
        poster: m.movieId.poster,
        vote_average: m.movieId.vote_average,
        createdAt: m.watchedDate,
        watchedWhere: m.watchedWhere,
        watchedWith: m.watchedWith,
      }));
    setTimelineMovies(timeline);
  };

  const handleMovieAdd = async (movie: any) => {
    const token = localStorage.getItem("token");
    const res = await apiClient.post(
      `/api/groups/${id}/add-movie`,
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
    await apiClient.delete(
      `/api/groups/${id}/remove-movie/${movieId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setAddedMovies((prev) => prev.filter((m) => m._id !== movieId));
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!window.confirm("Are you sure you want to remove this member?")) return;
    const tk = localStorage.getItem("token");
    try {
      await apiClient.delete(
        `/api/groups/${id}/remove-member/${memberId}`,
        { headers: { Authorization: `Bearer ${tk}` } }
      );
      setGroup((prev) =>
        prev ? { ...prev, members: prev.members.filter((m) => m._id !== memberId) } : prev
      );
    } catch (err: any) {
      alert(err.response?.data?.msg || "Failed to remove member.");
    }
  };

  const isAdmin = group?.creator?._id === currentUserId;

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
                  {isAdmin && member._id !== currentUserId && (
                    <button
                      className="member-remove-btn"
                      title="Remove member"
                      onClick={() => handleRemoveMember(member._id)}
                    >
                      <FaTimes />
                    </button>
                  )}
                  <div className="member-avatar-wrapper">
                    <img
                      src={member.avatar || "https://i.pravatar.cc/100?u=" + member._id}
                      alt={member.name}
                      className="member-avatar"
                    />
                    <span className="status-dot offline"></span>
                  </div>
                  <div className="member-name">{member.name}</div>
                  {member._id === group.creator._id && (
                    <span className="badge">Admin</span>
                  )}
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

      {timelineMovies.length > 0 && (
        <div className="group-timeline-section">
          <WatchTimeline movies={timelineMovies} />
        </div>
      )}

      {showInviteModal && (
        <InviteModal
          isOpen={showInviteModal}
          groupId={group._id}
          onClose={() => setShowInviteModal(false)}
        />
      )}
      {selectedMovie && (
        <MovieDetailModal
          movie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
        />
      )}
    </div>
  );
};

export default GroupPage;
