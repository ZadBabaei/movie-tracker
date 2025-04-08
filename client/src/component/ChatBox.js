import React, { useEffect, useState } from "react";
import {
  Chat,
  Channel,
  ChannelHeader,
  MessageInput,
  MessageList,
  Window,
  Thread,
  LoadingIndicator,
} from "stream-chat-react";
import { StreamChat } from "stream-chat";
import "stream-chat-react/dist/css/v2/index.css";
import axios from "axios";

const ChatBox = () => {
  const [chatClient, setChatClient] = useState(null);
  const [channel, setChannel] = useState(null);

  useEffect(() => {
    const initChat = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        // Get chat token from backend
        const res = await axios.post(
          "http://localhost:5000/api/chat/token",
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

          const { token: chatToken, apiKey, userId, name } = res.data;
console.log(res.data);

        const client = StreamChat.getInstance(apiKey);

        await client.connectUser(
          {
            id: userId,
            name: name,
          },
          chatToken
        );

        // Join or create a group channel
        const channel = client.channel("messaging", "movie-tracker-group", {
          name: "Movie Tracker Group",
          members: [userId],
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
      if (chatClient) chatClient.disconnectUser();
    };
  }, []);

  if (!chatClient || !channel) return <LoadingIndicator />;

  return (
    <Chat client={chatClient} theme="messaging light">
      <Channel channel={channel}>
        <Window>
          <ChannelHeader />
          <MessageList />
          <MessageInput />
        </Window>
        <Thread />
      </Channel>
    </Chat>
  );
};

export default ChatBox;