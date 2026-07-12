import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { FaLock, FaRegEye } from "react-icons/fa6";
import { FaEyeSlash } from "react-icons/fa";
import apiClient from "../api/apiClient";
import "./AuthPage.css";
import fullLogo from "../assets/movie-tracker-logo-full.svg";

function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post(`/api/auth/reset-password/${token}`, { password });
      toast.success("Password reset successful. You can now sign in.");
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.msg || "Unable to reset password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="AuthPage">
      <section className="AuthPage-shell">
        <div className="AuthPage-hero">
          <div className="AuthPage-brand">
            <img className="AuthPage-brandLockup" src={fullLogo} alt="Movie Tracker" />
          </div>

          <div className="AuthPage-copy">
            <h1>Set a new password.</h1>
            <p>Choose a secure password and get back to planning movie nights with your groups.</p>
          </div>

          <div className="AuthPage-trust">
            <span>Secure Reset</span>
            <span>Private Groups</span>
            <span>Shared Watchlists</span>
          </div>
        </div>

        <section className="AuthPage-card" aria-label="Set new password">
          <div className="AuthPage-cardHeader">
            <h2>Reset password</h2>
            <p>Enter your new password below.</p>
          </div>

          <form className="AuthPage-form" onSubmit={handleSubmit}>
            <label className="AuthPage-field">
              <span>New Password</span>
              <div className="AuthPage-inputWrap">
                <FaLock />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="New password"
                  required
                  minLength={8}
                />
                <button type="button" className="AuthPage-eye" onClick={() => setShowPassword((show) => !show)} aria-label="Toggle password visibility">
                  {showPassword ? <FaEyeSlash /> : <FaRegEye />}
                </button>
              </div>
            </label>

            <label className="AuthPage-field">
              <span>Confirm Password</span>
              <div className="AuthPage-inputWrap">
                <FaLock />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm password"
                  required
                  minLength={8}
                />
                <button type="button" className="AuthPage-eye" onClick={() => setShowConfirmPassword((show) => !show)} aria-label="Toggle confirm password visibility">
                  {showConfirmPassword ? <FaEyeSlash /> : <FaRegEye />}
                </button>
              </div>
            </label>

            {error && <p className="AuthPage-error">{error}</p>}

            <button className="AuthPage-submit" type="submit" disabled={submitting}>
              {submitting ? "Please wait..." : "Reset password"}
            </button>
          </form>

          <p className="AuthPage-bottomText">
            Remembered your password?{" "}
            <button type="button" onClick={() => navigate("/")}>
              Sign in
            </button>
          </p>
        </section>
      </section>
    </main>
  );
}

export default ResetPassword;
