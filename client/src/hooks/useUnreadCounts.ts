import { useState, useEffect, useRef } from "react";
import { StreamChat } from "stream-chat";
import apiClient from "../api/apiClient";

interface UnreadMap {
  [groupId: string]: number;
}

/**
 * Connects to Stream Chat and tracks unread message counts per group channel.
 * Returns a map of groupId -> unreadCount and a total unread count.
 */
export const useUnreadCounts = () => {
  const [unreadMap, setUnreadMap] = useState<UnreadMap>({});
  const [totalUnread, setTotalUnread] = useState(0);
  const clientRef = useRef<StreamChat | null>(null);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;

      try {
        // Get a chat token from the server (we use a dummy groupId just to get credentials)
        const res = await apiClient.get("/api/chat/unread-info", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const { chatToken, apiKey, userId, name } = res.data;
        if (!chatToken || !apiKey) return;

        const client = new StreamChat(apiKey);
        await client.connectUser({ id: userId, name }, chatToken);
        clientRef.current = client;

        // Query all group channels the user is a member of
        const filter = { type: "messaging", members: { $in: [userId] } };
        const channels = await client.queryChannels(filter, { last_message_at: -1 }, { limit: 20 });

        if (!mounted) return;

        const map: UnreadMap = {};
        let total = 0;
        for (const ch of channels) {
          const unread = ch.countUnread();
          const channelId = ch.id || "";
          // Channel IDs are in format "group-{groupId}"
          const groupId = channelId.startsWith("group-")
            ? channelId.replace("group-", "")
            : channelId;
          map[groupId] = unread;
          total += unread;
        }

        setUnreadMap(map);
        setTotalUnread(total);

        // Listen for new messages to update counts in real-time
        client.on("message.new", (event) => {
          if (!mounted) return;
          const chId = event.channel_id || "";
          const gId = chId.startsWith("group-") ? chId.replace("group-", "") : chId;
          setUnreadMap((prev) => {
            const updated = { ...prev, [gId]: (prev[gId] || 0) + 1 };
            setTotalUnread(Object.values(updated).reduce((a, b) => a + b, 0));
            return updated;
          });
        });

        client.on("message.read", () => {
          if (!mounted) return;
          // Requery unread counts
          const recheckUnread = async () => {
            const chs = await client.queryChannels(filter, { last_message_at: -1 }, { limit: 20 });
            const m: UnreadMap = {};
            let t = 0;
            for (const ch of chs) {
              const u = ch.countUnread();
              const cId = ch.id || "";
              const gId = cId.startsWith("group-") ? cId.replace("group-", "") : cId;
              m[gId] = u;
              t += u;
            }
            if (mounted) {
              setUnreadMap(m);
              setTotalUnread(t);
            }
          };
          recheckUnread();
        });
      } catch (err) {
        console.error("Failed to initialize unread counts:", err);
      }
    };

    init();

    return () => {
      mounted = false;
      if (clientRef.current) {
        clientRef.current.disconnectUser();
        clientRef.current = null;
      }
    };
  }, []);

  return { unreadMap, totalUnread };
};
