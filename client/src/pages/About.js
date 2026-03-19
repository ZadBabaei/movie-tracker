import React from "react";
import VerticalNavbar from "../component/VerticalNavbar";
import { FaUsers, FaVoteYea, FaFilm, FaComments, FaHeart, FaClock } from "react-icons/fa";
import { SiReact, SiNodedotjs, SiMongodb, SiSocketdotio } from "react-icons/si";
import "./About.css";

const features = [
  {
    icon: <FaUsers />,
    title: "Group Watchlists",
    description: "Create groups with friends and manage a shared movie collection together.",
  },
  {
    icon: <FaVoteYea />,
    title: "Group Polls",
    description: "Can't agree on what to watch? Start a poll and let the group vote — with runoff tie-breaking.",
  },
  {
    icon: <FaFilm />,
    title: "Personal Watchlist",
    description: "Track every movie you want to see, with trending suggestions to keep your list fresh.",
  },
  {
    icon: <FaHeart />,
    title: "Favorites",
    description: "Heart your all-time favorites for quick access anytime from the top of your watchlist.",
  },
  {
    icon: <FaComments />,
    title: "Group Chat",
    description: "Real-time chat and poll history all in one place — no more switching apps.",
  },
  {
    icon: <FaClock />,
    title: "Watch Timeline",
    description: "See your watchlist organized visually so you always know what you've added and when.",
  },
];

const stack = [
  { icon: <SiReact />, label: "React", color: "#61dafb" },
  { icon: <SiNodedotjs />, label: "Node.js", color: "#68a063" },
  { icon: <SiMongodb />, label: "MongoDB", color: "#4db33d" },
  { icon: <SiSocketdotio />, label: "Socket.io", color: "#ffffff" },
];

const About = () => {
  return (
    <div className="about-page">
      <VerticalNavbar />

      <main className="about-main">
        {/* Hero */}
        <section className="about-hero">
          <div className="about-hero-glow" />
          <h1 className="about-hero-title">
            Watch Together,<br />
            <span className="about-hero-accent">Decide Together.</span>
          </h1>
          <p className="about-hero-sub">
            Movie Tracker is the social hub for film lovers — sync watchlists, vote on what's next,
            and chat with your crew, all in one dark, cinematic space.
          </p>
        </section>

        {/* Features */}
        <section className="about-features">
          <h2 className="about-section-title">Everything you need</h2>
          <div className="about-features-grid">
            {features.map((f) => (
              <div key={f.title} className="about-feature-card">
                <span className="about-feature-icon">{f.icon}</span>
                <h3 className="about-feature-title">{f.title}</h3>
                <p className="about-feature-desc">{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Tech Stack */}
        <section className="about-stack">
          <h2 className="about-section-title">Built with</h2>
          <div className="about-stack-row">
            {stack.map((s) => (
              <div key={s.label} className="about-stack-item">
                <span className="about-stack-icon" style={{ color: s.color }}>{s.icon}</span>
                <span className="about-stack-label">{s.label}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default About;
