import React, { useState } from "react";
import VerticalNavbar from "../component/VerticalNavbar";
import { toast } from "react-toastify";
import {
  FaBug,
  FaClock,
  FaComments,
  FaFilm,
  FaHeart,
  FaTimes,
  FaUsers,
  FaVoteYea,
} from "react-icons/fa";
import { SiReact, SiNodedotjs, SiMongodb, SiSocketdotio } from "react-icons/si";
import apiClient from "../api/apiClient";
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

const severityOptions = ["Low", "Medium", "High", "Critical"];

const emptyBugReport = {
  title: "",
  description: "",
  stepsToReproduce: "",
  expectedResult: "",
  actualResult: "",
  affectedPage: "",
  severity: "Medium",
  screenshotUrl: "",
};

const About = () => {
  const bugReportsEnabled = process.env.REACT_APP_ENABLE_BUG_REPORTS === "true";
  const [showBugModal, setShowBugModal] = useState(false);
  const [bugReport, setBugReport] = useState(emptyBugReport);
  const [submittingBugReport, setSubmittingBugReport] = useState(false);
  const [screenshotName, setScreenshotName] = useState("");

  const updateBugReport = (field, value) => {
    setBugReport((prev) => ({ ...prev, [field]: value }));
  };

  const closeBugModal = () => {
    if (submittingBugReport) return;
    setShowBugModal(false);
    setBugReport(emptyBugReport);
    setScreenshotName("");
  };

  const handleScreenshotChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      updateBugReport("screenshotUrl", "");
      setScreenshotName("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Screenshot must be an image file.");
      event.target.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Screenshot must be under 2MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateBugReport("screenshotUrl", reader.result || "");
      setScreenshotName(file.name);
    };
    reader.onerror = () => toast.error("Unable to attach screenshot.");
    reader.readAsDataURL(file);
  };

  const handleBugReportSubmit = async (event) => {
    event.preventDefault();
    setSubmittingBugReport(true);

    try {
      const token = localStorage.getItem("token");
      await apiClient.post(
        "/api/bug-reports",
        {
          ...bugReport,
          pageUrl: window.location.href,
          browserInfo: window.navigator.userAgent,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Bug report submitted.");
      closeBugModal();
    } catch (error) {
      toast.error(error.response?.data?.msg || "Failed to submit bug report.");
    } finally {
      setSubmittingBugReport(false);
    }
  };

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

        {/* Data attribution */}
        <section className="about-attribution">
          <p>
            Movie data, posters, and artwork are provided by{" "}
            <a
              href="https://www.themoviedb.org/"
              target="_blank"
              rel="noopener noreferrer"
            >
              The Movie Database (TMDB)
            </a>{" "}
            and{" "}
            <a
              href="https://www.watchmode.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Watchmode
            </a>
            . This product uses the TMDB API but is not endorsed or certified
            by TMDB.
          </p>
        </section>

        {bugReportsEnabled && (
          <section className="about-bug-report">
            <div className="about-bug-report-copy">
              <span className="about-bug-report-icon"><FaBug /></span>
              <div>
                <h2 className="about-section-title">Testing feedback</h2>
                <p>
                  Found something broken during staging? Send a report with the page,
                  browser details, and reproduction notes.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="about-bug-report-btn"
              onClick={() => setShowBugModal(true)}
            >
              Report a Bug
            </button>
          </section>
        )}
      </main>

      {bugReportsEnabled && showBugModal && (
        <div className="bug-report-overlay" onClick={closeBugModal}>
          <form className="bug-report-modal" onSubmit={handleBugReportSubmit} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="bug-report-close"
              onClick={closeBugModal}
              aria-label="Close bug report form"
            >
              <FaTimes />
            </button>

            <div className="bug-report-header">
              <span className="bug-report-icon"><FaBug /></span>
              <div>
                <h2>Report a Bug</h2>
                <p>Include enough detail for staging triage.</p>
              </div>
            </div>

            <label className="bug-report-field">
              <span>Title</span>
              <input
                value={bugReport.title}
                onChange={(e) => updateBugReport("title", e.target.value)}
                maxLength={160}
                required
              />
            </label>

            <label className="bug-report-field">
              <span>What happened?</span>
              <textarea
                value={bugReport.description}
                onChange={(e) => updateBugReport("description", e.target.value)}
                rows={3}
                required
              />
            </label>

            <label className="bug-report-field">
              <span>Steps to reproduce</span>
              <textarea
                value={bugReport.stepsToReproduce}
                onChange={(e) => updateBugReport("stepsToReproduce", e.target.value)}
                rows={3}
                required
              />
            </label>

            <div className="bug-report-grid">
              <label className="bug-report-field">
                <span>Expected result</span>
                <textarea
                  value={bugReport.expectedResult}
                  onChange={(e) => updateBugReport("expectedResult", e.target.value)}
                  rows={2}
                  required
                />
              </label>

              <label className="bug-report-field">
                <span>Actual result</span>
                <textarea
                  value={bugReport.actualResult}
                  onChange={(e) => updateBugReport("actualResult", e.target.value)}
                  rows={2}
                  required
                />
              </label>
            </div>

            <div className="bug-report-grid">
              <label className="bug-report-field">
                <span>Page/feature affected</span>
                <input
                  value={bugReport.affectedPage}
                  onChange={(e) => updateBugReport("affectedPage", e.target.value)}
                  maxLength={160}
                  required
                />
              </label>

              <label className="bug-report-field">
                <span>Severity</span>
                <select
                  value={bugReport.severity}
                  onChange={(e) => updateBugReport("severity", e.target.value)}
                >
                  {severityOptions.map((severity) => (
                    <option key={severity} value={severity}>{severity}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="bug-report-field">
              <span>Screenshot</span>
              <input type="file" accept="image/*" onChange={handleScreenshotChange} />
              {screenshotName && <small>{screenshotName}</small>}
            </label>

            <div className="bug-report-captured">
              <span>{window.location.href}</span>
              <span>{window.navigator.userAgent}</span>
            </div>

            <div className="bug-report-actions">
              <button
                type="button"
                className="bug-report-secondary"
                onClick={closeBugModal}
                disabled={submittingBugReport}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bug-report-primary"
                disabled={submittingBugReport}
              >
                {submittingBugReport ? "Submitting..." : "Submit report"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default About;
