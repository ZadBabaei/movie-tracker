import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import User from "../models/user";
import { sendPasswordResetEmail } from "../utils/emailService";
import { getDefaultAvatarUrl } from "../utils/avatar";
import { hasAdminAccess } from "../middleware/adminMiddleware";
import { recordAnalyticsEvent } from "../utils/analytics";
import { loginLimiter, passwordResetLimiter, registerLimiter } from "../middleware/rateLimits";
import { readBearerToken, signAuthToken, verifyAuthToken } from "../utils/authToken";

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const buildAuthToken = (user: any) => signAuthToken(user);

const resolveAvatarUrl = (user: any) => {
  const avatar = String(user?.avatar || "").trim();
  return avatar || getDefaultAvatarUrl(user?.name, user?.email);
};

const buildAuthUser = (user: any) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  avatar: resolveAvatarUrl(user),
  firstLogin: user.firstLogin ?? true,
  isAdmin: hasAdminAccess(user),
});

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const genericPasswordResetMessage = "If an account exists for that email, we sent a reset link.";
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sign-in used to emit a dozen log lines per attempt. Keep them available for
// debugging, but off by default.
const googleAuthDebug = (...args: unknown[]) => {
  if (process.env.DEBUG_GOOGLE_AUTH === "true") console.info(...args);
};
const hashResetToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const isValidResetToken = (token: string) => /^[a-f0-9]{64}$/i.test(token);

const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();
const previewValue = (value?: string) => value ? value.slice(0, 8) : "missing";

const logGoogleAuthFailure = (
  reason: string,
  details: Record<string, unknown> = {}
) => {
  console.error("Google auth failure:", {
    reason,
    ...details,
  });
};

const sendGoogleAuthFailure = (
  res: Response,
  status: number,
  reason: string,
  publicMessage = "Google authentication failed"
) => {
  logGoogleAuthFailure(reason);
  res.status(status).json({ msg: publicMessage, reason });
};

router.post("/register", registerLimiter, async (req: Request, res: Response) => {
  try {
    const { password, avatar } = req.body;
    const name = String(req.body?.name || "").trim();
    const email = normalizeEmail(req.body?.email);
    if (!name || !email || !password) {
      res.status(400).json({ msg: "Please fill in all fields" });
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      res.status(400).json({ msg: "Please enter a valid email address" });
      return;
    }

    // Matches the rule already enforced on password reset.
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ msg: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }

    const existing = await User.findOne({
      email: { $regex: `^${escapeRegex(email)}$`, $options: "i" },
    });
    if (existing) {
      res.status(400).json({ msg: "Email already in use" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      provider: "local",
      avatar: avatar || getDefaultAvatarUrl(name, email),
    });
    const savedUser = await newUser.save();
    void recordAnalyticsEvent(req, "user_registered", "authentication", { provider: "local" }, savedUser._id.toString())
      .catch((error) => console.warn("Registration analytics failed:", error));

    res.json({ msg: "Signup successful", user: buildAuthUser(savedUser) });
  } catch (error) {
    console.error("Error in register route:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.post("/login", loginLimiter, async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    const email = normalizeEmail(req.body?.email);
    const user = await User.findOne({
      email: { $regex: `^${escapeRegex(email)}$`, $options: "i" },
    });
    if (!user) {
      res.status(400).json({ msg: "Invalid credentials" });
      return;
    }

    if (!user.password) {
      res.status(400).json({ msg: "Please continue with Google for this account" });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(400).json({ msg: "Invalid credentials" });
      return;
    }

    const token = buildAuthToken(user);

    res.json({
      token,
      user: buildAuthUser(user),
    });
  } catch (error) {
    console.error("Error in login route:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

router.post("/forgot-password", passwordResetLimiter, async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      res.json({ msg: genericPasswordResetMessage });
      return;
    }

    const user = await User.findOne({
      email: { $regex: `^${escapeRegex(email)}$`, $options: "i" },
    });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      user.passwordResetToken = hashResetToken(rawToken);
      user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();

      const appUrl = process.env.APP_URL || "http://localhost:3000";
      const resetLink = `${appUrl.replace(/\/$/, "")}/reset-password/${rawToken}`;

      try {
        await sendPasswordResetEmail(user.email, resetLink);
      } catch (error) {
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();
        console.error("Failed to send password reset email:", error);
      }
    }

    res.json({ msg: genericPasswordResetMessage });
  } catch (error) {
    console.error("Error in forgot-password route:", error);
    res.json({ msg: genericPasswordResetMessage });
  }
});

router.post("/reset-password/:token", passwordResetLimiter, async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || "");
    const password = String(req.body?.password || "");

    if (!isValidResetToken(token)) {
      res.status(400).json({ msg: "Reset link is invalid or has expired." });
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ msg: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }

    const user = await User.findOne({
      passwordResetToken: hashResetToken(token),
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      res.status(400).json({ msg: "Reset link is invalid or has expired." });
      return;
    }

    user.password = await bcrypt.hash(password, 10);
    user.provider = user.googleId ? user.provider || "google" : "local";
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    // Any session created before the reset must stop working.
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    res.json({ msg: "Password reset successful. You can now sign in." });
  } catch (error) {
    console.error("Error in reset-password route:", error);
    res.status(500).json({ msg: "Unable to reset password." });
  }
});

