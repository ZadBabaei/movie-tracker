import React, { useState, useEffect } from "react";
import axios from "axios";
import "./CreateGroupModal.css";

const CreateGroupModal = ({ isOpen, onClose, onGroupCreated }) => {
  const [step, setStep] = useState(1);
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
    const [invitationSent, setInvitationSent] = useState(false);

  useEffect(() => {
    if (searchQuery.trim()) {
      const fetchUsers = async () => {
        try {
          const token = localStorage.getItem("token");
          const res = await axios.get(
            `http://localhost:5000/api/user/search?query=${searchQuery}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          setSearchResults(res.data);
        } catch (error) {
          console.error("Error searching users:", error);
        }
      };
      fetchUsers();
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const handleNextStep = () => {
    if (!groupName.trim()) {
      setError("Group name is required.");
      return;
    }
    setStep(2);
  };

  const handleSendInvitations = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        "http://localhost:5000/api/groups/invite",
        { groupName, members },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setInvitationSent(true);
      onGroupCreated();
      onClose();
    } catch (error) {
      setError("Failed to send invitations.");
    } finally {
      setLoading(false);
    }
  };
    const navigateToHome = () => {
    window.location.href = "/home";
  };
  
  return isOpen ? (
    <div className="modal-overlay">
      <div className="modal-content">
        {step === 1 ? (
          <>
            <h2>Create a New Group</h2>
            <input
              type="text"
              placeholder="Enter Group Name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            {error && <p className="error-message">{error}</p>}
            <div className="modal-buttons">
              <button onClick={handleNextStep}>Next</button>
              <button onClick={onClose}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <h2>Invite Friends</h2>
            <input
              type="text"
              placeholder="Search by name or email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="user-list">
              {searchResults.map((user) => (
                <div
                  key={user._id}
                  className={`user-item ${members.includes(user._id) ? "selected" : ""}`}
                  onClick={() =>
                    setMembers((prev) =>
                      prev.includes(user._id)
                        ? prev.filter((id) => id !== user._id)
                        : [...prev, user._id]
                    )
                  }
                >
                  {user.name} ({user.email}) {members.includes(user._id) && "✅ Added"}
                </div>
              ))}
            </div>
            
            {/* Selected Friends List */}
            <h3>Selected Friends:</h3>
            <div className="selected-members">
              {members.map((memberId) => {
                const user = searchResults.find((u) => u._id === memberId);
                return user ? (
                  <div key={user._id} className="selected-member">
                    {user.name} ({user.email})
                    <button onClick={() => setMembers((prev) => prev.filter((id) => id !== user._id))}>
                      ❌ Remove
                    </button>
                  </div>
                ) : null;
              })}
            </div>

            <div className="modal-buttons">
              <button onClick={handleSendInvitations} disabled={loading}>
                {loading ? "Sending..." : "Send Invitations"}
              </button>
              <button onClick={invitationSent ? navigateToHome : onClose}>
                  {invitationSent ? "Done" : "Skip"}
                  </button>
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;
};

export default CreateGroupModal;
