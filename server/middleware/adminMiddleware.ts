import { NextFunction, Request, Response } from "express";
import User from "../models/user";

const configuredAdminEmails = () =>
  new Set(
    String(process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );

export const hasAdminAccess = (user?: { email?: string; role?: string } | null) =>
  Boolean(
    user?.email &&
      (user.role === "admin" || configuredAdminEmails().has(user.email.toLowerCase()))
  );

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ msg: "Unauthorized" });
      return;
    }

    const user = await User.findById(req.user.id).select("email role").lean();
    const isAdmin = hasAdminAccess(user);

    if (!isAdmin) {
      res.status(403).json({ msg: "Owner access required" });
      return;
    }

    next();
  } catch (error) {
    console.error("Admin authorization failed:", error);
    res.status(500).json({ msg: "Unable to verify owner access" });
  }
};
