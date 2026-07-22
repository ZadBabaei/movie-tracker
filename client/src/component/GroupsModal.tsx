import React, { useEffect } from "react";
import Modal from "./Modal/Modal";
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

  const handleCreateGroupClick = () => {
    onClose();
    openGroupNameModal();
  };

  const handleShowAll = () => {
    onClose();
    navigate("/my-groups");
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" title="Select a Group">
      <ul className="group-list">
        {groups.length > 0 ? (
          groups.map((group) => (
            <li
              key={group._id}
              className="group-item"
              onClick={() => {
                navigate(`/group/${group.slug || group._id}`);
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
    </Modal>
  );
};

export default GroupsModal;
