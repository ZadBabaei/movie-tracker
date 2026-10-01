import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  StremioApiError,
  type StremioIntegration,
  type StremioSyncResult,
} from "../api/integrationsApi";
import StremioHomeControl from "./StremioHomeControl";

const integrationApi = vi.hoisted(() => ({
  fetchIntegrations: vi.fn(),
  connectStremio: vi.fn(),
  syncStremio: vi.fn(),
  disconnectStremio: vi.fn(),
}));

vi.mock("../api/integrationsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/integrationsApi")>();
  return { ...actual, ...integrationApi };
});

const connected = (overrides: Partial<StremioIntegration> = {}): StremioIntegration => ({
  provider: "stremio",
  status: "connected",
  connected: true,
  lastSyncStartedAt: null,
  lastSyncCompletedAt: null,
  lastSuccessfulSyncAt: null,
  lastSyncStatus: null,
  lastErrorCode: null,
  ...overrides,
});

const syncResult: StremioSyncResult = {
  provider: "stremio",
  status: "success",
  snapshot: {
    snapshotItems: 7,
    movieStates: 7,
    ignoredItems: 0,
    observed: 7,
    upserted: 2,
    matched: 5,
    modified: 2,
  },
  matching: {
    examined: 3,
    matched: 2,
    movieMissing: 1,
    unsupported: 0,
    retryableErrors: 0,
    skippedStale: 0,
  },
  import: {
    examined: 2,
    imported: 2,
    alreadyImported: 0,
    timestampUnavailable: 0,
    invalidMatch: 0,
    skippedStale: 0,
  },
};

