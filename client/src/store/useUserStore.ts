import { create } from "zustand";
import apiClient, { isStaleSessionResponseError } from "../api/apiClient";
import { registerUserScopedReset } from "../auth/sessionScope";

export interface UserProfile {
  _id: string;
  name: string;
  email: string;
  avatar: string;
  firstLogin: boolean;
  username?: string | null;
  // Some existing account responses omit these owner-only settings.
  discoverable?: boolean;
  shareWatchHistory?: boolean;
  createdAt?: string;
  isAdmin?: boolean;
}

export interface UserStats {
  groupsJoined: number;
  moviesWatched: number;
  pollsVoted: number;
  pollsCreated: number;
}

export interface RecentActivity {
  id: string;
  type: "watchlist" | "group" | "poll-vote" | "poll-created" | "profile";
  title: string;
  description: string;
  createdAt: string;
  icon?: string;
}

export interface ProfileDashboard {
  user: Omit<UserProfile, "username" | "discoverable" | "shareWatchHistory">;
  stats: UserStats;
  recentActivity: RecentActivity[];
}

export interface ProfileUpdate {
  name?: string;
  email?: string;
  username?: string | null;
  discoverable?: boolean;
  shareWatchHistory?: boolean;
}

interface UserState {
  profile: UserProfile | null;
  stats: UserStats | null;
  recentActivity: RecentActivity[];
  loading: boolean;

  fetchProfile: () => Promise<UserProfile | null>;
  fetchDashboard: () => Promise<ProfileDashboard | null>;
  updateProfile: (data: ProfileUpdate) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  removeAvatar: () => Promise<void>;
  fetchStats: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  setProfile: (profile: UserProfile | null) => void;
  clear: () => void;
}

const authHeader = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
});

// Partial responses preserve omitted fields only for the same account. Explicit
// null/false values still apply, and another account never inherits preferences.
const mergeProfile = (current: UserProfile | null, incoming: UserProfile): UserProfile =>
  current?._id === incoming._id ? { ...current, ...incoming } : incoming;

export const useUserStore = create<UserState>((set) => ({
  profile: null,
  stats: null,
  recentActivity: [],
  loading: false,

  setProfile: (profile) => set((state) => ({
    profile: profile ? mergeProfile(state.profile, profile) : null,
  })),

  fetchProfile: async () => {
    try {
      set({ loading: true });
      const res = await apiClient.get("/api/profile", authHeader());
      set((state) => ({ profile: mergeProfile(state.profile, res.data), loading: false }));
      return res.data;
    } catch (error) {
      if (isStaleSessionResponseError(error)) return null;
      set({ profile: null, loading: false });
      return null;
    }
  },

  fetchDashboard: async () => {
    try {
      set({ loading: true });
      // Dashboard deliberately omits settings. Load the owner's profile rather
      // than interpreting omitted fields as a privacy preference.
      const [res, owner] = await Promise.all([
        apiClient.get<ProfileDashboard>("/api/profile/dashboard", authHeader()),
        apiClient.get<UserProfile>("/api/profile", authHeader()),
      ]);
      set((state) => ({
        profile: mergeProfile(state.profile, { ...res.data.user, ...owner.data }),
        stats: res.data.stats,
        recentActivity: res.data.recentActivity || [],
        loading: false,
      }));
      return res.data;
    } catch (error) {
      if (isStaleSessionResponseError(error)) return null;
      set({ profile: null, stats: null, recentActivity: [], loading: false });
      return null;
    }
  },

  updateProfile: async (data) => {
    const res = await apiClient.put("/api/profile", data, authHeader());
    set((state) => ({ profile: mergeProfile(state.profile, res.data) }));
  },

  uploadAvatar: async (file: File) => {
    const formData = new FormData();
    formData.append("avatar", file);
    const res = await apiClient.post("/api/profile/avatar", formData, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
        "Content-Type": "multipart/form-data",
      },
    });
    set((state) => ({ profile: mergeProfile(state.profile, res.data.user) }));
  },

  removeAvatar: async () => {
    const res = await apiClient.delete("/api/profile/avatar", authHeader());
    set((state) => ({ profile: mergeProfile(state.profile, res.data.user) }));
  },

  fetchStats: async () => {
    try {
      const res = await apiClient.get("/api/profile/stats", authHeader());
      set({ stats: res.data });
    } catch (error) {
      if (isStaleSessionResponseError(error)) return;
      set({ stats: null });
    }
  },

  completeOnboarding: async () => {
    try {
      const res = await apiClient.post("/api/profile/complete-onboarding", {}, authHeader());
      set((state) => ({ profile: mergeProfile(state.profile, res.data.user) }));
    } catch (err) {
      if (isStaleSessionResponseError(err)) return;
      console.error("Failed to complete onboarding:", err);
    }
  },

  clear: () => set({ profile: null, stats: null, recentActivity: [] }),
}));

registerUserScopedReset(() => useUserStore.setState({
  profile: null,
  stats: null,
  recentActivity: [],
  loading: false,
}));
