import mongoose, { Document, Model, Schema, Types } from "mongoose";

export const INTEGRATION_PROVIDERS = ["stremio"] as const;
export const INTEGRATION_STATUSES = ["connected", "disconnected", "reauth_required", "error"] as const;
export const INTEGRATION_SYNC_STATUSES = ["success", "partial", "failed"] as const;

export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];
export type IntegrationSyncStatus = (typeof INTEGRATION_SYNC_STATUSES)[number];

export interface ICredentialEnvelope {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

export interface IUserIntegration extends Document {
  userId: Types.ObjectId;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  credentialEnvelope?: ICredentialEnvelope;
  lastSyncStartedAt?: Date;
  lastSyncCompletedAt?: Date;
  lastSuccessfulSyncAt?: Date;
  lastSyncStatus?: IntegrationSyncStatus;
  lastErrorCode?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const credentialEnvelopeSchema = new Schema<ICredentialEnvelope>(
  {
    ciphertext: { type: String, required: true, minlength: 1, maxlength: 8192 },
    iv: { type: String, required: true, minlength: 1, maxlength: 256 },
    authTag: { type: String, required: true, minlength: 1, maxlength: 256 },
    keyVersion: {
      type: Number,
      required: true,
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      validate: Number.isSafeInteger,
    },
  },
  { _id: false }
);

const userIntegrationSchema = new Schema<IUserIntegration>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    provider: {
      type: String,
      enum: INTEGRATION_PROVIDERS,
      required: true,
      trim: true,
      maxlength: 50,
    },
    status: {
      type: String,
      enum: INTEGRATION_STATUSES,
      required: true,
      default: "disconnected",
    },
    credentialEnvelope: {
      type: credentialEnvelopeSchema,
      select: false,
    },
    lastSyncStartedAt: { type: Date },
    lastSyncCompletedAt: { type: Date },
    lastSuccessfulSyncAt: { type: Date },
    lastSyncStatus: { type: String, enum: INTEGRATION_SYNC_STATUSES },
    lastErrorCode: { type: String, trim: true, maxlength: 128 },
  },
  { timestamps: true }
);

userIntegrationSchema.index({ userId: 1, provider: 1 }, { unique: true });

const UserIntegration: Model<IUserIntegration> =
  mongoose.models.UserIntegration ||
  mongoose.model<IUserIntegration>("UserIntegration", userIntegrationSchema);

export default UserIntegration;
