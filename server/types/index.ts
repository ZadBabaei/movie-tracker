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
}

export interface IPollVote {
  userId: Types.ObjectId;
  rankings: {
    movieTmdbId: string;
    rank: number;
  }[];
}

export interface IPollResult {
  mode?: "ranked" | "runoff" | "randomTieBreak";
  lowestScoreWins?: boolean;
  randomTieBreak?: boolean;
  movies?: {
    movieTmdbId: string;
    title?: string;
    score: number;
  }[];
}

export interface IPoll {
  _id: Types.ObjectId;
  groupId: Types.ObjectId;
  creator: Types.ObjectId;
  movies: IPollMovie[];
  votes: IPollVote[];
  status: "active" | "completed" | "cancelled";
  round: number;
  winningMovieTmdbId?: string;
  result?: IPollResult;
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
