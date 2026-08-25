import { Request, Response, NextFunction } from "express";
import User from "../models/user";
import { readBearerToken, verifyAuthToken } from "../utils/authToken";

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = readBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ msg: "Unauthorized: No token provided" });
    return;
  }

  try {
    const decoded = verifyAuthToken(token);

    // The account is re-checked on every request so a deleted user, or a
    // session invalidated by a password reset, stops working immediately
    // instead of staying valid until the token expires.
    const user = await User.findById(decoded.id).select("tokenVersion").lean<{
      _id: unknown;
      tokenVersion?: number;
    }>();

    if (!user || (user.tokenVersion ?? 0) !== decoded.tokenVersion) {
      res.status(401).json({ msg: "Unauthorized: Session is no longer valid" });
      return;
    }

    req.user = { id: decoded.id };
    next();
  } catch {
    res.status(401).json({ msg: "Unauthorized: Invalid token" });
  }
};
