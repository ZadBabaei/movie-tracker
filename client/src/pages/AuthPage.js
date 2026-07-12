import React, { useEffect, useState } from "react";
import { GoogleOAuthProvider, useGoogleLogin } from "@react-oauth/google";
import { Link, useNavigate } from "react-router-dom";
import {
  FaEnvelope,
  FaFacebookF,
  FaGoogle,
  FaLock,
  FaRegEye,
  FaUser,
  FaXTwitter,
} from "react-icons/fa6";
import { FaEyeSlash } from "react-icons/fa";
import apiClient from "../api/apiClient";
import "./AuthPage.css";
import wordmark from "../assets/movie-tracker-logo-full.png";

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

function GoogleAuthButton({ onSuccess, onError, onNonOAuthError, disabled }) {
  const login = useGoogleLogin({
    flow: "implicit",
    scope: "openid email profile",
    onSuccess: (tokenResponse) => {
      if (!tokenResponse?.access_token) {
        onError();
        return;
      }
      onSuccess(tokenResponse.access_token);
    },
    onError,
    onNonOAuthError,
  });

  return (
    <button
      type="button"
      onClick={() => login()}
      disabled={disabled}
      aria-label="Continue with Google"
    >
      <FaGoogle />
    </button>
  );
}

function AuthPage({ initialMode = "signin" }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setError(null);
  }, [initialMode]);

  useEffect(() => {
    document.body.classList.add("auth-route");
    return () => {
      document.body.classList.remove("auth-route");
    };
  }, []);

  const isSignup = mode === "signup";
  const isForgotPassword = mode === "forgot-password";
  const genericResetMessage = "If an account exists for that email, we sent a reset link.";

  const showComingSoon = () => {
    setToast("Social sign-in coming soon!");
    setTimeout(() => setToast(null), 3000);
  };

  const showGoogleConfigError = () => {
    setError("Google sign-in is not configured yet.");
  };

  const redirectAfterAuth = (user) => {
    if (user) localStorage.setItem("user", JSON.stringify(user));
    const redirect = sessionStorage.getItem("redirectAfterAuth");
    if (redirect) {
      sessionStorage.removeItem("redirectAfterAuth");
      navigate(redirect);
      return;
    }
    navigate("/home");
  };

  const handleLogin = async () => {
    const res = await apiClient.post(
      "/api/auth/login",
      { email, password, rememberMe },
      { headers: { "Content-Type": "application/json" } }
    );

    localStorage.setItem("token", res.data.token);
    redirectAfterAuth(res.data.user);
  };

  const handleSignup = async () => {
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!acceptedTerms) {
      setError("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }

    await apiClient.post("/api/auth/register", {
      name,
      email,
      password,
    });
    const loginRes = await apiClient.post("/api/auth/login", { email, password });
    localStorage.setItem("token", loginRes.data.token);
    redirectAfterAuth(loginRes.data.user);
  };

  const handleForgotPassword = async () => {
    await apiClient.post("/api/auth/forgot-password", {
      email: forgotEmail,
    });
    setError(null);
    setToast(genericResetMessage);
    setTimeout(() => setToast(null), 4200);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isForgotPassword) {
        await handleForgotPassword();
      } else if (isSignup) {
        await handleSignup();
      } else {
        await handleLogin();
      }
    } catch (err) {
      setError(
        err.response?.data?.msg ||
          (isForgotPassword
            ? "Unable to send reset link. Please try again."
            : isSignup
              ? "Signup failed. Maybe the user already exists."
              : "Invalid credentials. Please try again.")
      );
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError(null);
    if (nextMode === "forgot-password") {
      setForgotEmail(email);
    }
  };

  const handleGoogleAccessToken = async (accessToken) => {
    if (!accessToken) {
      setError("Google sign-in did not return an access token.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await apiClient.post(
        "/api/auth/google",
        { accessToken },
        { headers: { "Content-Type": "application/json" } }
      );

      localStorage.setItem("token", res.data.token);
      redirectAfterAuth(res.data.user);
    } catch (err) {
      setError(err.response?.data?.msg || "Google authentication failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleError = () => {
    setError("Google authentication failed. Please try again.");
  };

  const handleGoogleNonOAuthError = (error) => {
    console.error("Google non-OAuth error:", error);

    if (error?.type === "popup_failed_to_open") {
      setError("Google sign-in popup could not open. Please allow popups for this site and try again.");
      return;
    }

    if (error?.type === "popup_closed") {
      setError("Google sign-in popup was closed before sign-in completed.");
      return;
    }

    setError("Google sign-in could not open. Please try again.");
  };

  const page = (
    <main className="AuthPage">
      <section className="AuthPage-shell">
        <div className="AuthPage-hero">
          <div className="AuthPage-brand">
            <img className="AuthPage-brandLockup" src={wordmark} alt="Movie Tracker" />
          </div>

          <div className="AuthPage-copy">
            <h1>Plan movie nights without the chaos.</h1>
            <p>
              Create groups, vote on what to watch, build shared watchlists, and keep the night
              moving with real-time syncing.
            </p>
          </div>

          <div className="AuthPage-trust">
            <span>Private Groups</span>
            <span>Shared Watchlists</span>
            <span>Real-Time Planning</span>
          </div>
        </div>

        <section className="AuthPage-card" aria-label={isForgotPassword ? "Reset password" : isSignup ? "Create account" : "Sign in"}>
          {!isForgotPassword && <div className="AuthPage-toggle" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={!isSignup ? "active" : ""}
              onClick={() => switchMode("signin")}
              role="tab"
              aria-selected={!isSignup}
            >
              Sign In
            </button>
            <button
              type="button"
              className={isSignup ? "active" : ""}
              onClick={() => switchMode("signup")}
              role="tab"
              aria-selected={isSignup}
            >
              Sign Up
            </button>
          </div>}

          <div className="AuthPage-cardHeader">
            <h2>{isForgotPassword ? "Reset your password" : isSignup ? "Create your account" : "Welcome back"}</h2>
            <p>
              {isForgotPassword
                ? "Enter your email and we will send a secure reset link."
                : isSignup
                  ? "Join the community of cinephiles today."
                  : "Please enter your details to continue."}
            </p>
          </div>

          <form className="AuthPage-form" onSubmit={handleSubmit}>
            {isForgotPassword ? (
              <label className="AuthPage-field">
                <span>Email Address</span>
                <div className="AuthPage-inputWrap">
                  <FaEnvelope />
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(event) => setForgotEmail(event.target.value)}
                    placeholder="name@example.com"
                    required
                  />
                </div>
              </label>
            ) : isSignup && (
              <label className="AuthPage-field">
                <span>Full Name</span>
                <div className="AuthPage-inputWrap">
                  <FaUser />
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your name" required />
                </div>
              </label>
            )}

            {!isForgotPassword && <label className="AuthPage-field">
              <span>{isSignup ? "Email Address" : "Email Address"}</span>
              <div className="AuthPage-inputWrap">
                <FaEnvelope />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={isSignup ? "cine@track.com" : "name@example.com"}
                  required
                />
              </div>
            </label>}

            {!isForgotPassword && <label className="AuthPage-field">
              <span>Password</span>
              <div className="AuthPage-inputWrap">
                <FaLock />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  required
                />
                <button type="button" className="AuthPage-eye" onClick={() => setShowPassword((show) => !show)} aria-label="Toggle password visibility">
                  {showPassword ? <FaEyeSlash /> : <FaRegEye />}
                </button>
              </div>
            </label>}

            {!isForgotPassword && isSignup && (
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
                  />
                  <button type="button" className="AuthPage-eye" onClick={() => setShowConfirmPassword((show) => !show)} aria-label="Toggle confirm password visibility">
                    {showConfirmPassword ? <FaEyeSlash /> : <FaRegEye />}
                  </button>
                </div>
              </label>
            )}

            {!isForgotPassword && !isSignup ? (
              <div className="AuthPage-row">
                <label className="AuthPage-check">
                  <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
                  <span>Remember me</span>
                </label>
                <button type="button" className="AuthPage-inlineBtn" onClick={() => switchMode("forgot-password")}>
                  Forgot password?
                </button>
              </div>
            ) : !isForgotPassword ? (
              <label className="AuthPage-check AuthPage-terms">
                <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />
                <span>
                  I agree to the <Link to="/terms">Terms of Service</Link> and Privacy Policy
                </span>
              </label>
            ) : null}

            {error && <p className="AuthPage-error">{error}</p>}

            <button className="AuthPage-submit" type="submit" disabled={submitting}>
              {submitting ? "Please wait..." : isForgotPassword ? "Send reset link" : isSignup ? "Create Account" : "Sign In"}
            </button>
          </form>

          {!isForgotPassword && <div className="AuthPage-divider">
            <span>OR CONTINUE WITH</span>
          </div>}

          {!isForgotPassword && <div className="AuthPage-socials">
            {GOOGLE_CLIENT_ID ? (
              <GoogleAuthButton
                onSuccess={handleGoogleAccessToken}
                onError={handleGoogleError}
                onNonOAuthError={handleGoogleNonOAuthError}
                disabled={submitting}
              />
            ) : (
              <button type="button" onClick={showGoogleConfigError} aria-label="Continue with Google">
                <FaGoogle />
              </button>
            )}
            <button type="button" onClick={showComingSoon} aria-label="Continue with Facebook">
              <FaFacebookF />
            </button>
            <button type="button" onClick={showComingSoon} aria-label="Continue with X">
              <FaXTwitter />
            </button>
          </div>}

          <p className="AuthPage-bottomText">
            {isForgotPassword ? "Remembered your password?" : isSignup ? "Already have an account?" : "New here?"}{" "}
            <button type="button" onClick={() => switchMode(isForgotPassword || isSignup ? "signin" : "signup")}>
              {isForgotPassword || isSignup ? "Sign in" : "Create an account"}
            </button>
          </p>
        </section>
      </section>

      {toast && <div className="AuthPage-toast">{toast}</div>}
    </main>
  );

  if (!GOOGLE_CLIENT_ID) {
    return page;
  }

  return <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{page}</GoogleOAuthProvider>;
}

export default AuthPage;
