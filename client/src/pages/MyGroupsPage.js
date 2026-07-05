import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMyGroups, leaveGroup } from "../api/groupApi";
import { toast } from "react-toastify";
import IconButton from "@mui/material/IconButton";
import Star from "@mui/icons-material/Star";
import StarBorder from "@mui/icons-material/StarBorder";
import { useGroupStore } from "../store/useGroupStore";
import VerticalNavbar from "../component/VerticalNavbar";
import Hero from "../component/Hero";
import { getAvatarUrl, handleAvatarError } from "../utils/avatar";
import "./MyGroupsPage.css";

const MAX_VISIBLE_MEMBERS = 5;

const MyGroupsPage = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { favoriteGroups, fetchFavoriteGroups, toggleFavoriteGroup } = useGroupStore();

  const dedupeMembers = (members = []) => {
    const seen = new Set();
    return members.filter((member) => {
      if (!member?._id || seen.has(member._id)) return false;
      seen.add(member._id);
      return true;
    });
  };

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await fetchMyGroups();
      setGroups(data.map((group) => ({ ...group, members: dedupeMembers(group.members) })));
    } catch (err) {
      setError("Failed to load your groups.");
      toast.error("Unable to load groups.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
    fetchFavoriteGroups();
  }, [fetchFavoriteGroups, loadGroups]);

  const handleLeaveGroup = async (groupId) => {
    if (!window.confirm("Are you sure you want to leave this group?")) return;

    try {
      await leaveGroup(groupId);
      setGroups((prev) => prev.filter((group) => group._id !== groupId));
      toast.success("You've left the group.");
    } catch (err) {
      toast.error("Failed to leave group.");
      console.error(err);
    }
  };

  const handleToggleFavorite = async (groupId) => {
    const result = await toggleFavoriteGroup(groupId);
    if (result === true) {
      toast.success("Added to favorites!");
    } else if (result === false) {
      toast.info("Removed from favorites.");
    } else {
      toast.warn("You can only have 2 favorite groups. Unfavorite one first.");
    }
  };

  const formatDate = (date) =>
    new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const favoriteGroupIds = useMemo(
    () => new Set(favoriteGroups.map((group) => group._id)),
    [favoriteGroups]
  );
  const favoriteCount = groups.filter((group) => favoriteGroupIds.has(group._id)).length;
  const visibleMemberCount = groups.reduce(
    (total, group) => total + Math.min(group.members?.length || 0, MAX_VISIBLE_MEMBERS),
    0
  );

  const renderMembers = (group) => {
    const members = group.members || [];
    const visibleMembers = members.slice(0, MAX_VISIBLE_MEMBERS);
    const hiddenCount = Math.max(members.length - MAX_VISIBLE_MEMBERS, 0);

    return (
      <div className="member-avatars" aria-label={`${members.length} members`}>
        {visibleMembers.map((member) => (
          <span
            key={member._id}
            className="avatar-circle"
            title={member.name || member.email || "Member"}
          >
            <img
              src={getAvatarUrl(member)}
              alt={member.name || member.email || "Group member"}
              onError={(event) => handleAvatarError(event, member)}
            />
          </span>
        ))}
        {hiddenCount > 0 && (
          <span className="member-count-bubble" aria-label={`${hiddenCount} more members`}>
            +{hiddenCount}
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      <VerticalNavbar />
      <Hero
        height="64vh"
        heroText="My Groups"
        heroTextSub="Manage your watch groups, open chats, and plan the next movie night."
        backgroundImage="https://image.tmdb.org/t/p/original/edKpE9B5qN3e559OuMCLZdW1iBZ.jpg"
      />

      <main className="my-groups-page">
        <section className="my-groups-header-card">
          <div>
            <span className="my-groups-eyebrow">Groups</span>
            <h1>Your groups</h1>
            <p>Open a group, jump into chat, or manage your favorites.</p>
          </div>
          <div className="my-groups-summary">
            <span className="group-count-badge">
              {groups.length} {groups.length === 1 ? "group" : "groups"}
            </span>
            <div className="group-summary-metrics" aria-label="Group summary">
              <span>
                <strong>{groups.length}</strong>
                Total groups
              </span>
              <span>
                <strong>{favoriteCount}</strong>
                Favorites
              </span>
              <span>
                <strong>{visibleMemberCount}</strong>
                Members shown
              </span>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="group-card-grid" aria-busy="true" aria-label="Loading groups">
            {Array.from({ length: 3 }).map((_, index) => (
              <article className="group-card group-card--skeleton" key={index}>
                <div className="skeleton-line skeleton-line--title" />
                <div className="skeleton-line" />
                <div className="skeleton-avatar-row">
                  {Array.from({ length: 5 }).map((__, avatarIndex) => (
                    <span key={avatarIndex} />
                  ))}
                </div>
                <div className="skeleton-actions" />
              </article>
            ))}
          </section>
        ) : error ? (
          <section className="my-groups-state-card my-groups-state-card--error">
            <h2>Unable to load groups</h2>
            <p>{error}</p>
            <button type="button" onClick={loadGroups}>
              Try again
            </button>
          </section>
        ) : groups.length === 0 ? (
          <section className="my-groups-state-card">
            <h2>No groups yet</h2>
            <p>Create or join a group to start planning movie nights with friends.</p>
          </section>
        ) : (
          <section className="group-card-grid" aria-label="Your groups">
            {groups.map((group) => {
              const isFavorite = favoriteGroupIds.has(group._id);
              const memberCount = group.members?.length || 0;

              return (
                <article className="group-card" key={group._id}>
                  <header className="group-card-header">
                    <div>
                      <h2>{group.name}</h2>
                      <p>
                        Admin: {group.creator?.name || "Unknown"} · Created {formatDate(group.createdAt)}
                      </p>
                    </div>
                    <IconButton
                      size="small"
                      onClick={() => handleToggleFavorite(group._id)}
                      aria-label={
                        isFavorite
                          ? `Remove ${group.name} from favorites`
                          : `Add ${group.name} to favorites`
                      }
                      className="group-favorite-button"
                      sx={{
                        color: isFavorite ? "#d3ac6c" : "rgba(255,255,255,0.72)",
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        "&:hover": {
                          background: "rgba(211,172,108,0.12)",
                          borderColor: "rgba(211,172,108,0.28)",
                        },
                        "&:focus-visible": {
                          outline: "3px solid rgba(211,172,108,0.45)",
                          outlineOffset: "3px",
                        },
                      }}
                    >
                      {isFavorite ? <Star /> : <StarBorder />}
                    </IconButton>
                  </header>

                  <div className="group-card-members">
                    <div>
                      <span className="group-card-label">Members</span>
                      <strong>
                        {memberCount} {memberCount === 1 ? "member" : "members"}
                      </strong>
                    </div>
                    {renderMembers(group)}
                  </div>

                  <div className="group-card-actions">
                    <button type="button" className="group-action-primary" onClick={() => navigate(`/group/${group._id}`)}>
                      Open group
                    </button>
                    <button type="button" className="group-action-secondary" onClick={() => navigate(`/group/${group._id}/chat`)}>
                      Chat
                    </button>
                    <button type="button" className="group-action-danger" onClick={() => handleLeaveGroup(group._id)}>
                      Leave
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </>
  );
};

export default MyGroupsPage;
