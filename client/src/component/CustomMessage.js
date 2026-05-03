import React from "react";
import { useMessageContext } from "stream-chat-react";
import { getDefaultAvatarUrl } from "../utils/avatar";

const URL_REGEX = /(https?:\/\/[^\s<>"']+)/g;

const sanitizeUrl = (url) => {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const LinkifiedText = ({ text }) => {
  if (!text) return null;

  return text.split(URL_REGEX).map((part, index) => {
    const safeUrl = sanitizeUrl(part);
    if (!safeUrl) return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;

    return (
      <a
        key={`${safeUrl}-${index}`}
        href={safeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="message-link"
      >
        {part}
      </a>
    );
  });
};

const LinkPreviewCard = ({ preview }) => {
  if (!preview?.url) return null;

  const safeUrl = sanitizeUrl(preview.url);
  if (!safeUrl) return null;

  return (
    <a
      href={safeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="link-preview-card"
    >
      {preview.image && (
        <img src={preview.image} alt="" className="link-preview-image" />
      )}
      <div className="link-preview-content">
        <span className="link-preview-domain">{preview.domain}</span>
        <strong>{preview.title}</strong>
        {preview.description && <p>{preview.description}</p>}
      </div>
    </a>
  );
};

const ReplyPreview = ({ replyTo }) => {
  if (!replyTo) return null;

  return (
    <div className="message-reply-preview">
      <span>{replyTo.userName || "Unknown"}</span>
      <p>{replyTo.text || "Message"}</p>
    </div>
  );
};

const CustomMessage = ({ currentUserId, onReply }) => {
  const { message } = useMessageContext();
  const isMyMessage = message.user?.id === currentUserId;
  const senderName = message.user?.name || "User";

  return (
    <div className={`message-row ${isMyMessage ? "mine" : "theirs"}`}>
      {!isMyMessage && (
        <img
          src={message.user?.image || getDefaultAvatarUrl({ name: senderName })}
          alt={senderName}
          className="chat-avatar"
          onError={(event) => {
            event.currentTarget.src = getDefaultAvatarUrl({ name: senderName });
          }}
        />
      )}
      <div className="message-bubble">
        {message.deleted_at ? (
          <i>This message was deleted...</i>
        ) : (
          <>
            <ReplyPreview replyTo={message.replyTo} />
            <span className="message-text">
              <LinkifiedText text={message.text} />
            </span>
            <LinkPreviewCard preview={message.linkPreview} />
            <button
              type="button"
              className="message-reply-button"
              onClick={() => onReply(message)}
            >
              Reply
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default CustomMessage;
