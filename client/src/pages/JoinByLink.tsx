import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { validateInviteLink, joinByLink } from "../api/groupApi";
import { toast } from "react-toastify";
import "./JoinByLink.css";

type Status = "loading" | "valid" | "joined" | "already-member" | "auth-required" | "expired" | "error";

interface GroupInfo {
  groupId: string;
  groupName: string;
}

const JoinByLink: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const isAuthenticated = !!localStorage.getItem("token");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }

    const validate = async () => {
      try {
        const data = await validateInviteLink(token);
        setGroupInfo({ groupId: data.groupId, groupName: data.groupName });

        if (isAuthenticated) {
          await handleJoin();
        } else {
          setStatus("auth-required");
        }
      } catch (err: any) {
        if (err.response?.status === 410) {
          setStatus("expired");
        } else if (err.response?.status === 404) {
          setStatus("error");
        } else {
          setStatus("error");
        }
      }
    };

    const handleJoin = async () => {
      try {
        const data = await joinByLink(token!);
        if (data.alreadyMember) {
          setStatus("already-member");
          setGroupInfo((prev) => prev || { groupId: data.groupId, groupName: "" });
        } else {
          setStatus("joined");
          setGroupInfo((prev) => prev || { groupId: data.groupId, groupName: "" });
          toast.success("Successfully joined the group!");
        }
      } catch (err: any) {
        if (err.response?.status === 401) {
          setStatus("auth-required");
        } else if (err.response?.status === 410) {
          setStatus("expired");
        } else {
          setStatus("error");
        }
      }
    };

    validate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleGoToGroup = () => {
    if (groupInfo?.groupId) {
      navigate(`/group/${groupInfo.groupId}`);
    }
  };

  const handleSignIn = () => {
    sessionStorage.setItem("redirectAfterAuth", `/invite/${token}`);
    navigate("/");
  };

  const handleSignUp = () => {
    sessionStorage.setItem("redirectAfterAuth", `/invite/${token}`);
    navigate("/signup");
  };

  return (
    <div className="joinbylink-container">
      <div className="joinbylink-content">
        <div className="joinbylink-icon">🎬</div>

        {status === "loading" && (
          <>
            <h2 className="joinbylink-title">Joining group…</h2>
            <p className="joinbylink-text">Please wait while we process your invitation.</p>
            <div className="joinbylink-spinner" />
          </>
        )}

        {status === "joined" && (
          <>
            <h2 className="joinbylink-title">You're in! 🎉</h2>
            <p className="joinbylink-text">
              You've successfully joined{" "}
              <strong>{groupInfo?.groupName || "the group"}</strong>.
            </p>
            <button className="joinbylink-btn" onClick={handleGoToGroup}>
              Go to Group
            </button>
          </>
        )}

        {status === "already-member" && (
          <>
            <h2 className="joinbylink-title">Already a member</h2>
            <p className="joinbylink-text">
              You're already a member of this group.
            </p>
            <button className="joinbylink-btn" onClick={handleGoToGroup}>
              Go to Group
            </button>
          </>
        )}

        {status === "auth-required" && (
          <>
            <h2 className="joinbylink-title">You're Invited!</h2>
            <p className="joinbylink-text">
              You've been invited to join{" "}
              <strong>{groupInfo?.groupName || "a group"}</strong> on Movie Tracker.
              Sign in or create an account to join.
            </p>
            <div className="joinbylink-btn-group">
              <button className="joinbylink-btn" onClick={handleSignIn}>
                Sign In
              </button>
              <button className="joinbylink-btn joinbylink-btn-secondary" onClick={handleSignUp}>
                Sign Up
              </button>
            </div>
          </>
        )}

        {status === "expired" && (
          <>
            <h2 className="joinbylink-title">Link Expired</h2>
            <p className="joinbylink-text">
              This invitation link has expired. Ask the group owner to send a new one.
            </p>
            <button className="joinbylink-btn" onClick={() => navigate("/home")}>
              Go Home
            </button>
          </>
        )}

        {status === "error" && (
          <>
            <h2 className="joinbylink-title">Invalid Link</h2>
            <p className="joinbylink-text">
              This invitation link is invalid or no longer exists.
            </p>
            <button className="joinbylink-btn" onClick={() => navigate("/home")}>
              Go Home
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default JoinByLink;
