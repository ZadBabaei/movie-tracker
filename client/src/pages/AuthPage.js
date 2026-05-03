import React, { useEffect, useState } from "react";
import axios from "axios";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { Link, useNavigate } from "react-router-dom";
import {
  FaEnvelope,
  FaFacebookF,
  FaFilm,
  FaGoogle,
  FaLock,
  FaRegEye,
  FaUser,
  FaXTwitter,
} from "react-icons/fa6";
import { FaEyeSlash } from "react-icons/fa";
import authVectorReference from "../assets/auth-vector-reference.png";
import "./AuthPage.css";

const API_URL = process.env.REACT_APP_API_URL;
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

function AuthPage({ initialMode = "signin" }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
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

  const isSignup = mode === "signup";

  const showComingSoon = () => {
    setToast("Social sign-in coming soon!");
    setTimeout(() => setToast(null), 3000);
  };

  const showGoogleConfigError = () => {
    setError("Google sign-in is not configured yet.");
  };

  const showPasswordResetSoon = () => {
    setToast("Password reset coming soon!");
    setTimeout(() => setToast(null), 3000);
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
    const res = await axios.post(
      `${API_URL}/api/auth/login`,
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

    await axios.post(`${API_URL}/api/auth/register`, {
      name,
      email,
      password,
    });

    const loginRes = await axios.post(`${API_URL}/api/auth/login`, { email, password });
    localStorage.setItem("token", loginRes.data.token);
    redirectAfterAuth(loginRes.data.user);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isSignup) {
        await handleSignup();
      } else {
        await handleLogin();
      }
    } catch (err) {
      setError(
        err.response?.data?.msg ||
          (isSignup ? "Signup failed. Maybe the user already exists." : "Invalid credentials. Please try again.")
      );
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError(null);
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    if (!credentialResponse?.credential) {
      setError("Google sign-in did not return a credential.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await axios.post(
        `${API_URL}/api/auth/google`,
        { credential: credentialResponse.credential },
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

  const page = (
    <main className="AuthPage">
      <section className="AuthPage-shell">
        <div className="AuthPage-hero">
          <div className="AuthPage-brand">
            <span className="AuthPage-logoMark">
              <FaFilm />
            </span>
            <span>Movie Tracker</span>
          </div>

          <div className="AuthPage-copy">
            <h1>Plan movie nights without the chaos.</h1>
            <p>
              Create groups, vote on what to watch, build shared watchlists, and keep the night
              moving with real-time syncing.
            </p>
          </div>

          <div className="AuthPage-cinema" aria-hidden="true">
            <img
              className="AuthPage-heroImage"
              src={authVectorReference}
              alt=""
              loading="eager"
            />
          </div>

          <div className="AuthPage-trust">
            <span>Private Groups</span>
            <span>Shared Watchlists</span>
            <span>Real-Time Planning</span>
          </div>
        </div>

        <section className="AuthPage-card" aria-label={isSignup ? "Create account" : "Sign in"}>
          <div className="AuthPage-toggle" role="tablist" aria-label="Authentication mode">
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
          </div>

          <div className="AuthPage-cardHeader">
            <h2>{isSignup ? "Create your account" : "Welcome back"}</h2>
            <p>{isSignup ? "Join the community of cinephiles today." : "Please enter your details to continue."}</p>
          </div>

          <form className="AuthPage-form" onSubmit={handleSubmit}>
            {isSignup && (
              <label className="AuthPage-field">
                <span>Full Name</span>
                <div className="AuthPage-inputWrap">
                  <FaUser />
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your name" required />
                </div>
              </label>
            )}

            <label className="AuthPage-field">
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
            </label>

            <label className="AuthPage-field">
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
            </label>

            {isSignup && (
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

            {!isSignup ? (
              <div className="AuthPage-row">
                <label className="AuthPage-check">
                  <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
                  <span>Remember me</span>
                </label>
                <button type="button" className="AuthPage-inlineBtn" onClick={showPasswordResetSoon}>
                  Forgot password?
                </button>
              </div>
            ) : (
              <label className="AuthPage-check AuthPage-terms">
                <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />
                <span>
                  I agree to the <Link to="/terms">Terms of Service</Link> and Privacy Policy
                </span>
              </label>
            )}

            {error && <p className="AuthPage-error">{error}</p>}

            <button className="AuthPage-submit" type="submit" disabled={submitting}>
              {submitting ? "Please wait..." : isSignup ? "Create Account" : "Sign In"}
            </button>
          </form>

          <div className="AuthPage-divider">
            <span>OR CONTINUE WITH</span>
          </div>

          <div className="AuthPage-socials">
            {GOOGLE_CLIENT_ID ? (
              <div className="AuthPage-socialGoogle" aria-label="Continue with Google">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  type="icon"
                  shape="rectangular"
                  theme="filled_black"
                  size="large"
                />
              </div>
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
          </div>

          <p className="AuthPage-bottomText">
            {isSignup ? "Already have an account?" : "New here?"}{" "}
            <button type="button" onClick={() => switchMode(isSignup ? "signin" : "signup")}>
              {isSignup ? "Sign in" : "Create an account"}
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
