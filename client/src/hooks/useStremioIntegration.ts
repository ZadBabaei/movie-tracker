import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectStremio,
  disconnectStremio,
  fetchIntegrations,
  StremioApiError,
  type StremioIntegration,
  type StremioSyncResult,
  syncStremio,
} from "../api/integrationsApi";

export type StremioOperation = "connect" | "sync" | "disconnect" | null;

const messageFor = (error: unknown, operation: Exclude<StremioOperation, null>) => {
  const code = error instanceof StremioApiError ? error.code : "request_failed";
  if (code === "invalid_credentials") return "That Stremio email or password was not accepted.";
  if (code === "invalid_input") return "Enter a valid Stremio email and password.";
  if (code === "stremio_reauth_required" || code === "stremio_not_connected") {
    return "Your Stremio session needs to be reconnected.";
  }
  if (code === "stremio_provider_unavailable") {
    return "Stremio is unavailable right now. Try again in a moment.";
  }
  if (code === "integration_changed") {
    return "The Stremio connection changed during sync. Please try again.";
  }
  if (operation === "connect") return "Stremio could not be connected. Please try again.";
  if (operation === "disconnect") return "Stremio could not be disconnected. Please try again.";
  return "The Stremio sync could not be completed. Please try again.";
};

export const useStremioIntegration = ({
  onSyncComplete,
}: {
  onSyncComplete?: () => void | Promise<void>;
} = {}) => {
  const [integration, setIntegration] = useState<StremioIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<StremioOperation>(null);
  const [error, setError] = useState("");
  const [syncResult, setSyncResult] = useState<StremioSyncResult | null>(null);
  const operationRef = useRef<StremioOperation>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const integrations = await fetchIntegrations();
      if (mountedRef.current) {
        setIntegration(integrations.find((item) => item.provider === "stremio") || null);
        setError("");
      }
    } catch {
      if (mountedRef.current) setError("Your Stremio connection status could not be loaded.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(async <T,>(
    kind: Exclude<StremioOperation, null>,
    task: () => Promise<T>
  ): Promise<T | undefined> => {
    if (operationRef.current) return undefined;
    operationRef.current = kind;
    setOperation(kind);
    setError("");
    try {
      return await task();
    } catch (caught) {
      if (mountedRef.current) setError(messageFor(caught, kind));
      if (
        kind === "sync" &&
        caught instanceof StremioApiError &&
        (caught.code === "stremio_reauth_required" || caught.code === "stremio_not_connected")
      ) {
        await refresh();
      }
      return undefined;
    } finally {
      operationRef.current = null;
      if (mountedRef.current) setOperation(null);
    }
  }, [refresh]);

  const connect = useCallback(async (email: string, password: string) => {
    const connected = await run("connect", () => connectStremio(email, password));
    if (!connected || !mountedRef.current) return false;
    setIntegration(connected);
    setSyncResult(null);
    return true;
  }, [run]);

  const sync = useCallback(async () => {
    const result = await run("sync", syncStremio);
    if (!result || !mountedRef.current) return false;
    setSyncResult(result);
    await Promise.all([refresh(), Promise.resolve(onSyncComplete?.())]);
    return true;
  }, [onSyncComplete, refresh, run]);

  const disconnect = useCallback(async () => {
    const disconnected = await run("disconnect", async () => {
      await disconnectStremio();
      return true;
    });
    if (!disconnected || !mountedRef.current) return false;
    setIntegration(null);
    setSyncResult(null);
    return true;
  }, [run]);

  return {
    integration,
    loading,
    operation,
    error,
    syncResult,
    connect,
    sync,
    disconnect,
    clearError: () => setError(""),
    refresh,
  };
};
