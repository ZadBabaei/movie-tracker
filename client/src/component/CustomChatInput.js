import React, { useMemo, useState } from "react";
import axios from "axios";
import { useChannelActionContext } from "stream-chat-react";

const EMOJIS = ["😀", "😂", "😍", "😎", "😭", "😅", "👏", "🔥", "❤️", "🍿", "🎬", "⭐"];
const URL_REGEX = /https?:\/\/[^\s<>"']+/i;

const getFirstUrl = (text) => {
  const match = text.match(URL_REGEX);
  if (!match) return null;

  try {
    const url = new URL(match[0]);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};

const buildReplyPayload = (message) => {
  if (!message) return undefined;

  return {
    id: message.id,
    text: message.text || "",
    userName: message.user?.name || "Unknown",
  };
};

const CustomChatInput = ({ replyTarget, onCancelReply }) => {
  const { sendMessage } = useChannelActionContext("CustomChatInput");
  const [text, setText] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const replyPreview = useMemo(() => {
    if (!replyTarget) return "";
    return replyTarget.text || "Message";
  }, [replyTarget]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const trimmedText = text.trim();
    if (!trimmedText || isSending) return;

    setIsSending(true);

    try {
      let linkPreview;
      const firstUrl = getFirstUrl(trimmedText);

      if (firstUrl) {
        try {
          const token = localStorage.getItem("token");
          const response = await axios.get("/api/chat/link-preview", {
            params: { url: firstUrl },
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            timeout: 7000,
          });
          linkPreview = response.data;
        } catch (error) {
          console.warn("Unable to load link preview:", error);
        }
      }

      await sendMessage(
        { text: trimmedText },
        {
          ...(linkPreview ? { linkPreview } : {}),
          ...(replyTarget ? { replyTo: buildReplyPayload(replyTarget) } : {}),
        }
      );

      setText("");
      setShowEmojiPicker(false);
      onCancelReply();
    } catch (error) {
      console.error("Failed to send chat message:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      handleSubmit(event);
    }
  };

  return (
    <form className="custom-chat-input" onSubmit={handleSubmit}>
      {replyTarget && (
        <div className="replying-banner">
          <div>
            <span className="replying-label">Replying to {replyTarget.user?.name || "Unknown"}</span>
            <span className="replying-text">{replyPreview}</span>
          </div>
          <button type="button" className="replying-cancel" onClick={onCancelReply}>
            x
          </button>
        </div>
      )}

      <div className="custom-chat-input-row">
        <div className="emoji-picker-wrap">
          <button
            type="button"
            className="emoji-toggle"
            onClick={() => setShowEmojiPicker((current) => !current)}
            aria-label="Add emoji"
          >
            ☺
          </button>
          {showEmojiPicker && (
            <div className="emoji-picker">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setText((current) => `${current}${emoji}`)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message"
          rows={1}
        />

        <button type="submit" className="custom-chat-send" disabled={!text.trim() || isSending}>
          Send
        </button>
      </div>
    </form>
  );
};

export default CustomChatInput;
