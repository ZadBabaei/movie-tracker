import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import apiClient from "../api/apiClient";

import "./GroupPage.css";
import Hero from "../component/Hero";
import SearchBar from "../component/SearchBar";
import InviteModal from "../component/InviteFriendsModal";
import VerticalNavbar from "../component/VerticalNavbar";
import MovieDetailModal from "../component/MovieDetailModal";
import WatchTimeline from "../component/WatchTimeline";
import { useGroupStore } from "../store/useGroupStore";
import { jwtDecode } from "jwt-decode";
import { FaTimes } from "react-icons/fa";
import { toast } from "react-toastify";
import { getAvatarUrl } from "../utils/avatar";

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
  historyItemId?: string;
  imdbID?: string;
  tmdbId?: string;
  title: string;
  poster_path?: string;
  vote_average: number;
  watchedAt?: string;
  watchedDate?: string;
  watchedLocation?: string;
  watchedWhere?: string;
  watchedWith?: WatchedWithMember[];
  watchedNotes?: string;
  averageRating?: number | null;
  ratingCount?: number;
  currentUserRating?: number | null;
  ratings?: {
    userId: string;
    name: string;
    avatar?: string;
    rating: number;
  }[];
}

interface GroupData {
  _id: string;
  name: string;
  members: Member[];
  creator: { _id: string; name: string };
}

interface WatchDetailsForm {
  watchedAt: string;
  watchedLocation: string;
  watchedWith: string[];
  watchedNotes: string;
}

const getTodayInputValue = () => new Date().toISOString().split("T")[0];

const dedupeMembers = <T extends { _id: string }>(members: T[] = []) => {
  const seen = new Set<string>();
  return members.filter((member) => {
    if (!member?._id || seen.has(member._id)) return false;
    seen.add(member._id);
    return true;
  });
};

const getTmdbIdFromImdbID = (imdbID?: string) =>
  typeof imdbID === "string" && imdbID.startsWith("tmdb-")
    ? imdbID.replace("tmdb-", "")
    : undefined;

const buildTimelineMovie = (entry: any): Movie | null => {
  const movie = entry.movieId || entry;
  if (!movie) return null;

  const imdbID = movie.imdbID;
  const tmdbId = getTmdbIdFromImdbID(imdbID);
  const watchedAt = entry.watchedAt || entry.watchedDate || entry.createdAt || movie.createdAt;
  const watchedLocation = entry.watchedLocation || entry.watchedWhere || "";

  return {
    id: tmdbId || imdbID || movie._id,
    _id: movie._id,
    historyItemId: entry._id,
    imdbID,
    tmdbId,
    title: movie.title,
    poster_path: movie.poster || movie.poster_path,
    vote_average: movie.vote_average || 0,
    watchedAt,
    watchedDate: entry.watchedDate || watchedAt,
    watchedLocation,
    watchedWhere: entry.watchedWhere || watchedLocation,
    watchedWith: entry.watchedWith || [],
    watchedNotes: entry.watchedNotes || "",
    averageRating: entry.averageRating ?? null,
    ratingCount: entry.ratingCount || 0,
    currentUserRating: entry.currentUserRating ?? null,
    ratings: entry.ratings || [],
  };
};

const GroupPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [group, setGroup] = useState<GroupData | null>(null);
  const [timelineMovies, setTimelineMovies] = useState<Movie[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [pendingMovie, setPendingMovie] = useState<any | null>(null);
  const [watchDetails, setWatchDetails] = useState<WatchDetailsForm>({
    watchedAt: getTodayInputValue(),
    watchedLocation: "",
    watchedWith: [],
    watchedNotes: "",
  });
  const [watchDetailsError, setWatchDetailsError] = useState("");
  const [savingWatchedMovie, setSavingWatchedMovie] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Movie | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingHistoryItem, setDeletingHistoryItem] = useState(false);

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
    setGroup({ ...res.data, members: dedupeMembers(res.data.members || []) });

    const rawMovies = res.data.movies || [];
    const timeline = rawMovies
      .map(buildTimelineMovie)
      .filter((movie: Movie | null): movie is Movie => Boolean(movie));
    setTimelineMovies(timeline);
  };

  const handleMovieAdd = (movie: any) => {
    setPendingMovie(movie);
    setWatchDetails({
      watchedAt: getTodayInputValue(),
      watchedLocation: "",
      watchedWith: currentUserId ? [currentUserId] : [],
      watchedNotes: "",
    });
    setWatchDetailsError("");
  };

  const handleWatchDetailsChange = (
    field: keyof WatchDetailsForm,
    value: string | string[]
  ) => {
    setWatchDetails((prev) => ({ ...prev, [field]: value }));
    setWatchDetailsError("");
  };

  const toggleWatchedWith = (memberId: string) => {
    setWatchDetails((prev) => ({
      ...prev,
      watchedWith: prev.watchedWith.includes(memberId)
        ? prev.watchedWith.filter((id) => id !== memberId)
        : [...prev.watchedWith, memberId],
    }));
  };

  const closeWatchDetailsModal = () => {
    if (savingWatchedMovie) return;
    setPendingMovie(null);
    setWatchDetailsError("");
  };

  const handleSaveWatchedMovie = async () => {
    if (!pendingMovie) return;
    if (!watchDetails.watchedAt) {
      setWatchDetailsError("Watched date is required.");
      return;
    }

    setSavingWatchedMovie(true);
    const token = localStorage.getItem("token");
    try {
      await apiClient.post(
        `/api/groups/${id}/add-movie`,
        {
          movie: pendingMovie,
          watchedAt: watchDetails.watchedAt,
          watchedLocation: watchDetails.watchedLocation.trim(),
          watchedWith: watchDetails.watchedWith,
          watchedNotes: watchDetails.watchedNotes.trim(),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPendingMovie(null);
      await fetchGroupDetails();
    } catch (err: any) {
      setWatchDetailsError(err.response?.data?.msg || "Failed to save watched movie.");
    } finally {
      setSavingWatchedMovie(false);
    }
  };

  const closeDeleteModal = () => {
    if (deletingHistoryItem) return;
    setDeleteTarget(null);
    setDeleteConfirmText("");
    setDeleteError("");
  };

  const getDeleteConfirmationPhrase = (movie: Movie | null) =>
    movie?.title?.trim() || "DELETE";

  const isDeleteConfirmed =
    deleteConfirmText.trim() === getDeleteConfirmationPhrase(deleteTarget);

  const handleDeleteHistoryItem = async () => {
    if (!deleteTarget) return;
    if (!isDeleteConfirmed) {
      setDeleteError("Type the required text exactly to confirm deletion.");
      return;
    }
    if (!deleteTarget.historyItemId) {
      setDeleteError("This history item cannot be deleted because it has no history id.");
      return;
    }

    setDeletingHistoryItem(true);
    const token = localStorage.getItem("token");
    try {
      await apiClient.delete(
        `/api/groups/${id}/history/${deleteTarget.historyItemId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTimelineMovies((prev) =>
        prev.filter((movie) => movie.historyItemId !== deleteTarget.historyItemId)
      );
      setSelectedMovie((prev) =>
        prev?.historyItemId === deleteTarget.historyItemId ? null : prev
      );
      setDeleteTarget(null);
      setDeleteConfirmText("");
      setDeleteError("");
      toast.success("History item deleted.");
    } catch (err: any) {
      setDeleteError(err.response?.data?.msg || "Failed to delete history item.");
    } finally {
      setDeletingHistoryItem(false);
    }
  };

  const handleHistoryRatingSaved = (
    historyItemId: string,
    ratingData: {
      averageRating: number | null;
      ratingCount: number;
      currentUserRating: number | null;
      ratings?: Movie["ratings"];
    }
  ) => {
    const updateMovie = (movie: Movie) =>
      movie.historyItemId === historyItemId
        ? {
            ...movie,
            averageRating: ratingData.averageRating,
            ratingCount: ratingData.ratingCount,
            currentUserRating: ratingData.currentUserRating,
            ratings: ratingData.ratings || movie.ratings || [],
          }
        : movie;

    setTimelineMovies((prev) => prev.map(updateMovie));
    setSelectedMovie((prev) => (prev ? updateMovie(prev) : prev));
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
          <strong>{timelineMovies.length}</strong> Movies Watched
        </p>
      </div>

      <div className="group-content">
        <h1 className="group-members-title">Group Members</h1>
        <div className="group-members">
          <div className="group-member-card-container">
            <div className="group-member-cards-wrapper">
              {group.members.map((member) => (
                <div key={member._id} className="member-card-glow" data-testid="group-member-card">
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
                      src={getAvatarUrl(member)}
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
        <div className="group-page-empty-message">
          <div className="movie-callout">
            <h2>🎬 Add a new movie or scroll down to relive the magic!</h2>
            <p>
              Want to talk about the latest movie? Head to the group chat and share your thoughts!
            </p>
          </div>
        </div>

      </div>

      <div className="group-timeline-section">
        {timelineMovies.length > 0 ? (
          <WatchTimeline
            movies={timelineMovies}
            onMovieClick={(movie) => setSelectedMovie(movie as Movie)}
            onDeleteClick={(movie) => {
              setDeleteTarget(movie as Movie);
              setDeleteConfirmText("");
              setDeleteError("");
            }}
          />
        ) : (
          <div className="empty-state">
            <h2>🎬 No movies yet!</h2>
            <p>Start adding your favorites using the search bar above.</p>
          </div>
        )}
      </div>

      {pendingMovie && (
        <div className="watched-details-overlay" onClick={closeWatchDetailsModal}>
          <div className="watched-details-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="watched-details-close"
              onClick={closeWatchDetailsModal}
              aria-label="Close watched details"
            >
              <FaTimes />
            </button>

            <h2>Add to Watch History</h2>
            <p className="watched-details-subtitle">
              Add details for <strong>{pendingMovie.title}</strong>.
            </p>

            <label className="watched-details-field">
              <span>Watched date</span>
              <input
                type="date"
                value={watchDetails.watchedAt}
                onChange={(e) => handleWatchDetailsChange("watchedAt", e.target.value)}
                required
              />
            </label>

            <label className="watched-details-field">
              <span>Watched location</span>
              <input
                type="text"
                value={watchDetails.watchedLocation}
                onChange={(e) => handleWatchDetailsChange("watchedLocation", e.target.value)}
                placeholder="Ahoora's place"
              />
            </label>

            <div className="watched-details-field">
              <span>Who watched it</span>
              {group.members.length > 0 ? (
                <div className="watched-details-members">
                  {group.members.map((member) => (
                    <button
                      key={member._id}
                      type="button"
                      className={`watched-details-member ${
                        watchDetails.watchedWith.includes(member._id)
                          ? "watched-details-member--selected"
                          : ""
                      }`}
                      onClick={() => toggleWatchedWith(member._id)}
                    >
                      <span className="watched-details-member-avatar">
                        <img src={getAvatarUrl(member)} alt={member.name} />
                      </span>
                      {member.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="watched-details-empty">No members available.</p>
              )}
            </div>

            <label className="watched-details-field">
              <span>Notes</span>
              <textarea
                value={watchDetails.watchedNotes}
                onChange={(e) => handleWatchDetailsChange("watchedNotes", e.target.value)}
                placeholder="Watched together after dinner."
                rows={3}
              />
            </label>

            {watchDetailsError && (
              <p className="watched-details-error">{watchDetailsError}</p>
            )}

            <div className="watched-details-actions">
              <button
                type="button"
                className="watched-details-btn watched-details-btn--secondary"
                onClick={closeWatchDetailsModal}
                disabled={savingWatchedMovie}
              >
                Cancel
              </button>
              <button
                type="button"
                className="watched-details-btn watched-details-btn--primary"
                onClick={handleSaveWatchedMovie}
                disabled={savingWatchedMovie}
              >
                {savingWatchedMovie ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="history-delete-overlay" onClick={closeDeleteModal}>
          <div className="history-delete-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="history-delete-close"
              onClick={closeDeleteModal}
              aria-label="Close delete confirmation"
            >
              <FaTimes />
            </button>

            <div className="history-delete-kicker">Destructive action</div>
            <h2>Delete watch history item?</h2>
            <p>
              You are about to delete this movie from the group watch history. This will
              remove the watched date, location, watched-with info, and notes for this
              history entry.
            </p>
            <p className="history-delete-warning">This action cannot be undone.</p>

            <label className="history-delete-field">
              <span>
                To confirm, type{" "}
                <strong>{getDeleteConfirmationPhrase(deleteTarget)}</strong>
              </span>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => {
                  setDeleteConfirmText(e.target.value);
                  setDeleteError("");
                }}
                autoFocus
              />
            </label>

            {deleteError && <p className="history-delete-error">{deleteError}</p>}

            <div className="history-delete-actions">
              <button
                type="button"
                className="history-delete-btn history-delete-btn--secondary"
                onClick={closeDeleteModal}
                disabled={deletingHistoryItem}
              >
                Cancel
              </button>
              <button
                type="button"
                className="history-delete-btn history-delete-btn--danger"
                onClick={handleDeleteHistoryItem}
                disabled={!isDeleteConfirmed || deletingHistoryItem}
              >
                {deletingHistoryItem ? "Deleting..." : "Delete history item"}
              </button>
            </div>
          </div>
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
          groupId={id}
          onRatingSaved={handleHistoryRatingSaved}
          onClose={() => setSelectedMovie(null)}
        />
      )}
    </div>
  );
};

export default GroupPage;
