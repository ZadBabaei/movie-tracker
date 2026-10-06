import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { normalizeUsername, usernameValidationMessage } from "../utils/username";

export interface IUser extends Document {
  name: string;
  username?: string | null;
  discoverable: boolean;
  shareWatchHistory: boolean;
  email: string;
  password?: string;
  provider?: "local" | "google";
  googleId?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  tokenVersion: number;
  watchlist: Types.ObjectId[];
  favorites: Types.ObjectId[];
  favoriteGroups: Types.ObjectId[];
  avatar?: string;
  firstLogin: boolean;
  role: "user" | "admin";
  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    username: {
      type: String,
      select: false,
      set: (value: string | null | undefined) =>
        typeof value === "string" ? normalizeUsername(value) || null : value,
      validate: {
        validator: (value: string | null | undefined) =>
          value == null || !usernameValidationMessage(value),
        message: "Invalid username",
      },
    },
    discoverable: { type: Boolean, default: false, select: false },
    shareWatchHistory: { type: Boolean, default: false, select: false },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: {
      type: String,
      required: function (this: IUser) {
        return this.provider !== "google";
      },
    },
    provider: { type: String, enum: ["local", "google"], default: "local" },
    googleId: { type: String, unique: true, sparse: true },
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },
    // Bumped to invalidate every token already issued for this user.
    tokenVersion: { type: Number, default: 0 },
    watchlist: [{ type: Schema.Types.ObjectId, ref: "Movie", default: [] }],
    favorites: [{ type: Schema.Types.ObjectId, ref: "Movie", default: [] }],
    favoriteGroups: [{ type: Schema.Types.ObjectId, ref: "Group", default: [] }],
    avatar: { type: String, default: "" },
    firstLogin: { type: Boolean, default: true },
    role: { type: String, enum: ["user", "admin"], default: "user", index: true },
  },
  { timestamps: true }
);

// Missing and null usernames are excluded, so legacy accounts need no backfill.
const usernameIndexOptions = {
  name: "unique_profile_username",
  unique: true,
  partialFilterExpression: { username: { $type: "string" } },
};
userSchema.index({ username: 1 }, usernameIndexOptions);

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", userSchema, "users");

let usernameIndexReady: Promise<string> | undefined;

// Do not accept username writes until MongoDB enforces uniqueness, including
// deployments with autoIndex disabled. Failed builds never drop/repair data.
export const ensureUsernameIndex = (): Promise<string> => {
  if (!usernameIndexReady) {
    usernameIndexReady = User.collection.createIndex({ username: 1 }, usernameIndexOptions)
      .catch((error: unknown) => {
        usernameIndexReady = undefined;
        throw error;
      });
  }
  return usernameIndexReady;
};

export default User;
