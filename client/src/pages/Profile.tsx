import React, { useEffect, useRef, useState } from "react";
import {
  FaBookmark,
  FaCamera,
  FaChartBar,
  FaCheck,
  FaEdit,
  FaEnvelope,
  FaPoll,
  FaSignOutAlt,
  FaTimes,
  FaTrash,
  FaUsers,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import VerticalNavbar from "../component/VerticalNavbar";
import { useUserStore } from "../store/useUserStore";
import { getAvatarUrl, handleAvatarError } from "../utils/avatar";
import "./Profile.css";

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const {
    profile,
    stats,
    recentActivity,
    loading,
    fetchDashboard,
    updateProfile,
    uploadAvatar,
    removeAvatar,
  } = useUserStore();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (profile) {
      setEditName(profile.name);
      setEditEmail(profile.email);
    }
  }, [profile]);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleAvatarClick();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast("File must be under 5MB", "error");
      return;
    }

    setUploading(true);
    try {
      await uploadAvatar(file);
      showToast("Photo updated");
    } catch (err: any) {
      showToast(err?.response?.data?.msg || "Failed to upload photo", "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    setUploading(true);
    try {
      await removeAvatar();
      showToast("Photo removed");
    } catch {
      showToast("Failed to remove photo", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleStartEditing = () => {
    if (profile) {
      setEditName(profile.name);
      setEditEmail(profile.email);
    }
    setEditing(true);
  };

  const handleCancelEditing = () => {
    if (profile) {
      setEditName(profile.name);
      setEditEmail(profile.email);
    }
    setEditing(false);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      showToast("Name cannot be empty", "error");
      return;
    }

    setSaving(true);
    try {
      await updateProfile({ name: editName.trim(), email: editEmail.trim() });
      setEditing(false);
      showToast("Profile updated");
    } catch (err: any) {
      showToast(err?.response?.data?.msg || "Failed to update profile", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    useUserStore.getState().clear();
    navigate("/");
    window.location.reload();
  };

  if (loading && !profile) {
    return (
      <div className="Profile-page">
        <VerticalNavbar />
        <main className="Profile-container">
          <div className="Profile-loading" role="status">
            <div className="Profile-spinner" />
            <span>Loading profile...</span>
          </div>
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="Profile-page">
        <VerticalNavbar />
        <main className="Profile-container">
          <p className="Profile-error">Unable to load profile. Please log in again.</p>
        </main>
      </div>
    );
  }

  const profileAvatarUrl = getAvatarUrl(profile);
  const statItems = [
    {
      label: "Groups",
      value: stats?.groupsJoined ?? 0,
      icon: <FaUsers />,
    },
    {
      label: "Watchlist",
      value: stats?.moviesWatched ?? 0,
      icon: <FaBookmark />,
    },
    {
      label: "Poll votes",
      value: stats?.pollsVoted ?? 0,
      icon: <FaPoll />,
    },
    {
      label: "Polls created",
      value: stats?.pollsCreated ?? 0,
      icon: <FaChartBar />,
    },
  ];

  return (
    <div className="Profile-page">
      <VerticalNavbar />

      {toast && (
        <div className={`Profile-toast Profile-toast--${toast.type}`} role="status">
          {toast.msg}
        </div>
      )}

      <main className="Profile-container">
        <header className="Profile-page-header">
          <h1>Profile</h1>
          <p>Manage your account, photo, and movie-night settings.</p>
        </header>

        <section className="Profile-account-card" aria-labelledby="profile-account-title">
          <div className="Profile-account-main">
            <div
              className="Profile-avatar"
              role="button"
              tabIndex={0}
              aria-label="Change profile photo"
              onClick={handleAvatarClick}
              onKeyDown={handleAvatarKeyDown}
            >
              <img
                src={profileAvatarUrl}
                alt={profile.name}
                className="Profile-avatar-img"
                onError={(event) => handleAvatarError(event, profile)}
              />
              <span className="Profile-avatar-overlay">
                {uploading ? <span className="Profile-avatar-spinner" /> : <FaCamera />}
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="Profile-file-input"
            />

            <div className="Profile-account-info">
              <h2 id="profile-account-title">{profile.name}</h2>
              <p>
                <FaEnvelope aria-hidden="true" />
                <span>{profile.email}</span>
              </p>
            </div>
          </div>

          {editing ? (
            <div className="Profile-edit-form">
              <div className="Profile-field">
                <label htmlFor="profile-name">Name</label>
                <input
                  id="profile-name"
                  className="Profile-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="Profile-field">
                <label htmlFor="profile-email">Email</label>
                <input
                  id="profile-email"
                  className="Profile-input"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="Your email"
                  type="email"
                />
              </div>
              <div className="Profile-actions">
                <button className="Profile-btn Profile-btn--primary" onClick={handleSaveProfile} disabled={saving}>
                  <FaCheck aria-hidden="true" />
                  <span>{saving ? "Saving..." : "Save changes"}</span>
                </button>
                <button className="Profile-btn Profile-btn--secondary" onClick={handleCancelEditing} disabled={saving}>
                  <FaTimes aria-hidden="true" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="Profile-actions">
              <button className="Profile-btn Profile-btn--secondary" onClick={handleAvatarClick} disabled={uploading}>
                <FaCamera aria-hidden="true" />
                <span>{uploading ? "Uploading..." : "Change photo"}</span>
              </button>
              <button className="Profile-btn Profile-btn--primary" onClick={handleStartEditing}>
                <FaEdit aria-hidden="true" />
                <span>Edit profile</span>
              </button>
              {profile.avatar && (
                <button className="Profile-btn Profile-btn--danger" onClick={handleRemoveAvatar} disabled={uploading}>
                  <FaTrash aria-hidden="true" />
                  <span>Remove photo</span>
                </button>
              )}
            </div>
          )}
        </section>

        <section className="Profile-stats-card" aria-labelledby="profile-stats-title">
          <div className="Profile-section-header">
            <h2 id="profile-stats-title">Activity summary</h2>
          </div>
          <div className="Profile-stats-grid">
            {statItems.map((stat) => (
              <article key={stat.label} className="Profile-stat-item">
                <span className="Profile-stat-icon" aria-hidden="true">
                  {stat.icon}
                </span>
                <span className="Profile-stat-value">{stat.value}</span>
                <span className="Profile-stat-label">{stat.label}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="Profile-content-grid">
          <div className="Profile-panel">
            <div className="Profile-section-header">
              <h2>Recent activity</h2>
            </div>

            {recentActivity.length > 0 ? (
              <div className="Profile-activity-list">
                {recentActivity.map((activity, index) => (
                  <article className="Profile-activity-item" key={`${activity.type}-${activity.title}-${index}`}>
                    <div>
                      <h3>{activity.title}</h3>
                      <p>{activity.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="Profile-empty-state">
                No recent activity yet. Start by adding a movie or joining a group.
              </p>
            )}
          </div>

          <div className="Profile-panel">
            <div className="Profile-section-header">
              <h2>Account session</h2>
            </div>

            <div className="Profile-session-user">
              <img
                src={profileAvatarUrl}
                alt=""
                onError={(event) => handleAvatarError(event, profile)}
              />
              <div>
                <span>{profile.name}</span>
                <small>{profile.email}</small>
              </div>
            </div>

            <p className="Profile-session-copy">Sign out of this device when you’re finished.</p>

            <button className="Profile-logout-btn" onClick={handleLogout}>
              <FaSignOutAlt aria-hidden="true" />
              <span>Log out</span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Profile;
