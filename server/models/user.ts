import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  watchlist: Types.ObjectId[];
  favorites: Types.ObjectId[];
  avatar?: string;
  firstLogin: boolean;
}

const userSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  watchlist: [{ type: Schema.Types.ObjectId, ref: "Movie", default: [] }],
  favorites: [{ type: Schema.Types.ObjectId, ref: "Movie", default: [] }],
  avatar: { type: String, default: "" },
  firstLogin: { type: Boolean, default: true },
});

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", userSchema, "users");

export default User;
