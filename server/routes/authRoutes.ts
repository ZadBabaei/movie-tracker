import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import User from "../models/user";
import { sendPasswordResetEmail } from "../utils/emailService";
import { getDefaultAvatarUrl } from "../utils/avatar";
import { hasAdminAccess } from "../middleware/adminMiddleware";
import { recordAnalyticsEvent } from "../utils/analytics";

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const buildAuthToken = (user: any) =>
  jwt.sign(
    { id: user._id, name: user.name },
    process.env.JWT_SECRET as string,
    { expiresIn: "30d" }
  );

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
const forgotPasswordAttempts = new Map<string, { count: number; resetAt: number }>();
const FORGOT_PASSWORD_WINDOW_MS = 15 * 60 * 1000;
const FORGOT_PASSWORD_MAX_ATTEMPTS = 5;

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

const isForgotPasswordRateLimited = (email: string, ip?: string) => {
  const now = Date.now();
  const key = `${email}:${ip || "unknown"}`;
  const current = forgotPasswordAttempts.get(key);

  if (!current || current.resetAt <= now) {
    forgotPasswordAttempts.set(key, { count: 1, resetAt: now + FORGOT_PASSWORD_WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > FORGOT_PASSWORD_MAX_ATTEMPTS;
};

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { password, avatar } = req.body;
    const name = String(req.body?.name || "").trim();
    const email = normalizeEmail(req.body?.email);
    if (!name || !email || !password) {
      res.status(400).json({ msg: "Please fill in all fields" });
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
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.post("/login", async (req: Request, res: Response) => {
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

router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      res.json({ msg: genericPasswordResetMessage });
      return;
    }

    if (isForgotPasswordRateLimited(email, req.ip)) {
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

router.post("/reset-password/:token", async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || "");
    const password = String(req.body?.password || "");

    if (!isValidResetToken(token)) {
      res.status(400).json({ msg: "Reset link is invalid or has expired." });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ msg: "Password must be at least 8 characters." });
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
    await user.save();

    res.json({ msg: "Password reset successful. You can now sign in." });
  } catch (error) {
    console.error("Error in reset-password route:", error);
    res.status(500).json({ msg: "Unable to reset password." });
  }
});

router.post("/google", async (req: Request, res: Response) => {
  try {
    const { credential, accessToken } = req.body;
    const googleClientId = process.env.GOOGLE_CLIENT_ID;

    console.info("Google auth debug:", {
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
      console.info("Google auth debug:", {
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

      console.info("Google auth debug:", {
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

      console.info("Google auth debug:", {
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

    console.info("Google auth debug:", {
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
      console.info("Google auth debug:", {
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
        console.info("Google auth debug:", {
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
          console.info("Google auth debug:", {
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
        console.info("Google auth debug:", {
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
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ msg: "Unauthorized: No token provided" });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      res.status(404).json({ msg: "User not found" });
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

router.get("/search", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ msg: "Unauthorized: No token provided" });
      return;
    }

    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.JWT_SECRET as string);

    const { query } = req.query as { query: string };
    if (!query) {
      res.json([]);
      return;
    }

    const users = await User.find({
      $or: [
        { name: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ],
    })
      .select("_id name email")
      .limit(10);

    res.json(users);
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

export default router;
