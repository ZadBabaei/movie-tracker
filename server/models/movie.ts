import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IMovie extends Document {
  title: string;
  imdbID: string;
  poster?: string;
  vote_average: number;
  addedBy?: Types.ObjectId;
}

const MovieSchema = new Schema<IMovie>({
  title: { type: String, required: true },
  imdbID: { type: String, unique: true, required: true },
  poster: { type: String },
  vote_average: { type: Number, default: 0 },
  addedBy: { type: Schema.Types.ObjectId, ref: "User" },
});

const Movie: Model<IMovie> = mongoose.model<IMovie>("Movie", MovieSchema);

export default Movie;
