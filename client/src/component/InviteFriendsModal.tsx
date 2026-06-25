import React, { useEffect, useState } from "react";
import "./InviteFriendsModal.css";
import { useGroupStore } from "../store/useGroupStore";
import { toast } from "react-toastify";
import { generateInviteLink } from "../api/groupApi";

interface InviteLinkData {
  link: string;
  expiresAt: string;
}

interface InviteFriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId?: string;
}

const getInviteErrorMessage = (error: unknown, fallback: string) => {
  const responseMessage = (error as any)?.response?.data?.msg;
  return typeof responseMessage === "string" && responseMessage.trim()
    ? responseMessage
    : fallback;
};

const InviteFriendsModal: React.FC<InviteFriendsModalProps> = ({ isOpen, onClose, groupId }) => {
  const [inviteLink, setInviteLink] = useState<InviteLinkData | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [copied, setCopied] = useState(false);

  const { createdGroupId } = useGroupStore();
  const targetGroupId = groupId || createdGroupId;

  useEffect(() => {
    if (isOpen) {
      setInviteLink(null);
      setCopied(false);
    }
  }, [isOpen]);

  const handleGenerateLink = async () => {
    if (!targetGroupId) { toast.error("Group was not created properly."); return; }
    setIsGeneratingLink(true);
    try {
      const data = await generateInviteLink(targetGroupId);
      setInviteLink({ link: data.url, expiresAt: data.expiresAt });
      setCopied(false);
    } catch (error) {
      console.error("Error generating invite link:", error);
      toast.error(getInviteErrorMessage(error, "Failed to generate invite link."));
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

  if (!isOpen) return null;

  return (
    <div className="InviteFriendsModal-overlay">
      <div className="InviteFriendsModal-container">
        <button className="InviteFriendsModal-close-btn" onClick={onClose}>
          &times;
        </button>
        <h2 className="InviteFriendsModal-title">Invite Friends to Group</h2>

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

        <div className="InviteFriendsModal-btns-container">
          <button className="InviteFriendsModal-btn-submit" onClick={onClose}>Done</button>
          <button className="InviteFriendsModal-btn-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default InviteFriendsModal;
