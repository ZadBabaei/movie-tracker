import React from "react";
import { useNavigate } from "react-router-dom";
import "./Terms.css";

const Terms: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="terms-page">
      <div className="terms-container">
        <h1 className="terms-title">Terms of Service</h1>
        <p className="terms-updated">Last updated: March 30, 2026</p>

        <section className="terms-section">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By creating an account and using Movie Tracker, you agree to be bound by these Terms of Service.
            If you do not agree to these terms, please do not use the service.
          </p>
        </section>

        <section className="terms-section">
          <h2>2. Account Registration</h2>
          <p>
            You must provide accurate and complete information when creating your account. You are responsible
            for maintaining the security of your account credentials and for all activities that occur under
            your account.
          </p>
        </section>

        <section className="terms-section">
          <h2>3. User Content</h2>
          <p>
            You retain ownership of content you post, including comments, ratings, and group contributions.
            By posting content, you grant Movie Tracker a non-exclusive license to display it within the
            platform. You agree not to post content that is offensive, illegal, or violates the rights of others.
          </p>
        </section>

        <section className="terms-section">
          <h2>4. Groups & Collaboration</h2>
          <p>
            Group creators are responsible for managing their groups. Members must respect group rules and
            other members. Movie Tracker reserves the right to remove groups or content that violates these terms.
          </p>
        </section>

        <section className="terms-section">
          <h2>5. Privacy & Data</h2>
          <p>
            We collect and store your name, email, profile picture, watchlist data, and group activity.
            This data is used solely to provide the Movie Tracker service. We do not sell your personal
            information to third parties. Movie data is sourced from TMDB and is subject to their terms of use.
          </p>
        </section>

        <section className="terms-section">
          <h2>6. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the service for any unlawful purpose</li>
            <li>Harass, abuse, or harm other users</li>
            <li>Attempt to gain unauthorized access to the service or other accounts</li>
            <li>Upload malicious content or spam</li>
            <li>Impersonate other users or entities</li>
          </ul>
        </section>

        <section className="terms-section">
          <h2>7. Service Availability</h2>
          <p>
            Movie Tracker is provided "as is" without warranties. We may modify, suspend, or discontinue
            the service at any time without prior notice. We are not liable for any interruptions or data loss.
          </p>
        </section>

        <section className="terms-section">
          <h2>8. Termination</h2>
          <p>
            We reserve the right to suspend or terminate your account if you violate these terms.
            You may delete your account at any time by contacting support.
          </p>
        </section>

        <section className="terms-section">
          <h2>9. Changes to Terms</h2>
          <p>
            We may update these terms from time to time. Continued use of the service after changes
            constitutes acceptance of the updated terms.
          </p>
        </section>

        <button className="terms-back-btn" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>
    </div>
  );
};

export default Terms;
