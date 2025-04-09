import React, { useEffect, useState } from "react";
import {
  Chat,
  Channel,
  MessageInput,
  MessageList,
  Window,
  LoadingIndicator,
} from "stream-chat-react";
import { StreamChat } from "stream-chat";
import "stream-chat-react/dist/css/v2/index.css";
import axios from "axios";
import "./ChatBox.css";

const ChatBox = ({ groupId }) => {
  const [chatClient, setChatClient] = useState(null);
  const [channel, setChannel] = useState(null);

useEffect(() => {
  const initChat = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await axios.post(
        "/api/chat/token",
        { groupId },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const { token: chatToken, apiKey, userId, name, groupMembers } = res.data;

      const client = new StreamChat(apiKey); // ✅ fresh instance

      await client.connectUser({ id: userId, name }, chatToken);

      const channel = client.channel("messaging", `group-${groupId}`, {
        name: `Group ${groupId}`,
        members: groupMembers,
      });

      await channel.watch();

      setChatClient(client);
      setChannel(channel);
    } catch (error) {
      console.error("Stream Chat setup failed:", error);
    }
  };

  initChat();

  return () => {
    if (chatClient) {
      chatClient.disconnectUser();
      setChatClient(null);
    }
  };
}, [groupId]);

  if (!chatClient || !channel) return <LoadingIndicator />;

  return (
    <div className="custom-chat-container">
      <Chat client={chatClient} theme="messaging dark">
        <Channel channel={channel}>
          <Window>
            <MessageList className="custom-message-list" />
            <MessageInput className="custom-message-input" />
          </Window>
        </Channel>
      </Chat>
    </div>
  );
};

export default ChatBox;
