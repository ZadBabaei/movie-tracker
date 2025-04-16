import React from "react";
import { useMessageContext } from "stream-chat-react";

const CustomMessage = ({ currentUserId }) => {
  const { message } = useMessageContext();
  const isMyMessage = message.user?.id === currentUserId;

  return (
    <div className={`message-row ${isMyMessage ? "mine" : "theirs"}`}>
      {!isMyMessage && (
        <img
          src={message.user?.image || "/default-avatar.png"}
          alt={message.user?.name}
          className="chat-avatar"
        />
      )}
      <div className="message-bubble">
        {message.deleted_at ? (
          <i>This message was deleted...</i>
        ) : (
          <span>{message.text}</span>
        )}
      </div>
    </div>
  );
};

export default CustomMessage;
