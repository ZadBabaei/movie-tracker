import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type BugSeverity = "Low" | "Medium" | "High" | "Critical";
export type BugStatus = "open" | "in-progress" | "fixed" | "closed";

export interface IBugReport extends Document {
  userId: Types.ObjectId;
  userEmail?: string;
  userName?: string;
  title: string;
  description: string;
  stepsToReproduce: string;
  expectedResult: string;
  actualResult: string;
  affectedPage: string;
  severity: BugSeverity;
  pageUrl: string;
  browserInfo: string;
  screenshotUrl?: string;
  status: BugStatus;
  githubIssueUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const bugReportSchema = new Schema<IBugReport>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userEmail: { type: String, default: "" },
    userName: { type: String, default: "" },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    stepsToReproduce: { type: String, required: true, trim: true, maxlength: 4000 },
    expectedResult: { type: String, required: true, trim: true, maxlength: 2000 },
    actualResult: { type: String, required: true, trim: true, maxlength: 2000 },
    affectedPage: { type: String, required: true, trim: true, maxlength: 160 },
    severity: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    pageUrl: { type: String, required: true, trim: true, maxlength: 1000 },
    browserInfo: { type: String, required: true, trim: true, maxlength: 1000 },
    screenshotUrl: { type: String, default: "" },
    status: {
      type: String,
      enum: ["open", "in-progress", "fixed", "closed"],
      default: "open",
    },
    githubIssueUrl: { type: String, default: "" },
  },
  { timestamps: true }
);

const BugReport: Model<IBugReport> =
  mongoose.models.BugReport || mongoose.model<IBugReport>("BugReport", bugReportSchema);

export default BugReport;
