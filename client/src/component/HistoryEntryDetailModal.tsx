import React, { useEffect, useMemo, useState } from "react";
import { FaClock, FaMapMarkerAlt, FaTrashAlt, FaUsers } from "react-icons/fa";
import { toast } from "react-toastify";
import Modal from "./Modal/Modal";
import ParticipantPicker from "./ParticipantPicker";
import { fetchGroupMembers } from "../api/groupApi";
import { fetchHistoryParticipantOptions, type UpdateHistoryPayload } from "../api/historyApi";
import { HistoryEntry, HistoryMember, useWatchHistoryStore } from "../store/useWatchHistoryStore";
import { getEntryPosterPath, getEntrySubtitle, getEntryTitle, historyImageUrl, isTvEntry } from "../utils/historyEntry";
import "./HistoryEntryDetailModal.css";

/**
 * Detail / edit / delete / rate for exactly one WatchHistoryEntry, keyed by
 * its `_id`. Shared by the Watch History timeline and the TV series page so
 * there is a single mutation path; both go through the history store, which
 * also keeps any loaded timeline buckets in sync.
 */

export interface HistoryEntryDetailModalProps {
  entry: HistoryEntry | null;
  onClose: () => void;
  /** Called with the server's copy after an edit or rating. */
  onUpdated?: (entry: HistoryEntry) => void;
  /** Called with the deleted record's `_id`. */
  onDeleted?: (entryId: string) => void;
}

export const formatWatchedDate = (value: string) => new Date(value).toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const toDateInput = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const posterUrl = (path: string) => historyImageUrl(path) || "/default-avatar.png";

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

