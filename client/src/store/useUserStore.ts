import { create } from "zustand";
import axios from "axios";

export interface UserProfile {
  _id: string;
  name: string;
  email: string;
  avatar: string;
  firstLogin: boolean;
  createdAt?: string;
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
  user: UserProfile;
  stats: UserStats;
  recentActivity: RecentActivity[];
}

interface UserState {
  profile: UserProfile | null;
  stats: UserStats | null;
  recentActivity: RecentActivity[];
  loading: boolean;

  fetchProfile: () => Promise<UserProfile | null>;
  fetchDashboard: () => Promise<ProfileDashboard | null>;
  updateProfile: (data: { name?: string; email?: string }) => Promise<void>;
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

export const useUserStore = create<UserState>((set) => ({
  profile: null,
  stats: null,
  recentActivity: [],
  loading: false,

  setProfile: (profile) => set({ profile }),

  fetchProfile: async () => {
    try {
      set({ loading: true });
      const res = await axios.get("/api/profile", authHeader());
      set({ profile: res.data, loading: false });
      return res.data;
    } catch {
      set({ profile: null, loading: false });
      return null;
    }
  },

  fetchDashboard: async () => {
    try {
      set({ loading: true });
      const res = await axios.get("/api/profile/dashboard", authHeader());
      set({
        profile: res.data.user,
        stats: res.data.stats,
        recentActivity: res.data.recentActivity || [],
        loading: false,
      });
      return res.data;
    } catch {
      set({ profile: null, stats: null, recentActivity: [], loading: false });
      return null;
    }
  },

  updateProfile: async (data) => {
    const res = await axios.put("/api/profile", data, authHeader());
    set({ profile: res.data });
  },

  uploadAvatar: async (file: File) => {
    const formData = new FormData();
    formData.append("avatar", file);
    const res = await axios.post("/api/profile/avatar", formData, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
        "Content-Type": "multipart/form-data",
      },
    });
    set({ profile: res.data.user });
  },

  removeAvatar: async () => {
    const res = await axios.delete("/api/profile/avatar", authHeader());
    set({ profile: res.data.user });
  },

  fetchStats: async () => {
    try {
      const res = await axios.get("/api/profile/stats", authHeader());
      set({ stats: res.data });
    } catch {
      set({ stats: null });
    }
  },

  completeOnboarding: async () => {
    try {
      const res = await axios.post("/api/profile/complete-onboarding", {}, authHeader());
      set({ profile: res.data.user });
    } catch (err) {
      console.error("Failed to complete onboarding:", err);
    }
  },

  clear: () => set({ profile: null, stats: null, recentActivity: [] }),
}));
