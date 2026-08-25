import { Request, Response, NextFunction } from "express";
import User from "../models/user";
import {
  REFRESHED_TOKEN_HEADER,
  readBearerToken,
  shouldRenewToken,
  signAuthToken,
  verifyAuthToken,
} from "../utils/authToken";

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
    const user = await User.findById(decoded.id).select("name tokenVersion").lean<{
      _id: unknown;
      name?: string;
      tokenVersion?: number;
    }>();

    if (!user || (user.tokenVersion ?? 0) !== decoded.tokenVersion) {
      res.status(401).json({ msg: "Unauthorized: Session is no longer valid" });
      return;
    }

    // Slide the session forward. A device that keeps being used keeps working;
    // only one left idle past the token lifetime has to sign in again. The
    // client swaps the token in when it sees this header.
    if (shouldRenewToken(decoded.iat)) {
      res.setHeader(
        REFRESHED_TOKEN_HEADER,
        signAuthToken({
          _id: decoded.id,
          name: user.name,
          tokenVersion: user.tokenVersion ?? 0,
        })
      );
    }

    req.user = { id: decoded.id };
    next();
  } catch {
    res.status(401).json({ msg: "Unauthorized: Invalid token" });
  }
};
