import React, { useRef, useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RiRobot2Fill } from "react-icons/ri";
import { IoClose, IoSend } from "react-icons/io5";
import { BsChatDotsFill } from "react-icons/bs";
import { FiTrash2 } from "react-icons/fi";
import { useChatStore } from "../../store/useChatStore";
import { sendAssistantMessage } from "../../api/assistantApi";
import "./ChatWidget.css";

const ChatWidget: React.FC = () => {
  const {
    isOpen,
    messages,
    isLoading,
    toggleChat,
    closeChat,
    addMessage,
    appendToLastMessage,
    setLoading,
    clearMessages,
  } = useChatStore();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setInput("");

    // Add user message
    addMessage({ role: "user", content: trimmed });

    // Create placeholder assistant message for streaming
    addMessage({ role: "assistant", content: "" });
    setLoading(true);

    try {
      // Get current history (excluding the empty placeholder)
      const history = useChatStore
        .getState()
        .messages.filter((m) => m.content !== "");

      await sendAssistantMessage(
        trimmed,
        history.slice(0, -1), // exclude the empty placeholder
        (chunk) => {
          appendToLastMessage(chunk);
        }
      );
    } catch (err) {
      console.error("Chat error:", err);
      // Replace the empty placeholder with error message
      appendToLastMessage(
        "Sorry, I couldn't process your request. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [input, isLoading, addMessage, appendToLastMessage, setLoading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 100) + "px";
  };

  return (
    <>
      {/* Floating toggle button */}
      <motion.button
        className="chat-widget-toggle"
        onClick={toggleChat}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        aria-label={isOpen ? "Close chat assistant" : "Open chat assistant"}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="chat-widget-toggle-icon"
            >
              <IoClose size={26} />
            </motion.span>
          ) : (
            <motion.span
              key="open"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="chat-widget-toggle-icon"
            >
              <BsChatDotsFill size={22} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="chat-widget-window"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {/* Header */}
            <div className="chat-widget-header">
              <div className="chat-widget-header-left">
                <RiRobot2Fill size={20} className="chat-widget-header-icon" />
                <div>
                  <h3 className="chat-widget-title">Movie Assistant</h3>
                  <span className="chat-widget-subtitle">
                    Ask me anything about movies
                  </span>
                </div>
              </div>
              <div className="chat-widget-header-actions">
                {messages.length > 0 && (
                  <button
                    className="chat-widget-clear-btn"
                    onClick={clearMessages}
                    title="Clear conversation"
                  >
                    <FiTrash2 size={16} />
                  </button>
                )}
                <button
                  className="chat-widget-close-btn"
                  onClick={closeChat}
                  title="Close chat"
                >
                  <IoClose size={20} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="chat-widget-messages">
              {messages.length === 0 && (
                <div className="chat-widget-welcome">
                  <RiRobot2Fill size={40} className="chat-widget-welcome-icon" />
                  <p className="chat-widget-welcome-title">
                    Hey! I'm your movie assistant
                  </p>
                  <p className="chat-widget-welcome-text">
                    Ask me about movie plots, actors, trivia, or get
                    personalized recommendations based on your watchlist.
                  </p>
                  <div className="chat-widget-suggestions">
                    {[
                      "Suggest me a movie",
                      "What should I watch tonight?",
                      "Tell me about Inception",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        className="chat-widget-suggestion-chip"
                        onClick={() => {
                          setInput(suggestion);
                          // Auto-send suggestion
                          addMessage({ role: "user", content: suggestion });
                          addMessage({ role: "assistant", content: "" });
                          setLoading(true);
                          const history = useChatStore
                            .getState()
                            .messages.filter((m) => m.content !== "");
                          sendAssistantMessage(
                            suggestion,
                            history.slice(0, -1),
                            (chunk) => appendToLastMessage(chunk)
                          )
                            .catch(() =>
                              appendToLastMessage(
                                "Sorry, I couldn't process your request."
                              )
                            )
                            .finally(() => {
                              setLoading(false);
                              setInput("");
                            });
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`chat-widget-message chat-widget-message-${msg.role}`}
                >
                  {msg.role === "assistant" && (
                    <div className="chat-widget-avatar">
                      <RiRobot2Fill size={16} />
                    </div>
                  )}
                  <div className={`chat-widget-bubble chat-widget-bubble-${msg.role}`}>
                    {msg.content || (
                      <span className="chat-widget-typing">
                        <span className="chat-widget-dot" />
                        <span className="chat-widget-dot" />
                        <span className="chat-widget-dot" />
                      </span>
                    )}
                  </div>
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="chat-widget-input-area">
              <textarea
                ref={inputRef}
                className="chat-widget-input"
                placeholder="Ask about any movie..."
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={isLoading}
              />
              <button
                className="chat-widget-send-btn"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                title="Send message"
              >
                <IoSend size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ChatWidget;
