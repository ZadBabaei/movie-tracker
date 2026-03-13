import React, { useEffect, useState, useRef, useCallback } from "react";
import "./InviteFriendsModal.css";
import { useGroupStore } from "../store/useGroupStore";
import { toast } from "react-toastify";
import { jwtDecode } from "jwt-decode";
import { searchUsers, inviteByEmail, generateInviteLink } from "../api/groupApi";
import axios from "axios";

interface User {
  _id: string;
  name: string;
  email: string;
}

interface InviteLinkData {
  link: string;
  expiresAt: string;
}

interface InviteFriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId?: string;
}

type Tab = "email" | "link";

const InviteFriendsModal: React.FC<InviteFriendsModalProps> = ({ isOpen, onClose, groupId }) => {
  const [activeTab, setActiveTab] = useState<Tab>("email");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [invitedUserIds, setInvitedUserIds] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [inviteLink, setInviteLink] = useState<InviteLinkData | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { createdGroupId } = useGroupStore();
  const targetGroupId = groupId || createdGroupId;

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchTerm("");
      setSearchResults([]);
      setInvitedUserIds([]);
      setInviteLink(null);
      setCopied(false);
      setActiveTab("email");
    }
  }, [isOpen]);

  // Debounced search
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchTerm(value);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (value.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const results = await searchUsers(value.trim());
          setSearchResults(results);
        } catch (error) {
          console.error("Search error:", error);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    []
  );

  const handleInviteUser = async (userId: string) => {
    const token = localStorage.getItem("token");
    if (!token) { toast.error("No token found."); return; }
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

  const handleEmailInvite = async (email: string) => {
    const token = localStorage.getItem("token");
    if (!token) { toast.error("No token found."); return; }
    if (!targetGroupId) { toast.error("Group was not created properly."); return; }

    try {
      const decoded = jwtDecode<{ name: string }>(token);
      await inviteByEmail(targetGroupId, email, decoded.name);
      toast.success(`Invitation sent to ${email}!`);
    } catch (error) {
      console.error("Error sending email invitation:", error);
      toast.error("Failed to send email invitation.");
    }
  };

  const handleGenerateLink = async () => {
    if (!targetGroupId) { toast.error("Group was not created properly."); return; }
    setIsGeneratingLink(true);
    try {
      const data = await generateInviteLink(targetGroupId);
      setInviteLink({ link: data.url, expiresAt: data.expiresAt });
      setCopied(false);
    } catch (error) {
      console.error("Error generating invite link:", error);
      toast.error("Failed to generate invite link.");
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink.link);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("Failed to copy link.");
    }
  };

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!isOpen) return null;

  return (
    <div className="InviteFriendsModal-overlay">
      <div className="InviteFriendsModal-container">
        <button className="InviteFriendsModal-close-btn" onClick={onClose}>
          &times;
        </button>
        <h2 className="InviteFriendsModal-title">Invite Friends to Group</h2>

        {/* Tabs */}
        <div className="InviteFriendsModal-tabs">
          <button
            className={`InviteFriendsModal-tab ${activeTab === "email" ? "active" : ""}`}
            onClick={() => setActiveTab("email")}
          >
            Invite by Email
          </button>
          <button
            className={`InviteFriendsModal-tab ${activeTab === "link" ? "active" : ""}`}
            onClick={() => setActiveTab("link")}
          >
            Invite by Link
          </button>
        </div>

        {/* Email Tab */}
        {activeTab === "email" && (
          <div className="InviteFriendsModal-tab-content">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="InviteFriendsModal-search-input"
            />

            {isSearching && (
              <p className="InviteFriendsModal-searching">Searching...</p>
            )}

            <ul className="InviteFriendsModal-user-list">
              {searchResults.length > 0
                ? searchResults.map((user) => (
                    <li key={user._id} className="InviteFriendsModal-user-item">
                      <div className="InviteFriendsModal-user-info">
                        <span className="InviteFriendsModal-user-name">{user.name}</span>
                        <span className="InviteFriendsModal-user-email">{user.email}</span>
                      </div>
                      <button
                        onClick={() => handleInviteUser(user._id)}
                        disabled={invitedUserIds.includes(user._id)}
                        className={invitedUserIds.includes(user._id) ? "invited" : ""}
                      >
                        {invitedUserIds.includes(user._id) ? "Invited" : "Invite"}
                      </button>
                    </li>
                  ))
                : searchTerm.trim().length >= 2 &&
                  !isSearching && (
                    <>
                      <li key="no-users" className="InviteFriendsModal-no-results">
                        No users found
                      </li>
                      {isValidEmail(searchTerm.trim()) && (
                        <li key="email-invite" className="InviteFriendsModal-user-item">
                          <span>Send email to: {searchTerm.trim()}</span>
                          <button onClick={() => handleEmailInvite(searchTerm.trim())}>
                            Send Email Invitation
                          </button>
                        </li>
                      )}
                    </>
                  )}
            </ul>
          </div>
        )}

        {/* Link Tab */}
        {activeTab === "link" && (
          <div className="InviteFriendsModal-tab-content">
            {!inviteLink ? (
              <div className="InviteFriendsModal-link-section">
                <p className="InviteFriendsModal-link-desc">
                  Generate a shareable link that anyone can use to join this group.
                </p>
                <button
                  className="InviteFriendsModal-generate-btn"
                  onClick={handleGenerateLink}
                  disabled={isGeneratingLink}
                >
                  {isGeneratingLink ? "Generating..." : "Generate Invite Link"}
                </button>
              </div>
            ) : (
              <div className="InviteFriendsModal-link-section">
                <div className="InviteFriendsModal-link-display">
                  <input
                    type="text"
                    readOnly
                    value={inviteLink.link}
                    className="InviteFriendsModal-link-input"
                  />
                  <button
                    className="InviteFriendsModal-copy-btn"
                    onClick={handleCopyLink}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="InviteFriendsModal-link-expiry">
                  Expires: {new Date(inviteLink.expiresAt).toLocaleDateString()}
                </p>
                <button
                  className="InviteFriendsModal-generate-btn InviteFriendsModal-regenerate-btn"
                  onClick={handleGenerateLink}
                  disabled={isGeneratingLink}
                >
                  {isGeneratingLink ? "Generating..." : "Generate New Link"}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="InviteFriendsModal-btns-container">
          <button className="InviteFriendsModal-btn-submit" onClick={onClose}>Done</button>
          <button className="InviteFriendsModal-btn-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default InviteFriendsModal;
