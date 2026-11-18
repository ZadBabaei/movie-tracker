import React from "react";
import { getAvatarUrl, handleAvatarError } from "../utils/avatar";
import "./GroupSelectModal.css";

export interface ParticipantOption {
  _id: string;
  name: string;
  avatar?: string;
}

interface ParticipantPickerProps {
  members: ParticipantOption[];
  selected: string[];
  onToggle: (memberId: string) => void;
  loading?: boolean;
  error?: string;
  disabled?: boolean;
}

/**
 * "Who watched?" member chips. Used by the add flow (GroupSelectModal) and
 * the edit flow (HistoryEntryDetailModal) so both pick participants the same
 * way. Only group members are offered; the server enforces the same rule.
 */
const ParticipantPicker: React.FC<ParticipantPickerProps> = ({
  members,
  selected,
  onToggle,
  loading = false,
  error = "",
  disabled = false,
}) => (
  <>
    {loading ? (
      <p className="group-select-loading">Loading members...</p>
    ) : (
      <div className="group-select-member-list">
        {members.map((member) => {
          const isSelected = selected.includes(member._id);
          return (
            <button
              type="button"
              key={member._id}
              className={`group-select-member-chip ${isSelected ? "group-select-member-chip--active" : ""}`}
              data-testid="group-select-member"
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => onToggle(member._id)}
            >
              <div className="member-chip-avatar">
                <img
                  src={getAvatarUrl(member)}
                  alt={member.name}
                  onError={(event) => handleAvatarError(event, member)}
                />
              </div>
              <span className="member-chip-name">{member.name}</span>
              {isSelected && <span className="member-chip-check">✓</span>}
            </button>
          );
        })}
      </div>
    )}
    {error && <p className="group-select-error">{error}</p>}
  </>
);

export default ParticipantPicker;
