import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import Group from "../models/Groups";

export interface GroupAccessSummary {
  _id: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
  creator: mongoose.Types.ObjectId;
}

export const isGroupMember = (
  group: { members?: { toString(): string }[] } | null | undefined,
  userId: string
) => Boolean(group?.members?.some((memberId) => memberId.toString() === userId));

export const isGroupCreator = (
  group: { creator?: { toString(): string } } | null | undefined,
  userId: string
) => Boolean(group?.creator && group.creator.toString() === userId);

// Loads a group by id and confirms the caller belongs to it. On denial the
// response is already sent and null is returned, so callers just bail out.
export const loadGroupForMember = async (
  res: Response,
  groupId: unknown,
  userId: string
): Promise<GroupAccessSummary | null> => {
  const id = String(groupId ?? "");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ msg: "Invalid group id." });
    return null;
  }

  const group = await Group.findById(id)
    .select("_id members creator")
    .lean<GroupAccessSummary>();

  if (!group) {
    res.status(404).json({ msg: "Group not found" });
    return null;
  }

  if (!isGroupMember(group, userId)) {
    res.status(403).json({ msg: "You are not a member of this group." });
    return null;
  }

  return group;
};

// Route guard for endpoints that name the group directly in the URL or body.
// Routes that reach the group indirectly (via a poll, a slug, an invite token)
// should call loadGroupForMember once they have resolved the group id.
export const requireGroupMember =
  (
    resolveGroupId: (req: Request) => unknown = (req) =>
      req.params.groupId ?? req.params.id ?? req.body?.groupId
  ) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ msg: "Unauthorized" });
        return;
      }

      const group = await loadGroupForMember(res, resolveGroupId(req), userId);
      if (!group) return;

      next();
    } catch (error) {
      console.error("Group membership check failed:", error);
      res.status(500).json({ msg: "Unable to verify group access" });
    }
  };
