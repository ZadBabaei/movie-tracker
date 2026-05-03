import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  provider?: "local" | "google";
  googleId?: string;
  watchlist: Types.ObjectId[];
  favorites: Types.ObjectId[];
  favoriteGroups: Types.ObjectId[];
  avatar?: string;
  firstLogin: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: {
      type: String,
      required: function (this: IUser) {
        return this.provider !== "google";
      },
    },
    provider: { type: String, enum: ["local", "google"], default: "local" },
    googleId: { type: String, unique: true, sparse: true },
    watchlist: [{ type: Schema.Types.ObjectId, ref: "Movie", default: [] }],
    favorites: [{ type: Schema.Types.ObjectId, ref: "Movie", default: [] }],
    favoriteGroups: [{ type: Schema.Types.ObjectId, ref: "Group", default: [] }],
    avatar: { type: String, default: "" },
    firstLogin: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", userSchema, "users");

export default User;
