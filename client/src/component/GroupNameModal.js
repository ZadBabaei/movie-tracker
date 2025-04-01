// GroupNameModal.js
import React, { useState } from "react";
import "./GroupNameModal.css";

const GroupNameModal = ({ isOpen, onClose, onInvite, onSkip }) => {
  const [groupName, setGroupName] = useState("");

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Name Your Group</h2>
        <input
          type="text"
          placeholder="Enter group name"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          className="group-name-input"
        />

        <div className="modal-buttons">
          <button disabled={!groupName} onClick={() => onInvite(groupName)}>
            Invite Friends
          </button>
          <button
            disabled={!groupName}
            onClick={() => onSkip(groupName)}
            className="cancel-button"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupNameModal;
