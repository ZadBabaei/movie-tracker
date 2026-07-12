import { create } from "zustand";
import apiClient from "../api/apiClient";

export interface Group {
  _id: string;
  name: string;
  slug?: string;
  members: string[];
}

interface GroupState {
  groupList: Group[];
  createdGroupId: string | null;
  pendingGroupName: string;
  isInviteFriendsModalOpen: boolean;
  favoriteGroups: Group[];

  setPendingGroupName: (name: string) => void;
  openInviteFriendsModal: (groupId?: string | null) => void;
  closeInviteFriendsModal: () => void;
  fetchGroups: () => Promise<void>;
  createGroup: (name: string) => Promise<Group>;
  fetchFavoriteGroups: () => Promise<void>;
  toggleFavoriteGroup: (groupId: string) => Promise<boolean | null>;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groupList: [],
  createdGroupId: null,
  pendingGroupName: "",
  isInviteFriendsModalOpen: false,
  favoriteGroups: [],

  setPendingGroupName: (name) => set({ pendingGroupName: name }),

  openInviteFriendsModal: (groupId = null) =>
    set((state) => ({
      isInviteFriendsModalOpen: true,
      createdGroupId: groupId ?? state.createdGroupId,
    })),

  closeInviteFriendsModal: () => set({ isInviteFriendsModalOpen: false }),

  fetchGroups: async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await apiClient.get("/api/groups/mine", {
        headers: { Authorization: `Bearer ${token}` },
      });
      set({ groupList: res.data });
    } catch (err) {
      console.error("Failed to fetch groups:", err);
    }
  },

  createGroup: async (name: string): Promise<Group> => {
    const token = localStorage.getItem("token");
    if (!token || !name) throw new Error("Missing token or name");

    const res = await apiClient.post(
      "/api/groups/create",
      { groupName: name },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const newGroup: Group = res.data.group;
    set((state) => ({
      createdGroupId: newGroup._id,
      groupList: [...state.groupList, newGroup],
    }));
    return newGroup;
  },

  fetchFavoriteGroups: async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await apiClient.get("/api/groups/favorites/list", {
        headers: { Authorization: `Bearer ${token}` },
      });
      set({ favoriteGroups: res.data });
    } catch (err) {
      console.error("Failed to fetch favorite groups:", err);
    }
  },

  toggleFavoriteGroup: async (groupId: string): Promise<boolean | null> => {
    const token = localStorage.getItem("token");
    if (!token) return null;
    try {
      const res = await apiClient.post(
        `/api/groups/favorite/${groupId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Refresh favorite groups list
      await get().fetchFavoriteGroups();
      return res.data.favorited;
    } catch (err: any) {
      if (err.response?.status === 400) {
        return null; // max 2 limit reached
      }
      console.error("Failed to toggle favorite group:", err);
      return null;
    }
  },
}));
