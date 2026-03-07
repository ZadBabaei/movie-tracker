import { Types } from "mongoose";

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
}

export interface IMovie {
  _id: Types.ObjectId;
  title: string;
  imdbID: string;
  poster?: string;
  vote_average: number;
  addedBy?: Types.ObjectId;
}

export interface IPollMovie {
  tmdbId: string;
  title: string;
  poster_path?: string;
  vote_average?: number;
  selected?: number | null;
}

export interface IPollVote {
  userId: Types.ObjectId;
  movieTmdbId: string;
  rank: number;
}

export interface IPoll {
  _id: Types.ObjectId;
  groupId: Types.ObjectId;
  creator: Types.ObjectId;
  movies: IPollMovie[];
  votes: IPollVote[];
  status: "active" | "completed" | "cancelled";
  winningMovieTmdbId?: string;
  createdAt: Date;
  expiresAt?: Date;
}

export interface IGroupInvitation {
  userId: Types.ObjectId;
  inviterName?: string;
}

export interface IGroup {
  _id: Types.ObjectId;
  name: string;
  creator: Types.ObjectId;
  members: Types.ObjectId[];
  pendingInvitations: IGroupInvitation[];
  movies: Types.ObjectId[];
  currentPoll?: Types.ObjectId;
  pollHistory: Types.ObjectId[];
  hasActivePoll(): Promise<boolean>;
}
