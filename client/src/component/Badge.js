import React from "react";
import "./Badge.css";

const Badge = ({ type, text }) => {
  return (
    <div className={`badge ${type}`}>
      {text || (type === "winner" ? "🏆 Winner" : "")}
    </div>
  );
};

export default Badge;
