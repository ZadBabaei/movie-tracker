import { create } from "zustand";

interface ModalState {
  isGroupsModalOpen: boolean;
  isGroupNameModalOpen: boolean;
  isVoteModalOpen: boolean;

  openGroupsModal: () => void;
  closeGroupsModal: () => void;
  openGroupNameModal: () => void;
  closeGroupNameModal: () => void;
  openVoteModal: () => void;
  closeVoteModal: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  isGroupsModalOpen: false,
  isGroupNameModalOpen: false,
  isVoteModalOpen: false,

  openGroupsModal: () => set({ isGroupsModalOpen: true }),
  closeGroupsModal: () => set({ isGroupsModalOpen: false }),
  openGroupNameModal: () => set({ isGroupNameModalOpen: true }),
  closeGroupNameModal: () => set({ isGroupNameModalOpen: false }),
  openVoteModal: () => set({ isVoteModalOpen: true }),
  closeVoteModal: () => set({ isVoteModalOpen: false }),
}));
