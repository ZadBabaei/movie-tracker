import { beforeEach, describe, expect, test, vi } from "vitest";
import apiClient from "./apiClient";
import {
  connectStremio,
  disconnectStremio,
  fetchIntegrations,
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
});
