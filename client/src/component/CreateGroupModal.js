import React, { useState } from "react";
import axios from "axios";
import InviteFriendsModal from "./InviteFriendsModal";
import "./CreateGroupModal.css";

const CreateGroupModal = ({ isOpen, onClose, onGroupCreated }) => {
  const [step, setStep] = useState(1);
  const [groupName, setGroupName] = useState("");
  const [groupId, setGroupId] = useState(null);
  const [error, setError] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);

  const handleNextStep = async () => {
    if (!groupName.trim()) {
      setError("Group name is required.");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        "http://localhost:5000/api/groups/create",
        { groupName },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
setGroupId(res.data.group._id);
setTimeout(() => {
  setShowInviteModal(true);
}, 100);
      onGroupCreated && onGroupCreated();
    } catch (err) {
      setError(err.response?.data?.msg || "Failed to create group.");
    }
  };

  const handleCloseAll = () => {
    setShowInviteModal(false);
    onClose();
  };

  return isOpen ? (
    <>
      {!showInviteModal && (
        <div className="modal-overlay">
          <div className="modal-content">
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
          </div>
        </div>
      )}
      {showInviteModal && groupId && (
        <InviteFriendsModal groupId={groupId} onClose={handleCloseAll} />
      )}
    </>
  ) : null;
};

export default CreateGroupModal;
