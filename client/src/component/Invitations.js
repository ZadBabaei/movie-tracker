import React, { useState, useEffect } from "react";
import apiClient from "../api/apiClient";
import "./Invitations.css";

const Invitations = () => {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchInvitations = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await apiClient.get("/api/inbox", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setInvitations(res.data);
      } catch (error) {
        setError("Failed to load invitations.");
      } finally {
        setLoading(false);
      }
    };
    fetchInvitations();
  }, []);

  const handleResponse = async (groupId, response) => {
    try {
      const token = localStorage.getItem("token");
      await apiClient.post(
        "/api/groups/respond",
        { groupId, response },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setInvitations((prev) => prev.filter((inv) => inv._id !== groupId));
    } catch (error) {
      console.error("Error responding to invitation:", error);
    }
  };

  if (loading) return <p>Loading invitations...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className="invitations-container">
      <h2>Pending Invitations</h2>
      {invitations.length === 0 ? (
        <p>No pending invitations.</p>
      ) : (
        invitations.map((inv) => (
          <div key={inv._id} className="invitation-item">
            <p>
              <strong>{inv.inviterName}</strong> invited you to join{" "}
              <strong>{inv.name}</strong>
            </p>

            <button onClick={() => handleResponse(inv._id, "accept")}>
              Accept
            </button>
            <button onClick={() => handleResponse(inv._id, "decline")}>
              Decline
            </button>
          </div>
        ))
      )}
    </div>
  );
};

export default Invitations;
