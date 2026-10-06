import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AxiosError } from "axios";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import Profile from "./Profile";
import { ProfileUpdate, UserProfile, useUserStore } from "../store/useUserStore";

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock("../api/apiClient", () => ({ default: api, isStaleSessionResponseError: () => false }));
vi.mock("../component/VerticalNavbar", () => ({ default: () => <nav aria-label="Main navigation" /> }));

let owner: UserProfile;
const responseError = (status: number, msg: string) => Object.assign(new AxiosError("Request failed"), {
  response: { status, data: { msg } },
});

describe("partial profile response safety", () => {
  const flows = ["fetchProfile", "fetchDashboard", "updateProfile", "uploadAvatar", "removeAvatar", "completeOnboarding", "setProfile"] as const;
  type Flow = typeof flows[number];

  const applyResponse = async (flow: Flow, response: UserProfile) => {
    api.get.mockImplementation(async (path: string) => ({ data: path === "/api/profile/dashboard"
      ? { user: response, stats: {}, recentActivity: [] }
      : response }));
    api.put.mockResolvedValue({ data: response });
    api.post.mockResolvedValue({ data: { user: response } });
    api.delete.mockResolvedValue({ data: { user: response } });
    const store = useUserStore.getState();
    switch (flow) {
      case "fetchProfile": await store.fetchProfile(); break;
      case "fetchDashboard": await store.fetchDashboard(); break;
      case "updateProfile": await store.updateProfile({ name: response.name }); break;
      case "uploadAvatar": await store.uploadAvatar(new File(["photo"], "photo.png", { type: "image/png" })); break;
      case "removeAvatar": await store.removeAvatar(); break;
      case "completeOnboarding": await store.completeOnboarding(); break;
      case "setProfile": store.setProfile(response); break;
    }
  };

  test.each(flows)("%s preserves omitted settings and applies only explicit changes", async (flow) => {
    useUserStore.setState({ profile: { ...owner, discoverable: true, shareWatchHistory: true } });
    const { username, discoverable: omittedDiscoverability, shareWatchHistory, ...partial } = owner;
    await applyResponse(flow, { ...partial, name: "Updated name" });
    expect(useUserStore.getState().profile).toMatchObject({
      name: "Updated name", username: "zad", discoverable: true, shareWatchHistory: true,
    });
    await applyResponse(flow, { ...partial, username: "new_name" });
    expect(useUserStore.getState().profile).toMatchObject({ username: "new_name", discoverable: true, shareWatchHistory: true });
    await applyResponse(flow, { ...partial, username: null });
    expect(useUserStore.getState().profile).toMatchObject({ username: null, discoverable: true, shareWatchHistory: true });
    await applyResponse(flow, { ...partial, discoverable: false });
    expect(useUserStore.getState().profile).toMatchObject({ username: null, discoverable: false, shareWatchHistory: true });
    await applyResponse(flow, { ...partial, shareWatchHistory: false });
    expect(useUserStore.getState().profile).toMatchObject({ username: null, discoverable: false, shareWatchHistory: false });
  });

  test.each(flows)("%s never carries settings into a different account", async (flow) => {
    useUserStore.setState({ profile: { ...owner, discoverable: true, shareWatchHistory: true } });
    const { username, discoverable: omittedDiscoverability, shareWatchHistory, ...partial } = owner;
    await applyResponse(flow, { ...partial, _id: "other-account" });
    const profile = useUserStore.getState().profile;
    expect(profile._id).toBe("other-account");
    expect(profile).not.toHaveProperty("username");
    expect(profile).not.toHaveProperty("discoverable");
    expect(profile).not.toHaveProperty("shareWatchHistory");
  });

  test("explicit clearing and session resets still discard the profile", () => {
    useUserStore.setState({ profile: owner });
    useUserStore.getState().setProfile(null);
    expect(useUserStore.getState().profile).toBeNull();
    useUserStore.setState({ profile: owner });
    useUserStore.getState().clear();
    expect(useUserStore.getState().profile).toBeNull();
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  owner = {
    _id: "owner", name: "Zad", email: "owner@example.com", avatar: "", firstLogin: false,
    username: "zad", discoverable: false, shareWatchHistory: false,
  };
  useUserStore.setState({ profile: null, stats: null, recentActivity: [], loading: false });
  vi.stubGlobal("localStorage", {
    getItem: () => "owner-token", setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(),
  });
  api.get.mockImplementation(async (path: string) => {
    if (path === "/api/profile") return { data: { ...owner } };
    if (path === "/api/profile/dashboard") {
      // The real dashboard intentionally omits the Phase 1 fields.
      const { username, discoverable, shareWatchHistory, ...user } = owner;
      return { data: { user, stats: { groupsJoined: 2, moviesWatched: 7, pollsVoted: 3, pollsCreated: 1 }, recentActivity: [
        { id: "activity", type: "profile", title: "Created your profile", description: "Started tracking movie nights", createdAt: "2026-10-05" },
      ] } };
    }
    throw new Error(`Unexpected GET ${path}`);
  });
  api.put.mockImplementation(async (_path: string, data: ProfileUpdate) => {
    owner = { ...owner, ...data };
    if (typeof data.username === "string") owner.username = data.username.trim().toLowerCase() || null;
    return { data: { ...owner } };
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const openProfile = async () => {
  render(<MemoryRouter><Profile /></MemoryRouter>);
  await screen.findByRole("heading", { name: "Profile & Sharing" });
  return screen.getByRole("textbox", { name: "Username" });
};
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
const saved = () => screen.findByText("Profile & Sharing settings saved.");
const discoverability = () => screen.getByRole("checkbox", { name: "Allow other Movie Tracker users to find me" });
const sharedHistory = () => screen.getByRole("checkbox", { name: "Share my watch history" });

describe("Profile & Sharing", () => {
  test("waits for owner settings instead of displaying guessed preferences from a session profile", async () => {
    const { username, discoverable: ignoredDiscoverability, shareWatchHistory, ...sessionProfile } = owner;
    useUserStore.setState({ profile: sessionProfile });
    const originalGet = api.get.getMockImplementation();
    let resolve: (response: { data: UserProfile }) => void;
    api.get.mockImplementation((path: string) => path === "/api/profile"
      ? new Promise(done => { resolve = done; })
      : originalGet(path));
    render(<MemoryRouter><Profile /></MemoryRouter>);
    expect(screen.getByText("Loading profile settings…")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await act(async () => resolve({ data: { ...owner, discoverable: true } }));
    expect(discoverability()).toBeChecked();
  });

  test("loads the existing username and server preferences alongside dashboard content", async () => {
    owner.discoverable = true;
    owner.shareWatchHistory = true;
    expect(await openProfile()).toHaveValue("zad");
    expect(discoverability()).toBeChecked();
    expect(sharedHistory()).toBeChecked();
    expect(screen.getByText("Groups joined: 2")).toBeInTheDocument();
    expect(screen.getByText("Created your profile")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/api/profile", { headers: { Authorization: "Bearer owner-token" } });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  test("no username disables discoverability while history remains independent", async () => {
    owner.username = null;
    expect(await openProfile()).toHaveValue("");
    expect(discoverability()).not.toBeChecked();
    expect(discoverability()).toBeDisabled();
    expect(screen.getByText(/Choose a username first/)).toBeInTheDocument();
    fireEvent.click(sharedHistory());
    save();
    await saved();
    expect(api.put).toHaveBeenCalledWith("/api/profile", { shareWatchHistory: true }, expect.anything());
    expect(discoverability()).toBeDisabled();
  });

  test("sets a username without opting into sharing; @ is display-only", async () => {
    owner.username = null;
    const input = await openProfile();
    expect(screen.getByText("@")).toHaveAttribute("aria-hidden", "true");
    fireEvent.change(input, { target: { value: " Zad.Movie " } });
    expect(discoverability()).toBeDisabled();
    save();
    await saved();
    expect(api.put).toHaveBeenCalledWith("/api/profile", { username: "Zad.Movie" }, expect.anything());
    expect(input).toHaveValue("zad.movie");
    expect(discoverability()).toBeEnabled();
    expect(discoverability()).not.toBeChecked();
    expect(sharedHistory()).not.toBeChecked();
  });

  test("changes a username and retains the saved value after refetch", async () => {
    const input = await openProfile();
    fireEvent.change(input, { target: { value: "zad_01" } });
    save();
    await saved();
    expect(api.put).toHaveBeenCalledWith("/api/profile", { username: "zad_01" }, expect.anything());
    await act(() => useUserStore.getState().fetchDashboard());
    expect(input).toHaveValue("zad_01");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  test("removes a username with null and focuses the empty field", async () => {
    const input = await openProfile();
    fireEvent.click(screen.getByRole("button", { name: "Remove username" }));
    expect(input).toHaveFocus();
    expect(api.put).not.toHaveBeenCalled();
    save();
    await saved();
    expect(api.put).toHaveBeenCalledWith("/api/profile", { username: null }, expect.anything());
    expect(input).toHaveValue("");
    expect(discoverability()).toBeDisabled();
  });

  test("clearing manually also removes a username without changing privacy preferences", async () => {
    owner.discoverable = true;
    owner.shareWatchHistory = true;
    const input = await openProfile();
    fireEvent.change(input, { target: { value: "   " } });
    save();
    await saved();
    expect(api.put).toHaveBeenCalledWith("/api/profile", { username: null }, expect.anything());
    expect(discoverability()).toBeChecked();
    expect(sharedHistory()).toBeChecked();
    // An existing opt-in can always be switched off even without a username.
    fireEvent.click(discoverability());
    save();
    await waitFor(() => expect(owner.discoverable).toBe(false));
  });

  test("toggles discoverability independently and supports keyboard control", async () => {
    await openProfile();
    const checkbox = discoverability();
    checkbox.focus();
    userEvent.keyboard(" ");
    expect(checkbox).toHaveFocus();
    save();
    await saved();
    expect(api.put).toHaveBeenCalledWith("/api/profile", { discoverable: true }, expect.anything());
    expect(sharedHistory()).not.toBeChecked();
    fireEvent.click(checkbox);
    save();
    await waitFor(() => expect(owner.discoverable).toBe(false));
  });

  test("toggles shared history without enabling discoverability", async () => {
    await openProfile();
    fireEvent.click(sharedHistory());
    save();
    await saved();
    expect(api.put).toHaveBeenCalledWith("/api/profile", { shareWatchHistory: true }, expect.anything());
    expect(discoverability()).not.toBeChecked();
    fireEvent.click(sharedHistory());
    save();
    await waitFor(() => expect(owner.shareWatchHistory).toBe(false));
  });

  test("409 announces the taken username and preserves entered settings", async () => {
    api.put.mockRejectedValue(responseError(409, "Username is already taken"));
    const input = await openProfile();
    fireEvent.change(input, { target: { value: "taken" } });
    fireEvent.click(sharedHistory());
    save();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That username is already taken.");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(input).toHaveValue("taken");
    expect(sharedHistory()).toBeChecked();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    expect(screen.queryByText(/settings saved/)).not.toBeInTheDocument();
  });

  test.each([
    ["ab", "Username must be between 3 and 30 characters"],
    ["a".repeat(31), "Username must be between 3 and 30 characters"],
    ["zad!", "Username may contain ASCII letters, numbers, underscores, and single periods between characters"],
    ["zad..movie", "Username may contain ASCII letters, numbers, underscores, and single periods between characters"],
    ["admin", "That username is reserved"],
    ["@zad", "Username must not contain @ or an email address"],
    ["zad@gmail.com", "Username must not contain @ or an email address"],
  ])("displays authoritative server validation for %s", async (value, message) => {
    api.put.mockRejectedValue(responseError(400, message));
    const input = await openProfile();
    fireEvent.change(input, { target: { value } });
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(input).toHaveValue(value);
  });

  test.each([responseError(500, "Internal private details"), responseError(503, "Index unavailable"), new Error("Network error")])("shows a safe retry message for server/network failure", async (error) => {
    api.put.mockRejectedValue(error);
    const input = await openProfile();
    fireEvent.change(input, { target: { value: "new_name" } });
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save your profile settings. Please try again.");
    expect(input).toHaveValue("new_name");
  });

  test("prevents duplicate submits and announces the pending save", async () => {
    let resolve: (response: { data: UserProfile }) => void;
    api.put.mockImplementation(() => new Promise(done => { resolve = done; }));
    const input = await openProfile();
    fireEvent.change(input, { target: { value: "pending" } });
    const form = screen.getByRole("form", { name: "Profile & Sharing" });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Saving changes…" })).toBeDisabled();
    expect(input).toBeDisabled();
    expect(form).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Saving your profile settings…")).toBeInTheDocument();
    await act(async () => resolve({ data: { ...owner, username: "pending" } }));
    await saved();
    expect(input).toHaveValue("pending");
  });

  test("existing identity editing still works and does not submit sharing fields", async () => {
    await openProfile();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: " Updated Zad " } });
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("heading", { level: 1, name: "Updated Zad" });
    expect(api.put).toHaveBeenCalledWith("/api/profile", { name: "Updated Zad", email: "new@example.com" }, expect.anything());
    expect(screen.getByRole("textbox", { name: "Username" })).toHaveValue("zad");
  });

  test("avatar responses preserve settings and unsaved username edits", async () => {
    owner.avatar = "https://example.com/photo.jpg";
    owner.discoverable = true;
    owner.shareWatchHistory = true;
    api.delete.mockImplementation(async () => {
      owner.avatar = "";
      const { username, discoverable, shareWatchHistory, ...user } = owner;
      return { data: { user } };
    });
    const input = await openProfile();
    fireEvent.change(input, { target: { value: "draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await screen.findByText("Photo removed");
    expect(input).toHaveValue("draft");
    expect(discoverability()).toBeChecked();
    expect(sharedHistory()).toBeChecked();
    expect(useUserStore.getState().profile.username).toBe("zad");
  });
});
