import { create } from "zustand";
import axios from "axios";

export interface Group {
  _id: string;
  name: string;
  members: string[];
}

interface GroupState {
  groupList: Group[];
  createdGroupId: string | null;
  pendingGroupName: string;
  isInviteFriendsModalOpen: boolean;

  setPendingGroupName: (name: string) => void;
  openInviteFriendsModal: (groupId?: string | null) => void;
  closeInviteFriendsModal: () => void;
  fetchGroups: () => Promise<void>;
  createGroup: (name: string) => Promise<Group>;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groupList: [],
  createdGroupId: null,
  pendingGroupName: "",
  isInviteFriendsModalOpen: false,

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
      const res = await axios.get("/api/groups/mine", {
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

    const res = await axios.post(
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
}));