describe("Stremio Home control", () => {
  let storedValues: Map<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    storedValues = new Map([["token", "movie-tracker-token"]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storedValues.get(key) ?? null,
      setItem: (key: string, value: string) => storedValues.set(key, value),
      removeItem: (key: string) => storedValues.delete(key),
      clear: () => storedValues.clear(),
    });
    integrationApi.fetchIntegrations.mockResolvedValue([]);
    integrationApi.connectStremio.mockResolvedValue(connected());
    integrationApi.syncStremio.mockResolvedValue(syncResult);
    integrationApi.disconnectStremio.mockResolvedValue(undefined);
  });

  test("connects from a password-safe modal and prevents duplicate submissions", async () => {
    let resolveConnect: (value: StremioIntegration) => void = () => undefined;
    integrationApi.connectStremio.mockReturnValue(new Promise((resolve) => {
      resolveConnect = resolve;
    }));
    render(<StremioHomeControl />);

    fireEvent.click(await screen.findByRole("button", { name: "Connect Stremio" }));
    const email = screen.getByLabelText("Stremio email");
    const password = screen.getByLabelText("Stremio password");
    expect(password).toHaveAttribute("type", "password");

    fireEvent.change(email, { target: { value: "viewer@example.com" } });
    fireEvent.change(password, { target: { value: "never-store-this" } });
    const submit = screen.getByRole("button", { name: "Connect account" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(integrationApi.connectStremio).toHaveBeenCalledTimes(1);
    expect(integrationApi.connectStremio).toHaveBeenCalledWith("viewer@example.com", "never-store-this");

    resolveConnect(connected());
    expect(await screen.findByRole("button", { name: "SYNC" })).toBeEnabled();
    expect(screen.queryByDisplayValue("never-store-this")).not.toBeInTheDocument();
    expect(JSON.stringify([...storedValues.entries()])).not.toContain("viewer@example.com");
    expect(JSON.stringify([...storedValues.entries()])).not.toContain("never-store-this");
  });

  test("syncs once, refreshes Home data, reports outcomes, and displays the successful timestamp", async () => {
    const latest = connected({ lastSuccessfulSyncAt: "2026-09-17T14:30:00.000Z", lastSyncStatus: "success" });
    integrationApi.fetchIntegrations.mockResolvedValue([latest]);
    const onSyncComplete = vi.fn().mockResolvedValue(undefined);
    render(<StremioHomeControl onSyncComplete={onSyncComplete} />);

    const syncButton = await screen.findByRole("button", { name: "SYNC" });
    fireEvent.click(syncButton);
    fireEvent.click(syncButton);

    expect(await screen.findByText("2 imported · 2 matched · 1 need attention")).toBeInTheDocument();
    expect(integrationApi.syncStremio).toHaveBeenCalledTimes(1);
    expect(onSyncComplete).toHaveBeenCalledTimes(1);
    const timestamp = screen.getByText((content, element) => element?.tagName === "TIME" && content.length > 0);
    expect(timestamp).toHaveAttribute("datetime", "2026-09-17T14:30:00.000Z");
  });

  test("shows useful provider errors without echoing submitted secrets or clearing app auth", async () => {
    integrationApi.connectStremio.mockRejectedValue(new StremioApiError("invalid_credentials"));
    render(<StremioHomeControl />);

    fireEvent.click(await screen.findByRole("button", { name: "Connect Stremio" }));
    fireEvent.change(screen.getByLabelText("Stremio email"), { target: { value: "viewer@example.com" } });
    fireEvent.change(screen.getByLabelText("Stremio password"), { target: { value: "private-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That Stremio email or password was not accepted.");
    expect(screen.queryByText("private-password")).not.toBeInTheDocument();
    expect(localStorage.getItem("token")).toBe("movie-tracker-token");
  });

  test("turns an expired provider session into a clear reconnect path", async () => {
    integrationApi.fetchIntegrations.mockResolvedValue([
      connected({ status: "reauth_required", connected: false, lastErrorCode: "provider_session_invalid" }),
    ]);
    render(<StremioHomeControl />);

    expect(await screen.findByText("Reconnect the signal.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reconnect Stremio" }));
    expect(screen.getByRole("heading", { name: "Reconnect Stremio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect account" })).toBeInTheDocument();
  });

  test("refreshes into reauthentication when a sync reports an expired session", async () => {
    integrationApi.fetchIntegrations
      .mockResolvedValueOnce([connected()])
      .mockResolvedValueOnce([
        connected({ status: "reauth_required", connected: false, lastErrorCode: "provider_session_invalid" }),
      ]);
    integrationApi.syncStremio.mockRejectedValue(new StremioApiError("stremio_reauth_required"));
    render(<StremioHomeControl />);

    fireEvent.click(await screen.findByRole("button", { name: "SYNC" }));
    expect(await screen.findByRole("button", { name: "Reconnect Stremio" })).toBeInTheDocument();
    expect(integrationApi.fetchIntegrations).toHaveBeenCalledTimes(2);
  });

  test("requires confirmation before disconnecting and returns to the connect state", async () => {
    integrationApi.fetchIntegrations.mockResolvedValue([connected()]);
    render(<StremioHomeControl />);

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    expect(screen.getByRole("heading", { name: "Disconnect Stremio?" })).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "Disconnect Stremio?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));

    await waitFor(() => expect(integrationApi.disconnectStremio).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: "Connect Stremio" })).toBeInTheDocument();
  });

  test("keeps the connection intact and explains a disconnect failure", async () => {
    integrationApi.fetchIntegrations.mockResolvedValue([connected()]);
    integrationApi.disconnectStremio.mockRejectedValue(new StremioApiError("request_failed"));
    render(<StremioHomeControl />);

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    const dialog = screen.getByRole("dialog", { name: "Disconnect Stremio?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Stremio could not be disconnected.");
    expect(screen.getByRole("button", { name: "SYNC" })).toBeInTheDocument();
  });

  test("keeps sync failures actionable and provider-safe", async () => {
    integrationApi.fetchIntegrations.mockResolvedValue([connected()]);
    integrationApi.syncStremio.mockRejectedValue(new StremioApiError("stremio_provider_unavailable"));
    render(<StremioHomeControl />);

    fireEvent.click(await screen.findByRole("button", { name: "SYNC" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Stremio is unavailable right now.");
    expect(screen.getByRole("button", { name: "SYNC" })).toBeEnabled();
  });
});
