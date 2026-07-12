import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import "./MovieGroupsDropdown.css"; 
import CreateGroupModal from "./GroupsModal";

const MovieGroupsDropdown = ({ groups, refreshGroups }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleGroupClick = (group) => {
    navigate(`/group/${group.slug || group._id}`);
    setIsOpen(false); 
  };

  return (
    <div className="dropdown-container">
      <li className="dropdown-button" onClick={() => setIsOpen(!isOpen)}>
         Movie Groups
      </li>

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
                  onClick={() => handleGroupClick(group)}
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


      <CreateGroupModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onGroupCreated={refreshGroups}
      />
    </div>
  );
};

export default MovieGroupsDropdown;
