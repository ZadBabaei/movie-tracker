import React, { useEffect, useState } from "react";
import axios from "axios";
import { FaReply, FaUserCircle } from "react-icons/fa";
import "./CommentSection.css";

const formatDate = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const CommentCard = ({ comment, onReply, depth = 0 }) => {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState("");

  const handleReplySubmit = (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    onReply(comment._id, replyText.trim());
    setReplyText("");
    setShowReplyInput(false);
  };

  return (
    <div className={`comment-card ${depth > 0 ? "comment-card-reply" : ""}`}>
      <div className="comment-avatar">
        <FaUserCircle className="comment-avatar-icon" />
      </div>
      <div className="comment-body">
        <div className="comment-header">
          <span className="comment-username">{comment.username}</span>
          <span className="comment-date">{formatDate(comment.createdAt)}</span>
        </div>
        <p className="comment-text">{comment.text}</p>
        {depth === 0 && (
          <button
            className="comment-reply-btn"
            onClick={() => setShowReplyInput((v) => !v)}
          >
            <FaReply /> Reply
          </button>
        )}
        {showReplyInput && (
          <form className="comment-reply-form" onSubmit={handleReplySubmit}>
            <input
              className="comment-input"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply..."
              autoFocus
            />
            <div className="comment-reply-actions">
              <button type="submit" className="comment-submit-btn">Post</button>
              <button type="button" className="comment-cancel-btn" onClick={() => setShowReplyInput(false)}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const CommentSection = ({ movieId }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const fetchComments = async () => {
    try {
      const res = await axios.get(`/api/comments?movieId=${movieId}`, { headers });
      setComments(res.data);
    } catch (err) {
      console.error("Failed to fetch comments:", err);
    }
  };

  useEffect(() => {
    if (movieId) fetchComments();
  }, [movieId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || loading) return;
    setLoading(true);
    try {
      const res = await axios.post("/api/comments", { movieId, text: newComment.trim() }, { headers });
      setComments((prev) => [...prev, res.data]);
      setNewComment("");
    } catch (err) {
      console.error("Failed to post comment:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (parentId, text) => {
    try {
      const res = await axios.post("/api/comments", { movieId, text, parentId }, { headers });
      setComments((prev) => [...prev, res.data]);
    } catch (err) {
      console.error("Failed to post reply:", err);
    }
  };

  const topLevel = comments.filter((c) => !c.parentId);
  const replies = (parentId) => comments.filter((c) => c.parentId === parentId);

  return (
    <div className="comment-section">
      <h3 className="comment-section-title">Comments</h3>

      <form className="comment-new-form" onSubmit={handleSubmit}>
        <input
          className="comment-input"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment..."
        />
        <button type="submit" className="comment-submit-btn" disabled={loading || !newComment.trim()}>
          Post
        </button>
      </form>

      {topLevel.length === 0 ? (
        <p className="comment-empty">No comments yet. Be the first!</p>
      ) : (
        <div className="comment-list">
          {topLevel.map((comment) => (
            <div key={comment._id}>
              <CommentCard comment={comment} onReply={handleReply} depth={0} />
              {replies(comment._id).map((reply) => (
                <CommentCard key={reply._id} comment={reply} onReply={handleReply} depth={1} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommentSection;
