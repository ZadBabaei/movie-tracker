import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FaBookmark,
  FaCamera,
  FaChartBar,
  FaCheck,
  FaEdit,
  FaEnvelope,
  FaFilm,
  FaMoon,
  FaPoll,
  FaSignOutAlt,
  FaStar,
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

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  if (loading && !profile) {
    return (
      <div className="Profile-page">
        <VerticalNavbar />
        <main className="Profile-container">
          <div className="Profile-loading">
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

  const initials = getInitials(profile.name);
  const profileAvatarUrl = getAvatarUrl(profile);
  const statItems = [
    {
      label: "Groups Joined",
      value: stats?.groupsJoined ?? 0,
      icon: <FaUsers />,
      accent: "#2ecc71",
      bg: "rgba(46,204,113,0.12)",
      border: "rgba(46,204,113,0.28)",
    },
    {
      label: "Movies in Watchlist",
      value: stats?.moviesWatched ?? 0,
      icon: <FaBookmark />,
      accent: "#f5c518",
      bg: "rgba(245,197,24,0.12)",
      border: "rgba(245,197,24,0.28)",
    },
    {
      label: "Polls Voted In",
      value: stats?.pollsVoted ?? 0,
      icon: <FaPoll />,
      accent: "#60a5fa",
      bg: "rgba(96,165,250,0.12)",
      border: "rgba(96,165,250,0.28)",
    },
    {
      label: "Polls Created",
      value: stats?.pollsCreated ?? 0,
      icon: <FaChartBar />,
      accent: "#c084fc",
      bg: "rgba(192,132,252,0.12)",
      border: "rgba(192,132,252,0.28)",
    },
  ];

  const fallbackActivityItems = [
    {
      title: "Built your movie watchlist",
      desc: "Movies queued up and ready to roll",
      icon: <FaFilm />,
      accent: "#f5c518",
    },
    {
      title: "Joined movie groups",
      desc: "Connected with fellow film lovers",
      icon: <FaUsers />,
      accent: "#2ecc71",
    },
    {
      title: "Voted in group polls",
      desc: "Had your say on what to watch next",
      icon: <FaPoll />,
      accent: "#60a5fa",
    },
    {
      title: "Planned movie nights with friends",
      desc: "Organized unforgettable cinema evenings",
      icon: <FaMoon />,
      accent: "#c084fc",
    },
  ];
  const activityIconMap = {
    watchlist: { icon: <FaFilm />, accent: "#f5c518" },
    group: { icon: <FaUsers />, accent: "#2ecc71" },
    "poll-vote": { icon: <FaPoll />, accent: "#60a5fa" },
    "poll-created": { icon: <FaChartBar />, accent: "#c084fc" },
    profile: { icon: <FaStar />, accent: "#2ecc71" },
  };
  const activityItems = recentActivity.length > 0
    ? recentActivity.map((activity) => {
        const meta = activityIconMap[activity.type] || activityIconMap.profile;
        return {
          title: activity.title,
          desc: activity.description,
          icon: meta.icon,
          accent: meta.accent,
        };
      })
    : fallbackActivityItems;

  return (
    <div className="Profile-page">
      <VerticalNavbar />

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

      <main className="Profile-container">
        <motion.section
          className="Profile-hero-card"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="Profile-hero-cover" aria-hidden="true">
            <div className="Profile-hero-cover-base" />
            <div className="Profile-orb Profile-orb--1" />
            <div className="Profile-orb Profile-orb--2" />
            <div className="Profile-orb Profile-orb--3" />
            <div className="Profile-hero-cover-scanlines" />
            <FaFilm className="Profile-deco-icon Profile-deco-icon--1" />
            <FaFilm className="Profile-deco-icon Profile-deco-icon--2" />
            <FaStar className="Profile-deco-icon Profile-deco-icon--3" />
          </div>

          <div className="Profile-hero-content">
            <div className="Profile-avatar-ring">
              <div className="Profile-avatar" onClick={handleAvatarClick}>
                <img
                  src={profileAvatarUrl}
                  alt={profile.name}
                  className="Profile-avatar-img"
                  onError={(event) => handleAvatarError(event, profile)}
                />
                <div className="Profile-avatar-overlay">
                  {uploading ? <div className="Profile-avatar-spinner" /> : <FaCamera />}
                </div>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />

            <div className="Profile-profile-info">
              <span className="Profile-kicker">
                <FaStar />
                Member Profile
              </span>

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
                  <div className="Profile-profile-actions">
                    <button className="Profile-btn Profile-btn--primary" onClick={handleSaveProfile} disabled={saving}>
                      <FaCheck />
                      <span>{saving ? "Saving..." : "Save Changes"}</span>
                    </button>
                    <button className="Profile-btn Profile-btn--ghost" onClick={() => setEditing(false)}>
                      <FaTimes />
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="Profile-name">{profile.name}</h1>
                  <p className="Profile-email">
                    <FaEnvelope />
                    {profile.email}
                  </p>
                  <div className="Profile-profile-actions">
                    <button className="Profile-btn Profile-btn--primary" onClick={() => setEditing(true)}>
                      <FaEdit />
                      <span>Edit Profile</span>
                    </button>
                    <button className="Profile-btn Profile-btn--ghost" onClick={handleAvatarClick} disabled={uploading}>
                      <FaCamera />
                      <span>{uploading ? "Uploading..." : "Change Photo"}</span>
                    </button>
                    {profile.avatar && (
                      <button className="Profile-btn Profile-btn--danger" onClick={handleRemoveAvatar} disabled={uploading}>
                        <FaTrash />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="Profile-filmstrip" aria-hidden="true" />
        </motion.section>

        <motion.section
          className="Profile-stats-grid"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          {statItems.map((stat, index) => (
            <motion.article
              key={stat.label}
              className="Profile-stat-card"
              style={
                {
                  "--Profile-stat-accent": stat.accent,
                  "--Profile-stat-bg": stat.bg,
                  "--Profile-stat-border": stat.border,
                } as React.CSSProperties
              }
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.18 + index * 0.06 }}
            >
              <div className="Profile-stat-icon">{stat.icon}</div>
              <div className="Profile-stat-value">{stat.value}</div>
              <div className="Profile-stat-label">{stat.label}</div>
            </motion.article>
          ))}
        </motion.section>

        <motion.section
          className="Profile-lower-grid"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
        >
          <div className="Profile-glass-card">
            <span className="Profile-section-kicker">Recent Activity</span>
            <h2 className="Profile-section-title">Your movie night footprint</h2>

            <div className="Profile-timeline">
              {activityItems.map((item, index) => (
                <div className="Profile-timeline-item" key={item.title}>
                  <div className="Profile-timeline-track">
                    <div
                      className="Profile-timeline-node"
                      style={
                        {
                          color: item.accent,
                          background: `${item.accent}1f`,
                          borderColor: `${item.accent}52`,
                        } as React.CSSProperties
                      }
                    >
                      {item.icon}
                    </div>
                    {index < activityItems.length - 1 && <div className="Profile-timeline-line" />}
                  </div>
                  <div className="Profile-timeline-content">
                    <span className="Profile-timeline-title">{item.title}</span>
                    <span className="Profile-timeline-desc">{item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="Profile-glass-card">
            <span className="Profile-section-kicker">Account</span>
            <h2 className="Profile-section-title">Session controls</h2>

            <div className="Profile-account-user">
              <div className="Profile-account-avatar-sm">
                <img
                  src={profileAvatarUrl}
                  alt=""
                  onError={(event) => handleAvatarError(event, profile)}
                />
              </div>
              <div>
                <span className="Profile-account-user-name">{profile.name}</span>
                <span className="Profile-account-user-email">{profile.email}</span>
              </div>
            </div>

            <p className="Profile-account-copy">
              Sign out of this device when you are done managing your profile and settings.
            </p>

            <button className="Profile-logout-btn" onClick={handleLogout}>
              <FaSignOutAlt />
              <span>Log Out</span>
            </button>
          </div>
        </motion.section>
      </main>
    </div>
  );
};

export default Profile;
