import React, { useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { useNavigate } from "react-router-dom";
import { fetchMyGroups, leaveGroup } from "../api/groupApi";
import { toast } from "react-toastify";
import IconButton from "@mui/material/IconButton";
import Star from "@mui/icons-material/Star";
import StarBorder from "@mui/icons-material/StarBorder";
import { useGroupStore } from "../store/useGroupStore";
import VerticalNavbar from "../component/VerticalNavbar";
import Hero from "../component/Hero";
import "./MyGroupsPage.css";

const MyGroupsPage = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const decoded = token ? jwtDecode(token) : null;
  const { favoriteGroups, fetchFavoriteGroups, toggleFavoriteGroup } = useGroupStore();

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const data = await fetchMyGroups();
        setGroups(data);
      } catch (err) {
        setError("Failed to load your groups.");
        toast.error("Unable to load groups.");
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
    fetchFavoriteGroups();
  }, [fetchFavoriteGroups]);

  const handleLeaveGroup = async (groupId) => {
    if (!window.confirm("Are you sure you want to leave this group?")) return;

    try {
      await leaveGroup(groupId);
      setGroups((prev) => prev.filter((group) => group._id !== groupId));
      toast.success("You’ve left the group.");
    } catch (err) {
      toast.error("Failed to leave group.");
      console.error(err);
    }
  };

  const getColorClass = (name) => {
    if (!name) return "a";
    const char = name.trim().charAt(0).toLowerCase();
    const index = char.charCodeAt(0) % 10;
    return String.fromCharCode(97 + index);
  };

  return (
    <>
      <VerticalNavbar />
      <Hero
        height="80vh"
        heroText={"Your Movie Groups at a Glance 🎬"}
        heroTextSub={
          "“Manage every group you’re part of — friends, films, fun.”"
        }
        backgroundImage="https://image.tmdb.org/t/p/original/edKpE9B5qN3e559OuMCLZdW1iBZ.jpg"
      />
      <div className="my-groups-page">
        <h1 className="my-Group-page-title">My Groups</h1>

        {loading ? (
          <p>Loading...</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : groups.length === 0 ? (
          <p>You are not a member of any groups.</p>
        ) : (
          <table className="group-table">
            <thead>
              <tr>
                <th>Group Name</th>
                <th>Group Members</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group._id}>
                  <td id="GroupNameSize">
                    <span
                      className="group-link"
                      onClick={() => navigate(`/group/${group._id}`)}
                    >
                      {group.name}
                    </span>
                  </td>
                  <td>
                    <div className="member-avatars">
                      {group.members?.slice(0, 5).map((member) => (
                        <div
                          key={member._id}
                          className={`avatar-circle color-${getColorClass(
                            member.name
                          )}`}
                          data-tooltip={member.name}
                        >
                          {member.avatar ? (
                            <img src={member.avatar} alt={member.name} />
                          ) : (
                            <>
                              <span className="initial">
                                {member.name
                                  ? member.name.charAt(0).toUpperCase()
                                  : "?"}
                              </span>
                              <span className="full-name">{member.name}</span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td>
                    {new Date(group.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td>
                    <IconButton
                      size="small"
                      onClick={async () => {
                        const result = await toggleFavoriteGroup(group._id);
                        if (result === true) {
                          toast.success("Added to favorites!");
                        } else if (result === false) {
                          toast.info("Removed from favorites.");
                        } else {
                          toast.warn("You can only have 2 favorite groups. Unfavorite one first.");
                        }
                      }}
                      sx={{ color: "#ffc107", mr: 1 }}
                    >
                      {favoriteGroups.some((fg) => fg._id === group._id) ? (
                        <Star />
                      ) : (
                        <StarBorder />
                      )}
                    </IconButton>
                    <button
                      className="group-table-chat-btn"
                      onClick={() => navigate(`/group/${group._id}/chat`)}
                    >
                      Group Chat
                    </button>
                    <button onClick={() => handleLeaveGroup(group._id)}>
                      Leave
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
};

export default MyGroupsPage;
