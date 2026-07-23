import { create } from "zustand";

export type VoteModalMode = "create" | "view";

interface ModalState {
  isGroupsModalOpen: boolean;
  isGroupNameModalOpen: boolean;
  isVoteModalOpen: boolean;
  voteModalMode: VoteModalMode;

  openGroupsModal: () => void;
  closeGroupsModal: () => void;
  openGroupNameModal: () => void;
  closeGroupNameModal: () => void;
  openVoteModal: (mode?: VoteModalMode) => void;
  closeVoteModal: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  isGroupsModalOpen: false,
  isGroupNameModalOpen: false,
  isVoteModalOpen: false,
  voteModalMode: "create",

  openGroupsModal: () => set({ isGroupsModalOpen: true }),
  closeGroupsModal: () => set({ isGroupsModalOpen: false }),
  openGroupNameModal: () => set({ isGroupNameModalOpen: true }),
  closeGroupNameModal: () => set({ isGroupNameModalOpen: false }),
  openVoteModal: (mode = "create") => set({ isVoteModalOpen: true, voteModalMode: mode }),
  closeVoteModal: () => set({ isVoteModalOpen: false }),
}));
