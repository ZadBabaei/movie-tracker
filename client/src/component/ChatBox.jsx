import React, { useEffect, useState } from "react";
import {
  Chat,
  Channel,
  MessageList,
  Window,
  LoadingIndicator,
} from "stream-chat-react";
import { StreamChat } from "stream-chat";
import "stream-chat-react/dist/css/v2/index.css";
import GroupChatSidbar from "./GroupChatSidbar";
import CustomMessage from "./CustomMessage";
import CustomChatInput from "./CustomChatInput";
import apiClient from "../api/apiClient";
import {
  getAvatarUrl,
  getGroupAvatarUrl,
  handleAvatarError,
  handleGroupAvatarError,
} from "../utils/avatar";
import "./ChatBox.css";

const getMemberId = (member) => (member?._id || member?.id || member)?.toString();

const getDisplayName = (member) =>
  member?.name || member?.email || "Unknown user";

const normalizeMember = (member, currentUserId) => {
  const id = getMemberId(member);
  const name = getDisplayName(member);

  return {
    id,
    name,
    email: member?.email || "",
    image: getAvatarUrl({ ...member, name }),
    online: Boolean(member?.online),
    isCurrentUser: id === currentUserId,
  };
};

const getChatSetupErrorMessage = (phase) => {
  if (phase === "token") {
    return "Could not reach the chat service. Please refresh or try again later.";
  }

  if (phase === "stream") {
    return "Could not connect to the chat provider. Please try again later.";
  }

  return "Failed to load chat. Please try again later.";
};

const logChatSetupError = (phase, error) => {
  console.error("Chat setup failed:", {
    phase,
    status: error?.response?.status,
    message: error?.message,
  });
};

const ChatBox = ({ groupId, groupName }) => {
  const [chatClient, setChatClient] = useState(null);
  const [channel, setChannel] = useState(null);
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [chatError, setChatError] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);

  useEffect(() => {
    let disposed = false;
    let activeClient = null;

    const initChat = async () => {
      let phase = "token";

      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        const res = await apiClient.post(
          "/api/chat/token",
          { groupId },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        phase = "stream";
        const {
          token: chatToken,
          apiKey,
          userId,
          name,
          groupMembers,
        } = res.data;

        if (!chatToken || !apiKey || !userId) {
          throw new Error("Chat token response is missing required fields.");
        }

        const client = new StreamChat(apiKey);
        activeClient = client;
        await client.connectUser({ id: userId, name }, chatToken);

        const normalizedMembers = (groupMembers || [])
          .map((member) => normalizeMember(member, userId))
          .filter((member) => Boolean(member.id));

        const groupChannel = client.channel("messaging", `group-${groupId}`, {
          name: `Group ${groupId}`,
          members: normalizedMembers.map((member) => member.id),
        });

        phase = "channel";
        await groupChannel.watch();

        if (disposed) {
          client.disconnectUser();
          return;
        }

        setChatClient(client);
        setChannel(groupChannel);
        setCurrentUserId(userId);
        setMembers(normalizedMembers);
      } catch (error) {
        logChatSetupError(phase, error);
        if (!disposed) {
          setChatError(getChatSetupErrorMessage(phase));
        }
      }
    };

    initChat();

    return () => {
      disposed = true;
      if (activeClient) {
        activeClient.disconnectUser();
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
    setReplyTarget(null);
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

                    <img
                      src={selectedMember.image}
                      alt={selectedMember.name}
                      onError={(event) => handleAvatarError(event, selectedMember)}
                    />
                    <span>{selectedMember.name}</span>
                  </>
                ) : (
                  <>
                    <img
                      src={getGroupAvatarUrl({ groupId, groupName })}
                      alt={groupName || "Group"}
                      onError={(event) =>
                        handleGroupAvatarError(event, { groupId, groupName })
                      }
                    />
                    <span>{groupName || "Movie Circle"}</span>
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
                  <CustomMessage
                    {...props}
                    currentUserId={currentUserId}
                    onReply={setReplyTarget}
                  />
                )}
                className="custom-message-list"
              />

              <CustomChatInput
                replyTarget={replyTarget}
                onCancelReply={() => setReplyTarget(null)}
              />
            </Window>
          </div>
        </Channel>
      </Chat>
    </div>
  );
};

export default ChatBox;
