import React, { useEffect, useRef, useState } from "react";
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
        <div className="Profile-stars" aria-hidden="true" />
        <main className="Profile-stage">
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
        <div className="Profile-stars" aria-hidden="true" />
        <main className="Profile-stage">
          <p className="Profile-error">Unable to load profile. Please log in again.</p>
        </main>
      </div>
    );
  }

  const profileAvatarUrl = getAvatarUrl(profile);

  const orbitStats = [
    { key: "groups", label: "Groups", value: stats?.groupsJoined ?? 0, arm: "a" },
    { key: "watched", label: "Watched", value: stats?.moviesWatched ?? 0, arm: "b" },
    { key: "votes", label: "Votes", value: stats?.pollsVoted ?? 0, arm: "c" },
    { key: "polls", label: "Polls", value: stats?.pollsCreated ?? 0, arm: "d" },
  ];

  const srStats = [
    `Groups joined: ${stats?.groupsJoined ?? 0}`,
    `Films watched: ${stats?.moviesWatched ?? 0}`,
    `Poll votes cast: ${stats?.pollsVoted ?? 0}`,
    `Polls created: ${stats?.pollsCreated ?? 0}`,
  ];

  return (
    <div className="Profile-page">
      <VerticalNavbar />
      <div className="Profile-stars" aria-hidden="true" />

      {toast && (
        <div className={`Profile-toast Profile-toast--${toast.type}`} role="status">
          {toast.msg}
        </div>
      )}

      <main className="Profile-stage">
        <p className="Profile-kicker Profile-rise Profile-d1">Your Constellation</p>

        <section className="Profile-system" aria-label="Activity overview">
          <ul className="Profile-sr-only">
            {srStats.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          <div className="Profile-ring Profile-ring--1" aria-hidden="true" />
          <div className="Profile-ring Profile-ring--2" aria-hidden="true" />
          <div className="Profile-ring Profile-ring--3" aria-hidden="true" />

          <div className="Profile-orbit" aria-hidden="true">
            {orbitStats.map((stat) => (
              <div key={stat.key} className={`Profile-arm Profile-arm--${stat.arm}`}>
                <div className="Profile-node">
                  <span className="Profile-node-fig">{stat.value}</span>
                  <span className="Profile-node-lbl">{stat.label}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="Profile-core">
            <div className="Profile-glow" aria-hidden="true" />
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
              <span className="Profile-avatar-veil">
                {uploading ? <span className="Profile-avatar-spinner" /> : "Replace"}
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="Profile-file-input"
            />
          </div>
        </section>

        <div className="Profile-nameplate Profile-rise Profile-d2">
          <h1>{profile.name}</h1>
          <p className="Profile-addr">{profile.email}</p>
        </div>

        <section className="Profile-console">
          <div className="Profile-pane Profile-pane--wide Profile-rise Profile-d2">
            <div className="Profile-pane-head">Signals</div>

            {recentActivity.length > 0 ? (
              recentActivity.map((activity, index) => (
                <article className="Profile-beam" key={`${activity.type}-${activity.title}-${index}`}>
                  <span className="Profile-beam-star" aria-hidden="true" />
                  <div>
                    <h3>{activity.title}</h3>
                    <p>{activity.description}</p>
                  </div>
                </article>
              ))
            ) : (
              <p className="Profile-empty-state">
                No recent activity yet. Start by adding a movie or joining a group.
              </p>
            )}
          </div>

          <div className="Profile-pane Profile-rise Profile-d3">
            <div className="Profile-pane-head">Identity</div>

            {editing ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSaveProfile();
                }}
              >
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
                <div className="Profile-btnrow">
                  <button type="submit" className="Profile-btn Profile-btn--solid" disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    className="Profile-btn Profile-btn--quiet"
                    onClick={handleCancelEditing}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="Profile-idbox">
                  <img
                    src={profileAvatarUrl}
                    alt=""
                    onError={(event) => handleAvatarError(event, profile)}
                  />
                  <div>
                    <span className="Profile-idbox-name">{profile.name}</span>
                    <small className="Profile-idbox-mail">{profile.email}</small>
                  </div>
                </div>

                <div className="Profile-btnrow">
                  <button className="Profile-btn Profile-btn--solid" onClick={handleStartEditing}>
                    Edit
                  </button>
                  <button
                    className="Profile-btn Profile-btn--quiet"
                    onClick={handleAvatarClick}
                    disabled={uploading}
                  >
                    {uploading ? "Uploading..." : "New Photo"}
                  </button>
                  {profile.avatar && (
                    <button
                      className="Profile-btn Profile-btn--danger"
                      onClick={handleRemoveAvatar}
                      disabled={uploading}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="Profile-pane Profile-rise Profile-d4">
            <div className="Profile-pane-head">Session</div>
            <p className="Profile-note">
              This device is currently orbiting your account. Sign out when you drift away.
            </p>
            <button className="Profile-btn Profile-btn--signout" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Profile;
