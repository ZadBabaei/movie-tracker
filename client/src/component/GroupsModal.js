// GroupsModal.js
import React from "react";
import "./GroupsModal.css";
import { useModal } from "../context/ModalContext";
import { useNavigate } from "react-router-dom";

const GroupsModal = ({ isOpen, onClose, groups }) => {
  const navigate = useNavigate();
  const { openGroupNameModal } = useModal();

  if (!isOpen) return null;

  const handleCreateGroupClick = () => {
    onClose(); // Close GroupsModal
    openGroupNameModal(); // Open GroupNameModal
  };

  const handleShowAll = () => {
    onClose();
    navigate("/my-groups");
  };

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
                onClick={() => {
                  navigate(`/group/${group._id}`);
                  onClose();
                }}
              >
                {group.name}
              </li>
            ))
          ) : (
            <li key="no-groups" className="group-item">
              No groups found
            </li>
          )}
        </ul>

        <div className="modal-buttons">
          <button onClick={handleCreateGroupClick}>Create Group</button>
          <button onClick={handleShowAll}>Show All</button>
        </div>
      </div>
    </div>
  );
};

export default GroupsModal;
