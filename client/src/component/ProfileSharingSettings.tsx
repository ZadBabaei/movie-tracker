import { useEffect, useRef, useState } from "react";
import axios from "axios";
import type { ProfileUpdate, UserProfile } from "../store/useUserStore";

interface Props {
  profile: UserProfile;
  updateProfile: (data: ProfileUpdate) => Promise<void>;
}

const ProfileSharingSettings = ({ profile, updateProfile }: Props) => {
  const [username, setUsername] = useState(profile.username ?? "");
  const [discoverable, setDiscoverable] = useState(profile.discoverable ?? false);
  const [shareWatchHistory, setShareWatchHistory] = useState(profile.shareWatchHistory ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUsername(profile.username ?? "");
    setDiscoverable(profile.discoverable ?? false);
    setShareWatchHistory(profile.shareWatchHistory ?? false);
  }, [profile.username, profile.discoverable, profile.shareWatchHistory]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const changed = username !== (profile.username ?? "")
    || discoverable !== (profile.discoverable ?? false)
    || shareWatchHistory !== (profile.shareWatchHistory ?? false);
  // Discoverability can be enabled after a username is saved. An existing
  // opt-in can still be disabled when a username has been removed.
  const needsUsername = !profile.username && !discoverable;

  const clearFeedback = () => {
    setError("");
    setSaved(false);
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || !changed) return;
    inFlight.current = true;
    setSaving(true);
    clearFeedback();
    // Send only edited section fields. The server validates and normalizes the
    // username; clearing it must not silently change either privacy setting.
    const data: ProfileUpdate = {};
    if (username !== (profile.username ?? "")) data.username = username.trim() || null;
    if (discoverable !== (profile.discoverable ?? false)) data.discoverable = discoverable;
    if (shareWatchHistory !== (profile.shareWatchHistory ?? false)) data.shareWatchHistory = shareWatchHistory;
    try {
      await updateProfile(data);
      setSaved(true);
    } catch (cause: unknown) {
      const response = axios.isAxiosError(cause) ? cause.response : undefined;
      const message = response?.data?.msg;
      setError(response?.status === 409
        ? "That username is already taken."
        : response?.status === 400 && typeof message === "string"
          ? message
          : "Unable to save your profile settings. Please try again.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  if (typeof profile.discoverable !== "boolean" || typeof profile.shareWatchHistory !== "boolean") {
    return (
      <section className="Profile-pane Profile-pane--wide Profile-sharing" aria-labelledby="profile-sharing-heading">
        <h2 id="profile-sharing-heading">Profile &amp; Sharing</h2>
        <p role="status">Loading profile settings…</p>
      </section>
    );
  }

  return (
    <section className="Profile-pane Profile-pane--wide Profile-sharing" aria-labelledby="profile-sharing-heading">
      <h2 id="profile-sharing-heading">Profile &amp; Sharing</h2>
      <form onSubmit={save} aria-label="Profile & Sharing" aria-busy={saving}>
        <fieldset disabled={saving} className="Profile-sharing-fields">
          <div className="Profile-sharing-username">
            <label htmlFor="profile-username">Username</label>
            <div className="Profile-sharing-inputrow">
              <div className="Profile-username-control">
                <span aria-hidden="true">@</span>
                <input
                  ref={usernameRef}
                  id="profile-username"
                  value={username}
                  onChange={(event) => { setUsername(event.target.value); clearFeedback(); }}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-describedby="profile-username-help"
                  type="text"
                />
              </div>
              {username && (
                <button type="button" className="Profile-btn Profile-btn--quiet" onClick={() => {
                  setUsername("");
                  clearFeedback();
                  usernameRef.current?.focus();
                }}>Remove username</button>
              )}
            </div>
            <p id="profile-username-help" className="Profile-sharing-help">
              Optional. 3–30 letters, numbers, underscores, or single internal periods.
              Saved in lowercase. Leave blank to remove it.
            </p>
          </div>
          <div className="Profile-sharing-option">
            <input
              id="profile-discoverable"
              type="checkbox"
              checked={discoverable}
              disabled={needsUsername}
              aria-describedby={`profile-discoverable-help${needsUsername ? " profile-discoverable-requirement" : ""}`}
              onChange={(event) => { setDiscoverable(event.target.checked); clearFeedback(); }}
            />
            <div>
              <label htmlFor="profile-discoverable">Allow other Movie Tracker users to find me</label>
              <p id="profile-discoverable-help" className="Profile-sharing-help">
                Your username can appear in Movie Tracker user search. Your email is never shown.
              </p>
              {needsUsername && <p id="profile-discoverable-requirement" className="Profile-sharing-requirement">Choose a username first, then save it to enable discoverability.</p>}
            </div>
          </div>
          <div className="Profile-sharing-option">
            <input
              id="profile-share-history"
              type="checkbox"
              checked={shareWatchHistory}
              aria-describedby="profile-share-history-help"
              onChange={(event) => { setShareWatchHistory(event.target.checked); clearFeedback(); }}
            />
            <div>
              <label htmlFor="profile-share-history">Share my watch history</label>
              <p id="profile-share-history-help" className="Profile-sharing-help">
                Other logged-in Movie Tracker users will be able to view your shared watch history in read-only mode.
              </p>
            </div>
          </div>
        </fieldset>
        <p className="Profile-sharing-help">User search and shared history viewing are coming later. These settings save your preferences.</p>
        {error && <p ref={errorRef} tabIndex={-1} className="Profile-sharing-error" role="alert">{error}</p>}
        <div className="Profile-btnrow">
          <button type="submit" className="Profile-btn Profile-btn--solid" disabled={saving || !changed}>
            {saving ? "Saving changes…" : "Save changes"}
          </button>
          <span className="Profile-sharing-status" role="status">
            {saving ? "Saving your profile settings…" : saved ? "Profile & Sharing settings saved." : ""}
          </span>
        </div>
      </form>
    </section>
  );
};

export default ProfileSharingSettings;
