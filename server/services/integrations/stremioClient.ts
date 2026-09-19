const STREMIO_API_BASE_URL = "https://api.strem.io/api";
const DEFAULT_TIMEOUT_MS = 15_000;

export type StremioErrorCode =
  | "invalid_credentials"
  | "invalid_session"
  | "provider_unavailable"
  | "provider_protocol_error"
  | "network_error";

export class StremioClientError extends Error {
  constructor(public readonly code: StremioErrorCode) {
    super(code);
    this.name = "StremioClientError";
  }
}

export interface StremioConnectionClient {
  login(email: string, password: string): Promise<{ authKey: string }>;
  logout(authKey: string): Promise<{ revoked: true }>;
}

export interface StremioLibraryItemDto {
  id?: string;
  type?: string;
  removed: boolean;
  revision?: string;
  state: {
    timesWatched?: number;
    lastWatched?: string;
  };
}

export interface StremioSnapshotClient {
  getLibrarySnapshot(authKey: string): Promise<StremioLibraryItemDto[]>;
}

export interface StremioClient extends StremioConnectionClient, StremioSnapshotClient {}

type FetchImplementation = typeof fetch;
type JsonObject = Record<string, unknown>;

const apiErrorCode = (payload: JsonObject) => {
  const error = payload.error;
  if (!error || typeof error !== "object") return undefined;
  const code = (error as JsonObject).code;
  return typeof code === "number" ? code : undefined;
};

const boundedString = (value: unknown, maxLength: number) =>
  typeof value === "string" && value.length > 0 && value.length <= maxLength
    ? value
    : undefined;

const toLibraryItemDto = (value: unknown): StremioLibraryItemDto | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as JsonObject;
  const providerState =
    item.state && typeof item.state === "object" && !Array.isArray(item.state)
      ? (item.state as JsonObject)
      : {};
  const timesWatched = providerState.timesWatched;

  return {
    id: boundedString(item._id, 1024),
    type: boundedString(item.type, 50),
    removed: item.removed === true,
    revision: boundedString(item._mtime, 1024),
    state: {
      timesWatched:
        typeof timesWatched === "number" && Number.isFinite(timesWatched)
          ? timesWatched
          : undefined,
      lastWatched: boundedString(providerState.lastWatched, 128),
    },
  };
};

export const createStremioClient = ({
  fetchImpl = fetch,
  baseUrl = STREMIO_API_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  fetchImpl?: FetchImplementation;
  baseUrl?: string;
  timeoutMs?: number;
} = {}): StremioClient => {
  const request = async (
    endpoint: "login" | "logout" | "datastoreGet",
    body: JsonObject
  ) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      let payload: JsonObject;
      try {
        const parsed: unknown = await response.json();
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("invalid response shape");
        }
        payload = parsed as JsonObject;
      } catch {
        throw new StremioClientError(
          response.status >= 500 ? "provider_unavailable" : "provider_protocol_error"
        );
      }

      const providerCode = apiErrorCode(payload);
      if (providerCode !== undefined) {
        if (providerCode === 2 && endpoint === "login") {
          throw new StremioClientError("invalid_credentials");
        }
        if (providerCode === 1) throw new StremioClientError("invalid_session");
        throw new StremioClientError("provider_protocol_error");
      }
      if (!response.ok) {
        throw new StremioClientError(
          response.status >= 500 ? "provider_unavailable" : "provider_protocol_error"
        );
      }
      if (!("result" in payload)) throw new StremioClientError("provider_protocol_error");
      return payload.result;
    } catch (error) {
      if (error instanceof StremioClientError) throw error;
      throw new StremioClientError("network_error");
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    async login(email, password) {
      const result = await request("login", {
        type: "Login",
        email,
        password,
        facebook: false,
      });
      if (!result || typeof result !== "object" || Array.isArray(result)) {
        throw new StremioClientError("provider_protocol_error");
      }
      const authKey = (result as JsonObject).authKey;
      if (typeof authKey !== "string" || !authKey || Buffer.byteLength(authKey, "utf8") > 4096) {
        throw new StremioClientError("provider_protocol_error");
      }
      return { authKey };
    },

    async logout(authKey) {
      const result = await request("logout", { authKey });
      if (
        !result ||
        typeof result !== "object" ||
        Array.isArray(result) ||
        (result as JsonObject).success !== true
      ) {
        throw new StremioClientError("provider_protocol_error");
      }
      return { revoked: true };
    },

    async getLibrarySnapshot(authKey) {
      const result = await request("datastoreGet", {
        authKey,
        collection: "libraryItem",
        ids: [],
        all: true,
      });
      if (!Array.isArray(result) || result.length > 100_000) {
        throw new StremioClientError("provider_protocol_error");
      }
      return result
        .map(toLibraryItemDto)
        .filter((item): item is StremioLibraryItemDto => item !== null);
    },
  };
};

const stremioClient = createStremioClient();

export default stremioClient;
