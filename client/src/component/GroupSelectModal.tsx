import React, { useState, useEffect } from "react";
import { FaArrowLeft, FaArrowRight } from "react-icons/fa";
import apiClient from "../api/apiClient";
import { getAvatarUrl, handleAvatarError } from "../utils/avatar";
import Modal from "./Modal/Modal";
import "./GroupSelectModal.css";

interface GroupOption {
  _id: string;
  name: string;
}

interface Member {
  _id: string;
  name: string;
  avatar?: string;
}

export interface WatchMetadata {
  watchedDate: string;
  watchedWhere: string;
  watchedWith: string[];
}

interface GroupSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (groupId: string, metadata?: WatchMetadata) => void;
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
  // Step 1: group select, Step 2: when + where, Step 3: who
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [watchedDate, setWatchedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [watchedWhere, setWatchedWhere] = useState("");
  const [watchedWith, setWatchedWith] = useState<string[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [watchedWithError, setWatchedWithError] = useState("");
  const [hasEditedWatchedWith, setHasEditedWatchedWith] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setSelectedGroupId("");
      setMembers([]);
      setWatchedDate(new Date().toISOString().split("T")[0]);
      setWatchedWhere("");
      setWatchedWith([]);
      setWatchedWithError("");
      setHasEditedWatchedWith(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!selectedGroupId || hasEditedWatchedWith) return;
    setWatchedWith(members.map((member) => member._id));
  }, [members, selectedGroupId, hasEditedWatchedWith]);

  const handleGroupClick = async (groupId: string) => {
    setSelectedGroupId(groupId);
    setStep(2);
    setLoadingMembers(true);
    setWatchedWithError("");
    setHasEditedWatchedWith(false);
    try {
      const token = localStorage.getItem("token");
      const res = await apiClient.get(`/api/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const fetchedMembers: Member[] = res.data.members || [];
      setMembers(fetchedMembers);
      setWatchedWith(fetchedMembers.map((m) => m._id));
    } catch {
      setMembers([]);
      setWatchedWith([]);
    } finally {
      setLoadingMembers(false);
    }
  };

  const toggleMember = (memberId: string) => {
    setHasEditedWatchedWith(true);
    setWatchedWithError("");
    setWatchedWith((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleDone = () => {
    if (watchedWith.length === 0) {
      setWatchedWithError("Select at least one person who watched.");
      return;
    }

    onSelect(selectedGroupId, {
      watchedDate,
      watchedWhere,
      watchedWith,
    });
  };

  const handleSkip = () => {
    // Skip fills defaults: today, no location, all members
    onSelect(selectedGroupId, {
      watchedDate: new Date().toISOString().split("T")[0],
      watchedWhere: "",
      watchedWith: members.map((m) => m._id),
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      ariaLabel="Mark as watched"
    >
      {/* ── Step 1: Select Group ── */}
        {step === 1 && (
          <>
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
                    data-testid="group-select-option"
                    onClick={() => handleGroupClick(group._id)}
                  >
                    {group.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Step 2: When + Where ── */}
        {step === 2 && (
          <>
            <button className="group-select-back" onClick={() => setStep(1)}>
              <FaArrowLeft /> Back
            </button>
            <h2 className="group-select-heading">When & Where</h2>
            <p className="group-select-sub">
              Details for <strong>{movieTitle}</strong>
            </p>
            <div className="group-select-step-indicator">Step 1 of 2</div>

            <div className="group-select-form">
              <div className="group-select-field">
                <label>When did you watch?</label>
                <input
                  type="date"
                  value={watchedDate}
                  onChange={(e) => setWatchedDate(e.target.value)}
                  className="group-select-input"
                  data-testid="group-select-date"
                />
              </div>

              <div className="group-select-field">
                <label>Where did you watch?</label>
                <input
                  type="text"
                  value={watchedWhere}
                  onChange={(e) => setWatchedWhere(e.target.value)}
                  className="group-select-input"
                  placeholder="e.g. Cineplex, home, Netflix, Zad's place"
                  data-testid="group-select-location-input"
                />
              </div>

              <div className="group-select-actions">
                <button
                  className="group-select-btn group-select-btn--skip"
                  onClick={handleSkip}
                >
                  Skip All
                </button>
                <button
                  className="group-select-btn group-select-btn--done"
                  onClick={() => setStep(3)}
                >
                  Next <FaArrowRight style={{ marginLeft: 6 }} />
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Step 3: Who ── */}
        {step === 3 && (
          <>
            <button className="group-select-back" onClick={() => setStep(2)}>
              <FaArrowLeft /> Back
            </button>
            <h2 className="group-select-heading">Who Watched?</h2>
            <p className="group-select-sub">
              Select members who watched <strong>{movieTitle}</strong>
            </p>
            <div className="group-select-step-indicator">Step 2 of 2</div>

            <div className="group-select-form">
              <div className="group-select-field">
                {loadingMembers ? (
                  <p className="group-select-loading">Loading members...</p>
                ) : (
                  <div className="group-select-member-list">
                    {members.map((member) => (
                      <button
                        key={member._id}
                        className={`group-select-member-chip ${
                          watchedWith.includes(member._id)
                            ? "group-select-member-chip--active"
                            : ""
                        }`}
                        data-testid="group-select-member"
                        onClick={() => toggleMember(member._id)}
                      >
                        <div className="member-chip-avatar">
                          <img
                            src={getAvatarUrl(member)}
                            alt={member.name}
                            onError={(event) => handleAvatarError(event, member)}
                          />
                        </div>
                        <span className="member-chip-name">{member.name}</span>
                        {watchedWith.includes(member._id) && (
                          <span className="member-chip-check">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {watchedWithError && (
                  <p className="group-select-error">{watchedWithError}</p>
                )}
              </div>

              <div className="group-select-actions">
                <button
                  className="group-select-btn group-select-btn--skip"
                  onClick={handleSkip}
                >
                  Skip
                </button>
                <button
                  className="group-select-btn group-select-btn--done"
                  data-testid="group-select-done"
                  onClick={handleDone}
                >
                  Done
                </button>
              </div>
            </div>
          </>
        )}
    </Modal>
  );
};

export default GroupSelectModal;
