import React from "react";
import "./GroupChatSidbar.css";
import { getAvatarUrl } from "../utils/avatar";

const GroupChatSidbar = ({ members, onSelectMember }) => {
  return (
    <div className="GroupSidebar-sidebar-container">
      <div className="GroupSidebar-header">
        <h2 className="GroupSidebar-header-title">Group Members</h2>
      </div>
      <ul className="GroupSidebar-member-list">
        {members.map((member) => (
          <li
            key={member.id}
            className="GroupSidebar-member-item"
            onClick={() => onSelectMember(member)}
          >
            <div className="GroupSidebar-member-info">
              <img
                src={getAvatarUrl(member)}
                alt={member.name || "User"}
                className="GroupSidebar-avatar"
              />
              <div className="GroupSidebar-name-status">
                <span className="GroupSidebar-name">
                  {member.name || member.email || "Unknown user"}
                  {member.isCurrentUser ? " (You)" : ""}
                </span>
                <span
                  className={`GroupSidebar-status ${
                    member.online ? "online" : "offline"
                  }`}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default GroupChatSidbar;
