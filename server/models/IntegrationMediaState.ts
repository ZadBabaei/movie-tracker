import mongoose, { Document, Model, Schema, Types } from "mongoose";

export const PROVIDER_MEDIA_TYPES = ["movie", "tv_episode"] as const;
export const IDENTIFIER_NAMESPACES = ["imdb", "tmdb", "provider", "unknown"] as const;
export const INTEGRATION_MATCH_STATUSES = [
  "unresolved",
  "matched",
  "movie_missing",
  "unsupported_identifier",
  "retryable_error",
] as const;
export const INTEGRATION_IMPORT_STATUSES = ["pending", "imported", "suppressed"] as const;
export const TIMESTAMP_CONFIDENCE_VALUES = [
  "provider_last_watched",
  "observed_at",
  "unknown",
] as const;
export const INTEGRATION_SUPPRESSION_REASONS = [
  "local_history_deleted",
  "user_suppressed",
] as const;

export type ProviderMediaType = (typeof PROVIDER_MEDIA_TYPES)[number];
export type IdentifierNamespace = (typeof IDENTIFIER_NAMESPACES)[number];
export type IntegrationMatchStatus = (typeof INTEGRATION_MATCH_STATUSES)[number];
export type IntegrationImportStatus = (typeof INTEGRATION_IMPORT_STATUSES)[number];
export type TimestampConfidence = (typeof TIMESTAMP_CONFIDENCE_VALUES)[number];
export type IntegrationSuppressionReason = (typeof INTEGRATION_SUPPRESSION_REASONS)[number];

export interface IIntegrationMediaState extends Document {
  integrationId: Types.ObjectId;
  providerMediaType: ProviderMediaType;
  providerItemId: string;
  identifierNamespace: IdentifierNamespace;
  observedCredentialVersion: number;
  providerRevision?: string;
  providerLastWatchedAt?: Date;
  completed: boolean;
  removed: boolean;
  lastSeenAt: Date;
  matchStatus: IntegrationMatchStatus;
  matchedMovieId?: Types.ObjectId;
  matchedTmdbId?: number;
  importStatus: IntegrationImportStatus;
  importedHistoryEntryId?: Types.ObjectId;
  importReservationCredentialVersion?: number;
  importedAt?: Date;
  timestampConfidence?: TimestampConfidence;
  suppressionReason?: IntegrationSuppressionReason;
  lastErrorCode?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const integrationMediaStateSchema = new Schema<IIntegrationMediaState>(
  {
    integrationId: {
      type: Schema.Types.ObjectId,
      ref: "UserIntegration",
      required: true,
    },
    providerMediaType: {
      type: String,
      enum: PROVIDER_MEDIA_TYPES,
      required: true,
    },
    providerItemId: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 1024,
    },
    identifierNamespace: {
      type: String,
      enum: IDENTIFIER_NAMESPACES,
      required: true,
    },
    observedCredentialVersion: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      validate: Number.isSafeInteger,
    },
    providerRevision: { type: String, maxlength: 1024 },
    providerLastWatchedAt: { type: Date },
    completed: { type: Boolean, required: true, default: false },
    removed: { type: Boolean, required: true, default: false },
    lastSeenAt: { type: Date, required: true, default: Date.now },
    matchStatus: {
      type: String,
      enum: INTEGRATION_MATCH_STATUSES,
      required: true,
      default: "unresolved",
    },
    matchedMovieId: { type: Schema.Types.ObjectId, ref: "Movie" },
    matchedTmdbId: {
      type: Number,
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      validate: Number.isSafeInteger,
    },
    importStatus: {
      type: String,
      enum: INTEGRATION_IMPORT_STATUSES,
      required: true,
      default: "pending",
    },
    importedHistoryEntryId: {
      type: Schema.Types.ObjectId,
      ref: "WatchHistoryEntry",
    },
    importReservationCredentialVersion: {
      type: Number,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      validate: Number.isSafeInteger,
    },
    importedAt: { type: Date },
    timestampConfidence: {
      type: String,
      enum: TIMESTAMP_CONFIDENCE_VALUES,
      default: "unknown",
    },
    suppressionReason: {
      type: String,
      enum: INTEGRATION_SUPPRESSION_REASONS,
      maxlength: 64,
    },
    lastErrorCode: { type: String, trim: true, maxlength: 128 },
  },
  { timestamps: true }
);

integrationMediaStateSchema.index(
  {
    integrationId: 1,
    providerMediaType: 1,
    identifierNamespace: 1,
    providerItemId: 1,
  },
  { unique: true }
);
integrationMediaStateSchema.index(
  { importedHistoryEntryId: 1 },
  {
    unique: true,
    partialFilterExpression: { importedHistoryEntryId: { $exists: true } },
  }
);

const IntegrationMediaState: Model<IIntegrationMediaState> =
  mongoose.models.IntegrationMediaState ||
  mongoose.model<IIntegrationMediaState>("IntegrationMediaState", integrationMediaStateSchema);

export default IntegrationMediaState;
