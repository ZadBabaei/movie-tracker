import React, { useState } from "react";
import "./GroupNameModal.css";

const GroupNameModal = ({ isOpen, onClose, onInvite, onSkip }) => {
  const [groupName, setGroupName] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleInviteClick = () => {
    if (!groupName.trim()) {
      setError("Please enter a group name");
      return;
    }
    setError("");
    onInvite(groupName.trim());
    setGroupName("");
  };

  const handleSkipClick = () => {
    if (!groupName.trim()) {
      setError("Please enter a group name");
      return;
    }
    setError("");
    onSkip(groupName.trim());
    setGroupName("");
  };

  return (
    <div className="GroupName-modal-overlay">
      <div className="GroupName-modal">
        <button className="group-name-modal-close-btn" onClick={onClose}>
          &times;
        </button>
        <h2>Name Your Group</h2>
        <input
          className={`group-name-input ${error ? "group-name-input-error" : ""}`}
          type="text"
          placeholder="Enter group name..."
          value={groupName}
          onChange={(e) => {
            setGroupName(e.target.value);
            if (error) setError("");
          }}
        />
        {error && <p className="group-name-error">{error}</p>}
        <div className="GroupName-modal-buttons">
          <button className="group-name-invite-btn" onClick={handleInviteClick}>
            Invite Friends
          </button>
          <button className="group-name-cancel-btn" onClick={handleSkipClick}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupNameModal;
