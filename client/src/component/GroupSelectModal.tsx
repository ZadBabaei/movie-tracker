import React from "react";
import { FaTimes } from "react-icons/fa";
import "./GroupSelectModal.css";

interface GroupOption {
  _id: string;
  name: string;
}

interface GroupSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (groupId: string) => void;
  groups: GroupOption[];
  movieTitle: string;
}

const GroupSelectModal: React.FC<GroupSelectModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  groups,
  movieTitle,
}) => {
  if (!isOpen) return null;

  return (
    <div className="group-select-overlay" onClick={onClose}>
      <div className="group-select-content" onClick={(e) => e.stopPropagation()}>
        <button className="group-select-close" onClick={onClose}>
          <FaTimes />
        </button>
        <h2 className="group-select-heading">Mark as Watched</h2>
        <p className="group-select-sub">
          Which group watched <strong>{movieTitle}</strong>?
        </p>

        {groups.length === 0 ? (
          <div className="group-select-empty">
            <p>Create or join a group first</p>
          </div>
        ) : (
          <div className="group-select-list">
            {groups.map((group) => (
              <button
                key={group._id}
                className="group-select-item"
                onClick={() => onSelect(group._id)}
              >
                {group.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GroupSelectModal;
