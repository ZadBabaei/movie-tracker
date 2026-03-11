import { create } from "zustand";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatState {
  isOpen: boolean;
  messages: ChatMessage[];
  isLoading: boolean;

  toggleChat: () => void;
  openChat: () => void;
  closeChat: () => void;
  addMessage: (msg: ChatMessage) => void;
  appendToLastMessage: (content: string) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  isOpen: false,
  messages: [],
  isLoading: false,

  toggleChat: () => set((state) => ({ isOpen: !state.isOpen })),
  openChat: () => set({ isOpen: true }),
  closeChat: () => set({ isOpen: false }),

  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  // Used for streaming — appends content to the last assistant message
  appendToLastMessage: (content) =>
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === "assistant") {
        messages[messages.length - 1] = {
          ...last,
          content: last.content + content,
        };
      }
      return { messages };
    }),

  setLoading: (loading) => set({ isLoading: loading }),
  clearMessages: () => set({ messages: [] }),
}));
