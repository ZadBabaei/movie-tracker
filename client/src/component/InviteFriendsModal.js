import React, { useState, useEffect } from "react";
import axios from "axios";
import "./InviteFriendsModal.css";

const InviteFriendsModal = ({ groupId, onClose }) => {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [typingTimeout, setTypingTimeout] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:5000/api/user/all", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(res.data);
      setFilteredUsers(res.data);
    };
    fetchUsers();
  }, []);

  const handleSearch = (e) => {
    const query = e.target.value.toLowerCase();
    setSearch(query);

    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }

    setTypingTimeout(
      setTimeout(() => {
        const filtered = users.filter(
          (user) =>
            user.name.toLowerCase().includes(query) ||
            user.email.toLowerCase().includes(query)
        );
        setFilteredUsers(filtered);
      }, 300)
    );
  };

  const handleUserSelect = (userId) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

const handleSendInvites = async () => {
  try {
    const token = localStorage.getItem("token");
    await axios.post(
      "http://localhost:5000/api/groups/invite",
      {
        groupId,
        members: selectedUsers,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    setSuccess(true);
    setTimeout(onClose, 1200); // success message delay
  } catch (err) {
    setError(err.response?.data?.msg || "Failed to send invitations.");
  }
};


  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Invite Friends</h2>

        <input
          type="text"
          placeholder="Search friends by name or email"
          value={search}
          onChange={handleSearch}
          className="search-input"
        />

        {search.length > 0 && (
          <div className="autocomplete-dropdown">
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
                <div
                  key={user._id}
                  className={`autocomplete-item ${
                    selectedUsers.includes(user._id) ? "selected" : ""
                  }`}
                  onClick={() => handleUserSelect(user._id)}
                >
                  {user.name} ({user.email})
                </div>
              ))
            ) : (
              <div className="autocomplete-item">No users found</div>
            )}
          </div>
        )}

        {selectedUsers.length > 0 && (
          <div className="selected-users">
            <h4>Selected:</h4>
            {selectedUsers.map((id) => {
              const user = users.find((u) => u._id === id);
              return (
                <span key={id} className="selected-user-tag">
                  {user?.name} ({user?.email})
                </span>
              );
            })}
          </div>
        )}

        {error && <p style={{ color: "#f44336" }}>{error}</p>}
        {success && <p style={{ color: "#4caf50" }}>Invitations sent!</p>}

        <div className="modal-buttons">
          <button
            onClick={handleSendInvites}
            disabled={selectedUsers.length === 0}
          >
            Send Invites
          </button>
          <button onClick={onClose} className="cancel-button">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default InviteFriendsModal;