router.post("/google", loginLimiter, async (req: Request, res: Response) => {
  try {
    const { credential, accessToken } = req.body;
    const googleClientId = process.env.GOOGLE_CLIENT_ID;

    googleAuthDebug("Google auth debug:", {
      step: "request_received",
      googleClientIdExists: Boolean(googleClientId),
      googleClientIdPreview: previewValue(googleClientId),
      hasAccessToken: Boolean(accessToken),
      hasCredential: Boolean(credential),
      origin: req.get("origin") || "missing",
    });

    if (!googleClientId) {
      sendGoogleAuthFailure(res, 500, "missing_google_client_id", "Google authentication is not configured");
      return;
    }

    if (!credential && !accessToken) {
      sendGoogleAuthFailure(res, 400, "missing_google_credential", "Missing Google credential");
      return;
    }

    let payload: any;

    if (credential) {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: googleClientId,
      });
      payload = ticket.getPayload();
    } else {
      googleAuthDebug("Google auth debug:", {
        step: "access_token_flow_started",
        hasAccessToken: Boolean(accessToken),
        googleClientIdExists: Boolean(googleClientId),
        googleClientIdPreview: previewValue(googleClientId),
      });

      const tokenInfoResponse = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
      );
      const tokenInfo = await tokenInfoResponse.json().catch(() => ({})) as {
        aud?: string;
        sub?: string;
        user_id?: string;
      };

      googleAuthDebug("Google auth debug:", {
        step: "tokeninfo_response",
        tokenInfoResponseOk: tokenInfoResponse.ok,
        tokenInfoStatus: tokenInfoResponse.status,
        tokenInfoAudiencePreview: previewValue(tokenInfo.aud),
        tokenInfoAudienceMatchesClientId: tokenInfo.aud === googleClientId,
        hasTokenInfoSubject: Boolean(tokenInfo.sub || tokenInfo.user_id),
      });

      if (!tokenInfoResponse.ok) {
        logGoogleAuthFailure("tokeninfo_request_failed", {
          status: tokenInfoResponse.status,
          hasAudience: Boolean(tokenInfo.aud),
          audiencePreview: previewValue(tokenInfo.aud),
          audienceMatchesClientId: tokenInfo.aud === googleClientId,
          hasSubject: Boolean(tokenInfo.sub || tokenInfo.user_id),
        });
        res.status(401).json({ msg: "Invalid Google credential", reason: "tokeninfo_request_failed" });
        return;
      }

      if (tokenInfo.aud !== googleClientId) {
        logGoogleAuthFailure("tokeninfo_audience_mismatch", {
          hasAudience: Boolean(tokenInfo.aud),
          audiencePreview: previewValue(tokenInfo.aud),
          googleClientIdPreview: previewValue(googleClientId),
          expectedAudienceConfigured: Boolean(googleClientId),
          hasSubject: Boolean(tokenInfo.sub || tokenInfo.user_id),
        });
        res.status(401).json({ msg: "Google credential audience mismatch", reason: "tokeninfo_audience_mismatch" });
        return;
      }

      const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userInfo = await userInfoResponse.json().catch(() => ({})) as any;

      googleAuthDebug("Google auth debug:", {
        step: "userinfo_response",
        userInfoResponseOk: userInfoResponse.ok,
        userInfoStatus: userInfoResponse.status,
        hasUserInfoSubject: Boolean(userInfo.sub),
        hasUserInfoEmail: Boolean(userInfo.email),
      });

      if (!userInfoResponse.ok) {
        logGoogleAuthFailure("userinfo_request_failed", {
          status: userInfoResponse.status,
          hasAudience: Boolean(tokenInfo.aud),
          audiencePreview: previewValue(tokenInfo.aud),
          hasSubject: Boolean(tokenInfo.sub || tokenInfo.user_id),
        });
        res.status(401).json({ msg: "Invalid Google credential", reason: "userinfo_request_failed" });
        return;
      }

      payload = {
        ...userInfo,
        sub: userInfo.sub || tokenInfo.sub || tokenInfo.user_id,
      };
    }

    googleAuthDebug("Google auth debug:", {
      step: "payload_ready",
      hasPayloadSubject: Boolean(payload?.sub),
      hasPayloadEmail: Boolean(payload?.email),
      emailVerified: payload?.email_verified !== false,
    });

    if (!payload?.sub || !payload.email) {
      logGoogleAuthFailure("missing_google_profile_fields", {
        hasSubject: Boolean(payload?.sub),
        hasEmail: Boolean(payload?.email),
      });
      res.status(401).json({ msg: "Invalid Google credential", reason: "missing_google_profile_fields" });
      return;
    }

    if (payload.email_verified === false) {
      logGoogleAuthFailure("google_email_not_verified");
      res.status(401).json({ msg: "Google email is not verified", reason: "google_email_not_verified" });
      return;
    }

    const googleId = payload.sub;
    const email = normalizeEmail(payload.email);
    const name = payload.name || email.split("@")[0];
    const picture = String(payload.picture || "").trim();

    let user;
    let userWasCreated = false;
    try {
      user = await User.findOne({
        $or: [{ googleId }, { email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } }],
      });
      googleAuthDebug("Google auth debug:", {
        step: "mongo_user_lookup",
        lookupSucceeded: true,
        userFound: Boolean(user),
      });
    } catch (error) {
      console.error("Google auth failure:", {
        reason: "mongo_user_lookup_failed",
        name: (error as Error).name,
        message: (error as Error).message,
      });
      res.status(500).json({ msg: "Google authentication failed", reason: "mongo_user_lookup_failed" });
      return;
    }

    if (!user) {
      try {
        user = await User.create({
          name,
          email,
          avatar: picture || getDefaultAvatarUrl(name, email),
          provider: "google",
          googleId,
        });
        userWasCreated = true;
        googleAuthDebug("Google auth debug:", {
          step: "mongo_user_create",
          createSucceeded: true,
        });
      } catch (error) {
        console.error("Google auth failure:", {
          reason: "mongo_user_create_failed",
          name: (error as Error).name,
          message: (error as Error).message,
        });
        res.status(500).json({ msg: "Google authentication failed", reason: "mongo_user_create_failed" });
        return;
      }
    } else {
      let shouldSave = false;

      if (!user.googleId) {
        user.googleId = googleId;
        shouldSave = true;
      }

      if (!user.provider) {
        user.provider = user.password ? "local" : "google";
        shouldSave = true;
      }

      if (shouldSave) {
        try {
          await user.save();
          googleAuthDebug("Google auth debug:", {
            step: "mongo_user_update",
            updateSucceeded: true,
          });
        } catch (error) {
          console.error("Google auth failure:", {
            reason: "mongo_user_update_failed",
            name: (error as Error).name,
            message: (error as Error).message,
          });
          res.status(500).json({ msg: "Google authentication failed", reason: "mongo_user_update_failed" });
          return;
        }
      }
    }

    if (!user.avatar || user.avatar.trim() === "") {
      user.avatar = picture || getDefaultAvatarUrl(user.name, user.email);
      try {
        await user.save();
        googleAuthDebug("Google auth debug:", {
          step: "mongo_user_avatar_update",
          updateSucceeded: true,
        });
      } catch (error) {
        console.error("Google auth failure:", {
          reason: "mongo_user_avatar_update_failed",
          name: (error as Error).name,
          message: (error as Error).message,
        });
        res.status(500).json({ msg: "Google authentication failed", reason: "mongo_user_avatar_update_failed" });
        return;
      }
    }

    const token = buildAuthToken(user);

    if (userWasCreated) {
      void recordAnalyticsEvent(req, "user_registered", "authentication", { provider: "google" }, user._id.toString())
        .catch((error) => console.warn("Google registration analytics failed:", error));
    }

    res.json({
      token,
      user: buildAuthUser(user),
    });
  } catch (error) {
    console.error("Error in Google auth route:", {
      name: (error as Error).name,
      message: (error as Error).message,
    });
    res.status(401).json({ msg: "Google authentication failed", reason: "google_auth_unhandled_error" });
  }
});

router.get("/me", async (req: Request, res: Response) => {
  try {
    const token = readBearerToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({ msg: "Unauthorized: No token provided" });
      return;
    }

    let decoded;
    try {
      decoded = verifyAuthToken(token);
    } catch {
      res.status(401).json({ msg: "Unauthorized: Invalid token" });
      return;
    }

    const user = await User.findById(decoded.id).select("-password");
    if (!user || (user.tokenVersion ?? 0) !== decoded.tokenVersion) {
      res.status(401).json({ msg: "Unauthorized: Session is no longer valid" });
      return;
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: resolveAvatarUrl(user),
      firstLogin: user.firstLogin ?? true,
      isAdmin: hasAdminAccess(user),
    });
  } catch (error) {
    console.error("Error in /me route:", error);
    res.status(500).json({ msg: "Server error" });
  }
});

export default router;
