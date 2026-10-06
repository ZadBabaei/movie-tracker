import axios from "axios";
import apiClient from "./apiClient";

export type StremioIntegrationStatus =
  | "connected"
  | "disconnected"
  | "reauth_required"
  | "error";

export type StremioSyncStatus = "success" | "partial" | "failed";

export interface StremioIntegration {
  provider: "stremio";
  status: StremioIntegrationStatus;
  connected: boolean;
  lastSyncStartedAt: string | null;
  lastSyncCompletedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastSyncStatus: StremioSyncStatus | null;
  lastErrorCode: string | null;
}

export interface StremioSyncResult {
  provider: "stremio";
  status: "success";
  snapshot: {
    snapshotItems: number;
    movieStates: number;
    tvSeriesExamined?: number;
    tvEpisodeStates?: number;
    ignoredItems: number;
    observed: number;
    upserted: number;
    matched: number;
    modified: number;
  };
  matching: {
    examined: number;
    matched: number;
    movieMissing: number;
    unsupported: number;
    retryableErrors: number;
    skippedStale: number;
    tvEpisodesExamined?: number;
    tvEpisodesMatched?: number;
    tvEpisodesMissing?: number;
  };
  import: {
    examined: number;
    imported: number;
    alreadyImported: number;
    timestampUnavailable: number;
    invalidMatch: number;
    skippedStale: number;
    duplicatesDetected?: number;
    tvEpisodesExamined?: number;
    tvEpisodesImported?: number;
    tvEpisodesSkipped?: number;
  };
}

export type StremioApiErrorCode =
  | "invalid_credentials"
  | "stremio_not_connected"
  | "stremio_reauth_required"
  | "stremio_provider_unavailable"
  | "integration_changed"
  | "stremio_sync_failed"
  | "invalid_input"
  | "request_failed";

export class StremioApiError extends Error {
  constructor(public readonly code: StremioApiErrorCode) {
    super(code);
    this.name = "StremioApiError";
  }
}

const authConfig = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
  skipAuthRedirect: true,
});

const knownCodes = new Set<StremioApiErrorCode>([
  "invalid_credentials",
  "stremio_not_connected",
  "stremio_reauth_required",
  "stremio_provider_unavailable",
  "integration_changed",
  "stremio_sync_failed",
]);

const normalizeError = (error: unknown): never => {
  if (!axios.isAxiosError(error)) throw new StremioApiError("request_failed");
  const providerCode = error.response?.data?.code;
  if (typeof providerCode === "string" && knownCodes.has(providerCode as StremioApiErrorCode)) {
    throw new StremioApiError(providerCode as StremioApiErrorCode);
  }
  if (error.response?.status === 400) throw new StremioApiError("invalid_input");
  throw new StremioApiError("request_failed");
};

export const fetchIntegrations = async (): Promise<StremioIntegration[]> => {
  try {
    const response = await apiClient.get("/api/integrations", authConfig());
    return Array.isArray(response.data?.integrations) ? response.data.integrations : [];
  } catch (error) {
    return normalizeError(error);
  }
};

export const connectStremio = async (
  email: string,
  password: string
): Promise<StremioIntegration> => {
  try {
    const response = await apiClient.post(
      "/api/integrations/stremio/connect",
      { email, password },
      authConfig()
    );
    return response.data.integration;
  } catch (error) {
    return normalizeError(error);
  }
};

export const syncStremio = async (): Promise<StremioSyncResult> => {
  try {
    const response = await apiClient.post(
      "/api/integrations/stremio/sync",
      undefined,
      authConfig()
    );
    return response.data;
  } catch (error) {
    return normalizeError(error);
  }
};

export const disconnectStremio = async (): Promise<void> => {
  try {
    await apiClient.delete("/api/integrations/stremio", authConfig());
  } catch (error) {
    return normalizeError(error);
  }
};
