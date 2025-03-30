// GroupsModal.js
import React from "react";
import { useNavigate } from "react-router-dom"; // Import useNavigate
import "./GroupsModal.css";

const GroupsModal = ({
  isOpen,
  onClose,
  groups = [],
  onCreateGroup,
  onShowAll,
}) => {
  const navigate = useNavigate(); // Use the hook here
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content groups-slide-in">
        <button className="modal-close-btn" onClick={onClose}>
          &times;
        </button>
        <h3>Select a Group</h3>
        <ul className="group-list">
          {groups.length > 0 ? (
            groups.map((group) => (
              <li
                key={group._id}
                className="group-item"
                onClick={() => navigate(`/group/${group._id}`)}
              >
                {group.name}
              </li>
            ))
          ) : (
            <li className="group-item">No groups found</li>
          )}
        </ul>

        <div className="modal-buttons">
          <button onClick={onCreateGroup}>Create Group</button>
          <button onClick={() => navigate("/my-groups")}>Show All</button>
        </div>
      </div>
    </div>
  );
};

export default GroupsModal;
