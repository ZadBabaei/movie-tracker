import { beforeEach, describe, expect, test, vi } from "vitest";
import apiClient from "./apiClient";
import {
  connectStremio,
  disconnectStremio,
  fetchIntegrationOverview,
  fetchIntegrations,
  StremioApiError,
  syncStremio,
} from "./integrationsApi";

vi.mock("./apiClient", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedClient = vi.mocked(apiClient);

describe("Stremio integration API", () => {
  beforeEach(() => {
    const values = new Map<string, string>([["token", "movie-tracker-token"]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
    vi.clearAllMocks();
  });

  test("uses the authenticated integration endpoints without exposing credentials in configuration", async () => {
    mockedClient.get.mockResolvedValueOnce({ data: { integrations: [] } });
    mockedClient.post
      .mockResolvedValueOnce({ data: { integration: { provider: "stremio", status: "connected", connected: true } } })
      .mockResolvedValueOnce({ data: { provider: "stremio", status: "success" } });
    mockedClient.delete.mockResolvedValueOnce({ data: { status: "disconnected" } });

    await fetchIntegrations();
    await connectStremio("viewer@example.com", "secret-value");
    await syncStremio();
    await disconnectStremio();

    expect(mockedClient.get).toHaveBeenCalledWith(
      "/api/integrations",
      expect.objectContaining({ skipAuthRedirect: true })
    );
    expect(mockedClient.post).toHaveBeenNthCalledWith(
      1,
      "/api/integrations/stremio/connect",
      { email: "viewer@example.com", password: "secret-value" },
      expect.objectContaining({ skipAuthRedirect: true })
    );
    expect(mockedClient.post).toHaveBeenNthCalledWith(
      2,
      "/api/integrations/stremio/sync",
      undefined,
      expect.objectContaining({ skipAuthRedirect: true })
    );
    expect(mockedClient.delete).toHaveBeenCalledWith(
      "/api/integrations/stremio",
      expect.objectContaining({ skipAuthRedirect: true })
    );
    expect(JSON.stringify(mockedClient.get.mock.calls)).not.toContain("secret-value");
  });

  test("reads the automatic sync schedule and tolerates a server without one", async () => {
    mockedClient.get
      .mockResolvedValueOnce({
        data: {
          integrations: [],
          autoSync: { enabled: true, timezone: "America/Toronto", nextRunAt: "2026-11-19T10:00:00.000Z" },
        },
      })
      .mockResolvedValueOnce({ data: { integrations: [] } });

    await expect(fetchIntegrationOverview()).resolves.toEqual({
      integrations: [],
      autoSync: { enabled: true, timezone: "America/Toronto", nextRunAt: "2026-11-19T10:00:00.000Z" },
    });
    await expect(fetchIntegrationOverview()).resolves.toEqual({ integrations: [], autoSync: null });
  });

  test("maps an in-progress sync to its own error code", async () => {
    mockedClient.post.mockRejectedValueOnce(
      Object.assign(new Error("conflict"), {
        isAxiosError: true,
        response: { status: 409, data: { code: "stremio_sync_in_progress" } },
      })
    );
    await expect(syncStremio()).rejects.toEqual(new StremioApiError("stremio_sync_in_progress"));
  });
});
