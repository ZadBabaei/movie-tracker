import React, { useEffect, useState } from "react";
import "./inbox.css";
import { jwtDecode } from "jwt-decode";
import VerticalNavbar from "../component/VerticalNavbar";
import Hero from "../component/Hero";
import apiClient from "../api/apiClient";

const Inbox = () => {
  const [messages, setMessages] = useState([]);
  const token = localStorage.getItem("token");
  const decoded = token ? jwtDecode(token) : null;

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await apiClient.get("/api/inbox", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setMessages(res.data);
      } catch (err) {
        console.error("Error fetching messages:", err);
      }
    };

    if (token) {
      fetchMessages();
    }
  }, [token]);

  const handleResponse = async (messageId, action) => {
    try {
     await apiClient.post(
       "/api/groups/respond",
       {
         groupId: messageId,
         response: action,
       },
       {
         headers: {
           Authorization: `Bearer ${token}`,
         },
       }
     );

      setMessages((prev) => prev.filter((msg) => msg._id !== messageId));
    } catch (err) {
      console.error("Error responding to message:", err);
    }
  };

  return (
    <>
      <VerticalNavbar />
      <Hero
        height="46vh"
        eyebrow="Notifications"
        backgroundImage="https://image.tmdb.org/t/p/original/tNUbjqyn1Bf0KqL5NPyvgdw7Eq0.jpg"
        heroText="Stay in the Loop"
        heroTextSub="Accept invites, join the fun, and never miss a moment with your crew."
        stats={`${messages.length} ${messages.length === 1 ? "message" : "messages"} waiting`}
      ></Hero>
      <div className="inbox-wrapper">
        <div className="inbox-container">
          <h2>Inbox</h2>
          {messages.length === 0 ? (
            <p className="no-messages">No new messages.</p>
          ) : (
            messages.map((msg) => (
              <div key={msg._id} className="message-item">
                <p>
                  <strong>
                    {msg.type === "invitation" ? "Group Invitation" : "Message"}
                    :
                  </strong>{" "}
                  {msg.content}
                </p>
                {msg.type === "invitation" && (
                  <div className="message-buttons">
                    <button onClick={() => handleResponse(msg._id, "accept")}>
                      Accept
                    </button>
                    <button onClick={() => handleResponse(msg._id, "decline")}>
                      Decline
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};

export default Inbox;
