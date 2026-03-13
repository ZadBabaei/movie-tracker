import React, { useEffect } from "react";
import "./GroupsModal.css";
import { useModalStore } from "../store/useModalStore";
import { useNavigate } from "react-router-dom";
import { Group, useGroupStore } from "../store/useGroupStore";

interface GroupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: Group[];
}

const GroupsModal: React.FC<GroupsModalProps> = ({ isOpen, onClose, groups }) => {
  const navigate = useNavigate();
  const { openGroupNameModal } = useModalStore();
  const { fetchGroups } = useGroupStore();

  useEffect(() => {
    if (isOpen) {
      fetchGroups();
    }
  }, [isOpen, fetchGroups]);

  if (!isOpen) return null;

  const handleCreateGroupClick = () => {
    onClose();
    openGroupNameModal();
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
