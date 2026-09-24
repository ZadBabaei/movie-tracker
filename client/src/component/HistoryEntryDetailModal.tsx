import React, { useEffect, useState } from "react";
import { FaClock, FaMapMarkerAlt, FaTrashAlt, FaUsers } from "react-icons/fa";
import { toast } from "react-toastify";
import Modal from "./Modal/Modal";
import { HistoryEntry, useWatchHistoryStore } from "../store/useWatchHistoryStore";
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

const HistoryEntryDetailModal: React.FC<HistoryEntryDetailModalProps> = ({ entry, onClose, onUpdated, onDeleted }) => {
  const { updateEntry, deleteEntry, rateEntry } = useWatchHistoryStore();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Reset the form whenever a record is opened or replaced by its saved copy.
  useEffect(() => {
    if (!entry) return;
    setEditing(false);
    setConfirmDelete(false);
    setEditDate(toDateInput(entry.watchedAt));
    setEditLocation(entry.watchedLocation || "");
    setEditNotes(entry.watchedNotes || "");
  }, [entry]);

  const saveEdit = async () => {
    if (!entry || !editDate) return;
    setSaving(true);
    try {
      const updated = await updateEntry(entry._id, { watchedAt: editDate, watchedLocation: editLocation, watchedNotes: editNotes });
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
                <div className="history-detail-actions">
                  <button type="button" onClick={() => setEditing(true)}>Edit details</button>
                  <button type="button" className="danger" onClick={() => setConfirmDelete(true)}><FaTrashAlt /> Delete</button>
                </div>
                {confirmDelete && <div className="history-delete-confirm"><p>Delete this watch entry? This cannot be undone.</p><div><button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button><button type="button" className="danger" disabled={deleting} onClick={removeEntry}>{deleting ? "Deleting…" : "Delete entry"}</button></div></div>}
              </>
            ) : (
              <div className="history-edit-form">
                <label>Watched date<input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} /></label>
                <label>Location<input type="text" value={editLocation} maxLength={300} onChange={(event) => setEditLocation(event.target.value)} /></label>
                <label>Notes<textarea value={editNotes} maxLength={2000} rows={5} onChange={(event) => setEditNotes(event.target.value)} /></label>
                <div><button type="button" onClick={() => setEditing(false)} disabled={saving}>Cancel</button><button type="button" className="primary" onClick={saveEdit} disabled={saving || !editDate}>{saving ? "Saving…" : "Save changes"}</button></div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
};

export default HistoryEntryDetailModal;
