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
import GroupChatSidbar from "./GroupChatSidbar";
import CustomMessage from "./CustomMessage";
import "./ChatBox.css";

const ChatBox = ({ groupId }) => {
  const [chatClient, setChatClient] = useState(null);
  const [channel, setChannel] = useState(null);
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [chatError, setChatError] = useState(null);

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

        const {
          token: chatToken,
          apiKey,
          userId,
          name,
          groupMembers,
        } = res.data;

        const client = new StreamChat(apiKey);
        await client.connectUser({ id: userId, name }, chatToken);

        const groupChannel = client.channel("messaging", `group-${groupId}`, {
          name: `Group ${groupId}`,
          members: groupMembers.map((m) => (m._id || m.id).toString()),
        });

        await groupChannel.watch();

        setChatClient(client);
        setChannel(groupChannel);
        setCurrentUserId(userId);
        setMembers(
          groupMembers
            .filter((m) => m._id !== userId)
            .map((m) => ({
              id: m._id || m.id,
              name: m.name || "Unknown",
              image:
                m.avatar ||
                `https://ui-avatars.com/api/?name=${m.name || "User"}`,
              online: false,
            }))
        );
      } catch (error) {
        console.error("Stream Chat setup failed:", error);
        setChatError("Failed to load chat. Please try again later.");
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

  const handleSelectMember = async (member) => {
    if (!chatClient || !member?.id || member.id === currentUserId) return;

    const dmChannel = chatClient.channel("messaging", {
      members: [currentUserId, member.id],
    });

    await dmChannel.watch();
    setChannel(dmChannel);
    setSelectedMember(member);
  };

  const handleBackToGroup = async () => {
    if (!chatClient) return;
    const groupChannel = chatClient.channel("messaging", `group-${groupId}`);
    await groupChannel.watch();
    setChannel(groupChannel);
    setSelectedMember(null);
  };

  if (chatError) return (
    <div className="empty-chat">
      <p style={{ color: "#ff6b6b", textAlign: "center", padding: "20px" }}>{chatError}</p>
    </div>
  );

  if (!chatClient || !channel) return <LoadingIndicator />;


const CustomEmptyState = () => (
  <div className="empty-chat">
    <img src="/chat-box.png" alt="Start chatting" className="empty-chat-icon" />
    <h3 className="empty-chat-title">No messages yet</h3>
    <p className="empty-chat-sub">
      Start the conversation and light up the room 💬
    </p>
  </div>
);



  return (
    <div className="custom-chat-container">
      <Chat client={chatClient} theme="messaging dark">
        <Channel channel={channel} EmptyStateIndicator={CustomEmptyState}>
          <div className="chat-layout">
            <GroupChatSidbar
              members={members}
              onSelectMember={handleSelectMember}
            />
            <Window>
              <div className="custom-chat-header">
                {selectedMember ? (
                  <>
                    <button onClick={handleBackToGroup} className="back-arrow">
                      ←
                    </button>

                    <img src={selectedMember.image} alt={selectedMember.name} />
                    <span>{selectedMember.name}</span>
                  </>
                ) : (
                  <>
                    <img src="/group-avatar.png" alt="Group" />
                    <span>Movie Circle</span>
                  </>
                )}
              </div>
              <MessageList
                EmptyStateIndicator={() => (
                  <div className="empty-chat">
                    <img
                      src="https://cdn-icons-png.flaticon.com/512/4712/4712027.png"
                      alt="Chat"
                    />
                    <p>Say hi 👋 to start the conversation...</p>
                  </div>
                )}
                Message={(props) => (
                  <CustomMessage {...props} currentUserId={currentUserId} />
                )}
                className="custom-message-list"
              />

              <MessageInput className="custom-message-input" />
            </Window>
          </div>
        </Channel>
      </Chat>
    </div>
  );
};

export default ChatBox;
