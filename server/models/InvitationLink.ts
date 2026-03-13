import mongoose, { Schema, Document, Model, Types } from "mongoose";
import crypto from "crypto";

export interface IInvitationLink extends Document {
  token: string;
  groupId: Types.ObjectId;
  createdBy: Types.ObjectId;
  expiresAt: Date;
  uses: number;
}

const invitationLinkSchema = new Schema<IInvitationLink>(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      default: () => crypto.randomUUID(),
    },
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
    uses: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// TTL index for automatic expiry cleanup (token index already created via unique: true)
invitationLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const InvitationLink: Model<IInvitationLink> =
  mongoose.models.InvitationLink ||
  mongoose.model<IInvitationLink>("InvitationLink", invitationLinkSchema);

export default InvitationLink;
