import { ChatMessage } from "../store/useChatStore";
import { apiUrl } from "./apiClient";

const getAuthToken = () => localStorage.getItem("token");

/**
 * Send a message to the AI assistant with streaming response.
 * Uses fetch (not axios) because axios doesn't support ReadableStream well.
 * Calls onChunk for each streamed text fragment.
 */
export async function sendAssistantMessage(
  message: string,
  history: ChatMessage[],
  onChunk: (content: string) => void
): Promise<void> {
  const token = getAuthToken();

  const response = await fetch(apiUrl("/api/assistant/chat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, history }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.msg || `Request failed with status ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response stream available");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE events from the buffer
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.content) {
            onChunk(data.content);
          }
          if (data.error) {
            throw new Error(data.error);
          }
        } catch (e) {
          // Skip malformed JSON lines
          if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
            throw e;
          }
        }
      }
    }
  }
}