const HistoryEntryDetailModal: React.FC<HistoryEntryDetailModalProps> = ({ entry, onClose, onUpdated, onDeleted }) => {
  const { updateEntry, deleteEntry, rateEntry } = useWatchHistoryStore();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editParticipants, setEditParticipants] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<HistoryMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState("");
  const [participantsError, setParticipantsError] = useState("");

  const groupId = entry?.scope === "group" ? entry.group?._id || "" : "";
  const isGroupEntry = Boolean(groupId);
  const isPersonalEntry = entry?.scope === "personal";
  // A personal watch always includes its owner; the picker only chooses who else.
  const ownerId = isPersonalEntry ? entry?.createdBy?._id || "" : "";
  const canEdit = entry?.canEdit !== false;

  const resetForm = (source: HistoryEntry) => {
    setEditDate(toDateInput(source.watchedAt));
    setEditLocation(source.watchedLocation || "");
    setEditNotes(source.watchedNotes || "");
    const owner = source.scope === "personal" ? source.createdBy?._id : "";
    setEditParticipants(source.participants.map((member) => member._id).filter((id) => id !== owner));
    setParticipantsError("");
  };

  // Reset the form whenever a record is opened or replaced by its saved copy.
  useEffect(() => {
    if (!entry) return;
    setEditing(false);
    setConfirmDelete(false);
    resetForm(entry);
  }, [entry]);

  // Group watch: the group's current members (as in the add flow). Personal
  // watch: everyone who shares a group with you. Either way, anyone already
  // recorded on this watch stays listed so they can be kept or removed.
  useEffect(() => {
    if (!editing || (!groupId && !isPersonalEntry)) return;
    let cancelled = false;
    setLoadingMembers(true);
    setMembersError("");
    (groupId ? fetchGroupMembers(groupId) : fetchHistoryParticipantOptions())
      .then((members: HistoryMember[]) => {
        if (!cancelled) setGroupMembers(members);
      })
      .catch(() => {
        if (cancelled) return;
        setGroupMembers([]);
        setMembersError(groupId
          ? "Couldn't load group members. You can still keep or remove the people already listed."
          : "Couldn't load people from your groups. You can still keep or remove the people already listed.");
      })
      .finally(() => {
        if (!cancelled) setLoadingMembers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editing, groupId, isPersonalEntry]);

  const participantOptions = useMemo(() => {
    if (!entry) return [];
    const known = new Set(groupMembers.map((member) => member._id));
    return [...groupMembers, ...entry.participants.filter((member) => !known.has(member._id))]
      .filter((member) => member._id !== ownerId);
  }, [entry, groupMembers, ownerId]);

  const toggleParticipant = (memberId: string) => {
    setParticipantsError("");
    setEditParticipants((prev) => (prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]));
  };

  const cancelEdit = () => {
    if (entry) resetForm(entry);
    setEditing(false);
  };

  const saveEdit = async () => {
    if (!entry || !editDate) return;
    const payload: UpdateHistoryPayload = { watchedAt: editDate, watchedLocation: editLocation, watchedNotes: editNotes };
    if (isGroupEntry) {
      if (editParticipants.length === 0) {
        setParticipantsError("Select at least one person who watched.");
        return;
      }
      // Only send participants when they changed, so editing a date or a note
      // never rewrites who watched.
      const savedIds = entry.participants.map((member) => member._id);
      if (!sameIds(editParticipants, savedIds)) payload.participants = editParticipants;
    } else if (isPersonalEntry && ownerId) {
      const savedOthers = entry.participants.map((member) => member._id).filter((id) => id !== ownerId);
      if (!sameIds(editParticipants, savedOthers)) payload.participants = [ownerId, ...editParticipants];
    }
    setSaving(true);
    try {
      const updated = await updateEntry(entry._id, payload);
      onUpdated?.(updated);
      setEditing(false);
      toast.success("Watch details updated.");
    } catch (error: any) {
      toast.error(error?.response?.data?.msg || "Unable to update watch details.");
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async () => {
    if (!entry) return;
    setDeleting(true);
    try {
      await deleteEntry(entry._id);
      onDeleted?.(entry._id);
      toast.success("History entry deleted.");
    } catch (error: any) {
      toast.error(error?.response?.data?.msg || "Unable to delete this history entry.");
    } finally {
      setDeleting(false);
    }
  };

  const saveRating = async (value: number) => {
    if (!entry) return;
    try {
      const updated = await rateEntry(entry._id, value);
      onUpdated?.(updated);
      toast.success("Rating saved.");
    } catch (error: any) {
      toast.error(error?.response?.data?.msg || "Unable to save your rating.");
    }
  };

  return (
    <Modal isOpen={!!entry} onClose={onClose} size="lg" ariaLabel="Watch history details" className="history-details-modal">
      {entry ? (
        <div className="history-details" data-testid="entry-detail" data-entry-id={entry._id}>
          <img className="history-details-poster" src={posterUrl(getEntryPosterPath(entry))} alt={`${getEntryTitle(entry)} poster`} />
          <div className="history-details-body">
            <p className="history-details-context">{entry.scope === "group" ? entry.group?.name : "Personal history"}</p>
            <h2>{getEntryTitle(entry)}</h2>
            {isTvEntry(entry) && <p className="history-details-episode">{getEntrySubtitle(entry)}</p>}
            {!editing ? (
              <>
                <div className="history-detail-facts">
                  <p><FaClock aria-hidden="true" /><span><small>Watched</small>{formatWatchedDate(entry.watchedAt)}</span></p>
                  <p><FaMapMarkerAlt aria-hidden="true" /><span><small>Location</small>{entry.watchedLocation || "Not recorded"}</span></p>
                  <p><FaUsers aria-hidden="true" /><span><small>Watched with</small>{entry.participants.map((member) => member.name).join(", ") || "Just you"}</span></p>
                </div>
                {entry.watchedNotes && <blockquote>{entry.watchedNotes}</blockquote>}
                <label className="history-rating-control">Your rating
                  <select value={entry.currentUserRating ?? ""} onChange={(event) => event.target.value && saveRating(Number(event.target.value))}>
                    <option value="">Not rated</option>
                    {Array.from({ length: 10 }, (_, index) => 10 - index).map((rating) => <option value={rating} key={rating}>{rating}/10</option>)}
                  </select>
                </label>
                {canEdit ? (
                  <div className="history-detail-actions">
                    <button type="button" onClick={() => setEditing(true)}>Edit details</button>
                    <button type="button" className="danger" onClick={() => setConfirmDelete(true)}><FaTrashAlt /> Delete</button>
                  </div>
                ) : (
                  <p className="history-edit-hint">Added by {entry.createdBy?.name || "another member"}. Only they can edit or delete this watch.</p>
                )}
                {confirmDelete && <div className="history-delete-confirm"><p>Delete this watch entry? This cannot be undone.</p><div><button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button><button type="button" className="danger" disabled={deleting} onClick={removeEntry}>{deleting ? "Deleting…" : "Delete entry"}</button></div></div>}
              </>
            ) : (
              <div className="history-edit-form">
                <label>Watched date<input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} /></label>
                <label>Location<input type="text" value={editLocation} maxLength={300} onChange={(event) => setEditLocation(event.target.value)} /></label>
                <label>Notes<textarea value={editNotes} maxLength={2000} rows={5} onChange={(event) => setEditNotes(event.target.value)} /></label>
                <fieldset className="history-edit-participants" data-testid="edit-participants">
                  <legend>Who did you watch with?</legend>
                  {isGroupEntry || isPersonalEntry ? (
                    <>
                      {isPersonalEntry && <p className="history-edit-hint">You're always included. Add anyone who shares a group with you; it will show in their history too.</p>}
                      {membersError && <p className="history-edit-hint">{membersError}</p>}
                      {isPersonalEntry && !loadingMembers && !membersError && participantOptions.length === 0 && (
                        <p className="history-edit-hint">Join or create a group to add the people you watch with.</p>
                      )}
                      <ParticipantPicker
                        members={participantOptions}
                        selected={editParticipants}
                        onToggle={toggleParticipant}
                        loading={loadingMembers}
                        error={participantsError}
                        disabled={saving}
                      />
                    </>
                  ) : (
                    <p className="history-edit-hint">Just you. Personal history only records you; add the watch to a group to log who you watched with.</p>
                  )}
                </fieldset>
                <div><button type="button" onClick={cancelEdit} disabled={saving}>Cancel</button><button type="button" className="primary" onClick={saveEdit} disabled={saving || !editDate}>{saving ? "Saving…" : "Save changes"}</button></div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
};

export default HistoryEntryDetailModal;
