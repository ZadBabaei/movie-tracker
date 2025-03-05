import React, { useState, useEffect } from "react";
import axios from "axios";
import "./Inbox.css";

const Inbox = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get("http://localhost:5000/api/inbox", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMessages(res.data);
      } catch (error) {
        setError("Failed to load messages.");
      } finally {
        setLoading(false);
      }
    };
    fetchMessages();
  }, []);

  const handleResponse = async (messageId, response) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        "http://localhost:5000/api/groups/respond",
        { groupId: messageId, response },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Remove the accepted/declined invitation from the inbox UI
      setMessages((prev) => prev.filter((msg) => msg._id !== messageId));
    } catch (error) {
      console.error("Error responding to invitation:", error);
    }
  };

  if (loading) return <p>Loading messages...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className="inbox-container">
      <h2>Inbox</h2>
      {messages.length === 0 ? (
        <p>No new messages.</p>
      ) : (
        messages.map((msg) => (
          <div key={msg._id} className="message-item">
            <p><strong>{msg.type === "invitation" ? "Group Invitation" : "Message"}:</strong> {msg.content}</p>
            {msg.type === "invitation" && (
              <div>
                <button onClick={() => handleResponse(msg._id, "accept")}>Accept</button>
                <button onClick={() => handleResponse(msg._id, "decline")}>Decline</button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};

export default Inbox;
// In this example, we have a component called Inbox that fetches messages from the server.
//  The messages can be either group invitations or regular messages. The user can accept or decline group invitations.