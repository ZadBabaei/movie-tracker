import React, { useEffect, useState } from "react";
import axios from "axios";
import { jwtDecode } from "jwt-decode";
import Navbar from "../component/Navbar";
import Hero from "../component/Hero";
import "./MyGroupsPage.css";
import { useNavigate } from "react-router-dom";

const MyGroupsPage = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const decoded = token ? jwtDecode(token) : null;
  const userName = decoded?.name || "Guest";
  const userId = decoded?.id;

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const res = await axios.get("http://localhost:5000/api/groups/mine", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setGroups(res.data);
      } catch (err) {
        setError("Failed to load your groups.");
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, [token]);

  const handleLeaveGroup = async (groupId) => {
    if (!window.confirm("Are you sure you want to leave this group?")) return;

    try {
      await axios.post(
        `http://localhost:5000/api/groups/${groupId}/leave`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setGroups((prev) => prev.filter((group) => group._id !== groupId));
    } catch (err) {
      alert("Failed to leave group.");
      console.error(err);
    }
  };
  const getColorClass = (name) => {
    if (!name) return "a";
    const char = name.trim().charAt(0).toLowerCase();
    const index = char.charCodeAt(0) % 10; // ensures a–j
    return String.fromCharCode(97 + index); // 'a' to 'j'
  };


  return (
    <>
      <Navbar userName={userName}
      />
      <Hero backgroundImage="https://image.tmdb.org/t/p/original/7ucaMpXAmlIM24qZZ8uI9hCY0hm.jpg"></Hero>

      <div className="my-groups-page">
        <h1>My Groups</h1>

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
                <th>Members</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group._id}>
                  <td id="GroupNameSize">
                    <span
                      className=" group-link"
                      onClick={() => navigate(`/group/${group._id}`)}
                    >
                      {group.name}
                    </span>
                  </td>
                  <td>
                    {" "}
                    <div className="member-avatars">
                      {group.members?.slice(0, 5).map((member) => (
                        <div
                          key={member._id}
                          className={`avatar-circle color-${getColorClass(
                            member.name
                          )}`}
                          data-tooltip={member.name}
                        >
                          {member.profilePic ? (
                            <img src={member.profilePic} alt={member.name} />
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
