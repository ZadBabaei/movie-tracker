import React, { useEffect, useState } from "react";
import axios from "axios";
import { jwtDecode } from "jwt-decode";
import Navbar from "../component/Navbar";
import Hero from "../component/Hero";
import "./MyGroupsPage.css";

const MyGroupsPage = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <>
      <Navbar userName={userName} />
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
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group._id}>
                  <td>{group.name}</td>
                  <td>{new Date(group.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button onClick={() => handleLeaveGroup(group._id)}>
                      Leave
                    </button>
                    {/* We'll conditionally render Delete button here later */}
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
