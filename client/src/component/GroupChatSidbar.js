import React from "react";
import "./GroupChatSidbar.css";

const getInitials = (name) =>
  (name || "Unknown user")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

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
              {member.image ? (
                <img
                  src={member.image}
                  alt={member.name || "User"}
                  className="GroupSidebar-avatar"
                />
              ) : (
                <span className="GroupSidebar-avatar GroupSidebar-avatar-fallback">
                  {getInitials(member.name)}
                </span>
              )}
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
