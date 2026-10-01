import { useEffect, useState } from "react";
import Modal from "./Modal/Modal";
import { useStremioIntegration } from "../hooks/useStremioIntegration";
import "./StremioHomeControl.css";

const formatSyncTime = (value: string | null | undefined) => {
  if (!value) return "No completed sync yet";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "No completed sync yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const ConnectModal = ({
  open,
  reconnecting,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  reconnecting: boolean;
  submitting: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (email: string, password: string) => Promise<boolean>;
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!open) {
      setEmail("");
      setPassword("");
    }
  }, [open]);

  const close = () => {
    if (submitting) return;
    setEmail("");
    setPassword("");
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const connected = await onSubmit(email.trim(), password);
    if (connected) close();
  };

  return (
    <Modal
      isOpen={open}
      onClose={close}
      closeOnOverlayClick={!submitting}
      closeOnEscape={!submitting}
      title={reconnecting ? "Reconnect Stremio" : "Connect Stremio"}
      size="sm"
      className="stremio-connect-modal"
    >
      <p className="stremio-modal-intro">
        Use your Stremio account to import completed movies into your private watch history.
        Your Stremio password is never stored. Movie Tracker securely stores an encrypted
        Stremio session so you can sync again without reconnecting.
      </p>
      <form className="stremio-connect-form" onSubmit={submit} autoComplete="off">
        <label>
          <span>Stremio email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="off"
            inputMode="email"
            maxLength={320}
            required
            disabled={submitting}
          />
        </label>
        <label>
          <span>Stremio password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            maxLength={1024}
            required
            disabled={submitting}
          />
        </label>
        {error ? <p className="stremio-form-error" role="alert">{error}</p> : null}
        <button className="stremio-form-submit" type="submit" disabled={submitting}>
          {submitting ? "Connecting…" : reconnecting ? "Reconnect account" : "Connect account"}
        </button>
      </form>
    </Modal>
  );
};

const DisconnectModal = ({
  open,
  submitting,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  submitting: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
}) => (
  <Modal
    isOpen={open}
    onClose={onClose}
    closeOnOverlayClick={!submitting}
    closeOnEscape={!submitting}
    title="Disconnect Stremio?"
    size="sm"
    variant="danger"
    className="stremio-connect-modal"
  >
    <p className="stremio-modal-intro">
      This removes the saved Stremio session. Movies already imported into your history stay in Movie Tracker.
    </p>
    {error ? <p className="stremio-form-error" role="alert">{error}</p> : null}
    <div className="stremio-confirm-actions">
      <button type="button" className="stremio-cancel-button" onClick={onClose} disabled={submitting}>Keep connected</button>
      <button
        type="button"
        className="stremio-disconnect-confirm"
        disabled={submitting}
        onClick={async () => {
          if (await onConfirm()) onClose();
        }}
      >
        {submitting ? "Disconnecting…" : "Disconnect"}
      </button>
    </div>
  </Modal>
);

const StremioHomeControl = ({
  onSyncComplete,
}: {
  onSyncComplete?: () => void | Promise<void>;
}) => {
  const [connectOpen, setConnectOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const {
    integration,
    loading,
    operation,
    error,
    syncResult,
    connect,
    sync,
    disconnect,
    clearError,
  } = useStremioIntegration({ onSyncComplete });

  const reauth = integration?.status === "reauth_required";
  const integrationError = integration?.status === "error";
  const reconnecting = reauth || integrationError;
  const connected = integration?.status === "connected" && integration.connected;
  const lastSync = integration?.lastSuccessfulSyncAt;
  const syncStatusMessage = integration?.lastSyncStatus === "partial"
    ? "The latest sync completed with some items needing attention."
    : integration?.lastSyncStatus === "failed"
      ? "The latest sync did not complete. Try again."
      : "";
  const attentionCount = syncResult
    ? syncResult.matching.movieMissing
      + syncResult.matching.unsupported
      + syncResult.matching.retryableErrors
      + syncResult.import.timestampUnavailable
      + syncResult.import.invalidMatch
    : 0;

  const openConnect = () => {
    clearError();
    setConnectOpen(true);
  };

  return (
    <>
      <div className="stremio-core" aria-live="polite">
        <span className="core-eyebrow">
          {loading
            ? "Reading signal"
            : reconnecting
              ? "Signal interrupted"
              : connected
                ? "Stremio linked"
                : "Stremio signal"}
        </span>

        {loading ? (
          <>
            <span className="stremio-scan" aria-hidden="true" />
            <p className="stremio-core-copy">Checking your connection…</p>
          </>
        ) : connected ? (
          <>
            <h1>Bring your history into orbit.</h1>
            <button
              type="button"
              className="stremio-sync-button"
              onClick={() => void sync()}
              disabled={operation !== null}
            >
              <span>{operation === "sync" ? "SYNCING" : "SYNC"}</span>
              <i aria-hidden="true" />
            </button>
            <p className="stremio-last-sync">
              Last successful sync<br />
              {lastSync ? <time dateTime={lastSync}>{formatSyncTime(lastSync)}</time> : <span>No completed sync yet</span>}
            </p>
            {syncResult ? (
              <p className="stremio-result" role="status">
                {syncResult.import.imported} imported · {syncResult.matching.matched} matched
                {attentionCount ? ` · ${attentionCount} need attention` : " · signal clear"}
              </p>
            ) : null}
            {syncStatusMessage && !syncResult && !error ? (
              <p className="stremio-core-error" role="status">{syncStatusMessage}</p>
            ) : null}
            {error && !disconnectOpen ? <p className="stremio-core-error" role="alert">{error}</p> : null}
            <button
              type="button"
              className="stremio-disconnect-link"
              onClick={() => {
                clearError();
                setDisconnectOpen(true);
              }}
              disabled={operation !== null}
            >
              Disconnect
            </button>
          </>
        ) : (
          <>
            <h1>{reconnecting ? "Reconnect the signal." : "Bring your history into orbit."}</h1>
            <p className="stremio-core-copy">
              {reauth
                ? "Your Stremio session expired. Reconnect to resume movie imports."
                : integrationError
                  ? "Your Stremio connection needs attention. Reconnect to resume movie imports."
                : "Connect Stremio, then sync completed movies into your private history."}
            </p>
            <button type="button" className="stremio-connect-button" onClick={openConnect} disabled={operation !== null}>
              {reconnecting ? "Reconnect Stremio" : "Connect Stremio"}
            </button>
            {error && !connectOpen ? <p className="stremio-core-error" role="alert">{error}</p> : null}
          </>
        )}
      </div>

      <ConnectModal
        open={connectOpen}
        reconnecting={reconnecting}
        submitting={operation === "connect"}
        error={connectOpen ? error : ""}
        onClose={() => {
          if (operation !== "connect") {
            clearError();
            setConnectOpen(false);
          }
        }}
        onSubmit={connect}
      />
      <DisconnectModal
        open={disconnectOpen}
        submitting={operation === "disconnect"}
        error={disconnectOpen ? error : ""}
        onClose={() => {
          if (operation !== "disconnect") {
            clearError();
            setDisconnectOpen(false);
          }
        }}
        onConfirm={disconnect}
      />
    </>
  );
};

export default StremioHomeControl;
