import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PlayIcon } from "@heroicons/react/24/solid";
import "./MovieGroupsDropdown.css"; // ✅ New CSS file
import CreateGroupModal from "./CreateGroupModal";

const MovieGroupsDropdown = ({ groups, refreshGroups }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleGroupClick = (groupId) => {
    navigate(`/group/${groupId}`);
    setIsOpen(false); // Close dropdown after clicking a group
  };

  return (
    <div className="dropdown-container">
      <a className="dropdown-button" onClick={() => setIsOpen(!isOpen)}>
        <PlayIcon className="button-icon" /> Movie Groups
      </a>

      {isOpen && (
        <motion.div
          className="dropdown-menu"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          <div className="groups-list">
            {groups.length > 0 ? (
              groups.map((group) => (
                <div
                  key={group._id}
                  className="group-item clickable"
                  onClick={() => handleGroupClick(group._id)}
                >
                  {group.name}
                </div>
              ))
            ) : (
              <div className="group-item">No Groups Found</div>
            )}
          </div>
          <button
            className="create-group-button"
            onClick={() => setIsModalOpen(true)}
          >
            + Create Group
          </button>
        </motion.div>
      )}

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onGroupCreated={refreshGroups}
      />
    </div>
  );
};

export default MovieGroupsDropdown;
