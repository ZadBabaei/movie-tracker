import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaCamera, FaTrash, FaSignOutAlt, FaEdit, FaCheck, FaTimes } from "react-icons/fa";
import VerticalNavbar from "../component/VerticalNavbar";
import { useUserStore } from "../store/useUserStore";
import { useNavigate } from "react-router-dom";
import "./Profile.css";

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const {
    profile,
    stats,
    loading,
    fetchProfile,
    fetchStats,
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
    fetchProfile();
    fetchStats();
  }, [fetchProfile, fetchStats]);

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
      showToast("Avatar updated!");
    } catch (err: any) {
      showToast(err?.response?.data?.msg || "Failed to upload avatar", "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    setUploading(true);
    try {
      await removeAvatar();
      showToast("Avatar removed");
    } catch {
      showToast("Failed to remove avatar", "error");
    } finally {
      setUploading(false);
    }
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
      showToast("Profile updated!");
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

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading && !profile) {
    return (
      <div className="Profile-page">
        <VerticalNavbar />
        <div className="Profile-container">
          <div className="Profile-loading">
            <div className="Profile-spinner" />
            <span>Loading profile...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="Profile-page">
        <VerticalNavbar />
        <div className="Profile-container">
          <p style={{ color: "#aaa", textAlign: "center", marginTop: 80 }}>
            Unable to load profile. Please log in again.
          </p>
        </div>
      </div>
    );
  }

  const statItems = [
    { label: "Groups Joined", value: stats?.groupsJoined ?? 0, icon: "\uD83D\uDC65" },
    { label: "Movies in Watchlist", value: stats?.moviesWatched ?? 0, icon: "\uD83C\uDFAC" },
    { label: "Polls Voted In", value: stats?.pollsVoted ?? 0, icon: "\uD83D\uDDF3\uFE0F" },
    { label: "Polls Created", value: stats?.pollsCreated ?? 0, icon: "\uD83D\uDCCA" },
  ];

  return (
    <div className="Profile-page">
      <VerticalNavbar />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className={`Profile-toast Profile-toast--${toast.type}`}
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="Profile-container">
        <motion.div
          className="Profile-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Avatar Section */}
          <div className="Profile-avatar-section">
            <div className="Profile-avatar-wrapper" onClick={handleAvatarClick}>
              {profile.avatar ? (
                <img src={profile.avatar} alt="Avatar" className="Profile-avatar-img" />
              ) : (
                <div className="Profile-avatar-placeholder">
                  {getInitials(profile.name)}
                </div>
              )}
              <div className="Profile-avatar-overlay">
                {uploading ? (
                  <div className="Profile-avatar-spinner" />
                ) : (
                  <FaCamera size={20} />
                )}
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            {profile.avatar && (
              <button
                className="Profile-remove-avatar"
                onClick={handleRemoveAvatar}
                disabled={uploading}
              >
                <FaTrash size={12} />
                <span>Remove photo</span>
              </button>
            )}
          </div>

          {/* Info Section */}
          <div className="Profile-info-section">
            {editing ? (
              <div className="Profile-edit-form">
                <div className="Profile-field">
                  <label className="Profile-label">Name</label>
                  <input
                    className="Profile-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div className="Profile-field">
                  <label className="Profile-label">Email</label>
                  <input
                    className="Profile-input"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="Your email"
                    type="email"
                  />
                </div>
                <div className="Profile-edit-actions">
                  <button className="Profile-save-btn" onClick={handleSaveProfile} disabled={saving}>
                    <FaCheck size={14} />
                    <span>{saving ? "Saving..." : "Save"}</span>
                  </button>
                  <button className="Profile-cancel-btn" onClick={() => setEditing(false)}>
                    <FaTimes size={14} />
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="Profile-name">{profile.name}</h1>
                <p className="Profile-email">{profile.email}</p>
                <button className="Profile-edit-btn" onClick={() => setEditing(true)}>
                  <FaEdit size={14} />
                  <span>Edit Profile</span>
                </button>
              </>
            )}
          </div>
        </motion.div>

        {/* Stats Section */}
        <motion.div
          className="Profile-stats-grid"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          {statItems.map((stat, i) => (
            <motion.div
              key={stat.label}
              className="Profile-stat-card"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 + i * 0.08 }}
            >
              <span className="Profile-stat-icon">{stat.icon}</span>
              <span className="Profile-stat-value">{stat.value}</span>
              <span className="Profile-stat-label">{stat.label}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Logout */}
        <motion.div
          className="Profile-logout-section"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <button className="Profile-logout-btn" onClick={handleLogout}>
            <FaSignOutAlt size={16} />
            <span>Log Out</span>
          </button>
        </motion.div>
      </div>
    </div>
  );
};

export default Profile;
