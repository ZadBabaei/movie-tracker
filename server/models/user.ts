import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IUser extends Document {
  name: string;
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

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", userSchema, "users");

export default User;
