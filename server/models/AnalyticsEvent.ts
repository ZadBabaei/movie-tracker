import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IAnalyticsEvent extends Document {
  event: string;
  feature: string;
  userId?: Types.ObjectId;
  path?: string;
  country?: string;
  region?: string;
  city?: string;
  device?: "desktop" | "mobile" | "tablet" | "unknown";
  properties?: Record<string, string | number | boolean>;
  createdAt: Date;
}

const analyticsEventSchema = new Schema<IAnalyticsEvent>(
  {
    event: { type: String, required: true, trim: true, maxlength: 80, index: true },
    feature: { type: String, required: true, trim: true, maxlength: 60, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    path: { type: String, default: "", maxlength: 300 },
    country: { type: String, default: "Unknown", maxlength: 80 },
    region: { type: String, default: "", maxlength: 100 },
    city: { type: String, default: "", maxlength: 100 },
    device: {
      type: String,
      enum: ["desktop", "mobile", "tablet", "unknown"],
      default: "unknown",
    },
    properties: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

analyticsEventSchema.index({ createdAt: -1, userId: 1 });
analyticsEventSchema.index({ feature: 1, createdAt: -1 });
analyticsEventSchema.index({ country: 1, createdAt: -1 });

const AnalyticsEvent: Model<IAnalyticsEvent> =
  mongoose.models.AnalyticsEvent ||
  mongoose.model<IAnalyticsEvent>("AnalyticsEvent", analyticsEventSchema);

export default AnalyticsEvent;
