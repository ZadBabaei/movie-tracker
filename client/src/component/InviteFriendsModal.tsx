import React, { useEffect, useState } from "react";
import "./InviteFriendsModal.css";
import axios from "axios";
import { useGroupStore } from "../store/useGroupStore";
import { toast } from "react-toastify";
import { jwtDecode } from "jwt-decode";

interface User {
  _id: string;
  name: string;
  email: string;
}

interface InviteFriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId?: string;
}

const InviteFriendsModal: React.FC<InviteFriendsModalProps> = ({ isOpen, onClose, groupId }) => {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [invitedUserIds, setInvitedUserIds] = useState<string[]>([]);

  const { createdGroupId } = useGroupStore();

  useEffect(() => {
    const fetchUsers = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;

      try {
        const response = await axios.get("http://localhost:5000/api/user/all", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const users = response.data;
        setAllUsers(users);
        setFilteredUsers(users);
      } catch (error) {
        console.error("Error fetching users:", error);
        toast.error("Failed to load users.");
      }
    };

    if (isOpen) {
      fetchUsers();
      setInvitedUserIds([]);
    }
  }, [isOpen]);

  const handleInvite = async (userId: string) => {
    const token = localStorage.getItem("token");
    if (!token) { toast.error("No token found."); return; }
    const targetGroupId = groupId || createdGroupId;
    if (!targetGroupId) { toast.error("Group was not created properly."); return; }
    if (invitedUserIds.includes(userId)) { toast.warning("User already invited."); return; }

    try {
      const decoded = jwtDecode<{ name: string }>(token);
      const inviterName = decoded.name;

      await axios.post(
        "http://localhost:5000/api/groups/invite",
        { groupId: targetGroupId, members: [userId], inviterName },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setInvitedUserIds((prev) => [...prev, userId]);
      toast.success("User invited!");
    } catch (error) {
      console.error("Error inviting user:", error);
      toast.error("Failed to send invitation.");
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase();
    setSearchTerm(value);
    setFilteredUsers(allUsers.filter((user) => user.name.toLowerCase().includes(value)));
  };

  if (!isOpen) return null;

  return (
    <div className="InviteFriendsModal-overlay">
      <div className="InviteFriendsModal-container">
        <button className="InviteFriendsModal-close-btn" onClick={onClose}>
          &times;
        </button>
        <h2 className="InviteFriendsModal-title">Invite Friends to Group</h2>

        <input
          type="text"
          placeholder="Search users..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="InviteFriendsModal-search-input"
        />

        <ul className="InviteFriendsModal-user-list">
          {filteredUsers.length === 0 ? (
            <li key="no-users">No users found</li>
          ) : (
            filteredUsers.map((user) => (
              <li key={user._id} className="InviteFriendsModal-user-item">
                <span>{user.name}</span>
                <button
                  onClick={() => handleInvite(user._id)}
                  disabled={invitedUserIds.includes(user._id)}
                  style={{
                    backgroundColor: invitedUserIds.includes(user._id) ? "#e74c3c" : "#eab114",
                    cursor: invitedUserIds.includes(user._id) ? "not-allowed" : "pointer",
                  }}
                >
                  {invitedUserIds.includes(user._id) ? "Invited" : "Invite"}
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="InviteFriendsModal-btns-container">
          <button className="InviteFriendsModal-btn-submit" onClick={onClose}>Submit</button>
          <button className="InviteFriendsModal-btn-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default InviteFriendsModal;
