import { Types } from "mongoose";
import UserIntegration, {
  ICredentialEnvelope,
  IUserIntegration,
} from "../../models/UserIntegration";
import {
  decryptCredential,
  encryptCredential,
} from "./credentialCrypto";
import stremioClient, {
  StremioClientError,
  StremioConnectionClient,
} from "./stremioClient";

export interface SanitizedIntegrationStatus {
  provider: "stremio";
  status: IUserIntegration["status"];
  connected: boolean;
  lastSyncCompletedAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  lastSyncStatus: IUserIntegration["lastSyncStatus"] | null;
  lastErrorCode: string | null;
}

export interface StremioIntegrationService {
  listForUser(userId: string): Promise<SanitizedIntegrationStatus[]>;
  connect(userId: string, email: string, password: string): Promise<SanitizedIntegrationStatus>;
  disconnect(userId: string): Promise<{
    provider: "stremio";
    status: "disconnected";
    connected: false;
    remoteRevocationConfirmed: boolean;
  }>;
  markReauthRequired(userId: string, credentialVersion: number): Promise<boolean>;
}

export class IntegrationLifecycleError extends Error {
  constructor(public readonly code: "invalid_input") {
    super(code);
    this.name = "IntegrationLifecycleError";
  }
}

interface CryptoDependency {
  encryptCredential(value: string): ICredentialEnvelope;
  decryptCredential(envelope: ICredentialEnvelope): string;
}

const statusView = (integration: Pick<
  IUserIntegration,
  | "provider"
  | "status"
  | "lastSyncCompletedAt"
  | "lastSuccessfulSyncAt"
  | "lastSyncStatus"
  | "lastErrorCode"
>): SanitizedIntegrationStatus => ({
  provider: integration.provider,
  status: integration.status,
  connected: integration.status === "connected",
  lastSyncCompletedAt: integration.lastSyncCompletedAt || null,
  lastSuccessfulSyncAt: integration.lastSuccessfulSyncAt || null,
  lastSyncStatus: integration.lastSyncStatus || null,
  lastErrorCode: integration.lastErrorCode || null,
});

const warnRevocationFailure = (userId: string, code: string) => {
  console.warn("Stremio session revocation could not be confirmed.", {
    provider: "stremio",
    userId,
    code: code.slice(0, 128),
  });
};

const validateConnectInput = (email: string, password: string) => {
  if (
    typeof email !== "string" ||
    !email ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof password !== "string" ||
    !password ||
    password.length > 1024
  ) {
    throw new IntegrationLifecycleError("invalid_input");
  }
};

const isDuplicateKeyError = (error: unknown) =>
  Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);

const swapCredential = async (
  userId: Types.ObjectId,
  credentialEnvelope: ICredentialEnvelope
) => {
  const filter = { userId, provider: "stremio" as const };
  const update = {
    $set: {
      status: "connected" as const,
      credentialEnvelope,
    },
    $unset: { lastErrorCode: 1 as const },
    $inc: { credentialVersion: 1 as const },
  };
  const swap = (upsert: boolean) =>
    UserIntegration.findOneAndUpdate(filter, update, {
      upsert,
      new: false,
      runValidators: true,
    }).select("+credentialEnvelope");

  try {
    return await swap(true);
  } catch (error) {
    // Concurrent first-time upserts may race on the unique user/provider index.
    // Once one insert wins, retry as an update so this request atomically
    // receives and later revokes the credential it actually displaced.
    if (!isDuplicateKeyError(error)) throw error;
    const displaced = await swap(false);
    if (!displaced) throw error;
    return displaced;
  }
};

export const createStremioIntegrationService = ({
  client = stremioClient,
  cryptoService = { encryptCredential, decryptCredential },
}: {
  client?: StremioConnectionClient;
  cryptoService?: CryptoDependency;
} = {}): StremioIntegrationService => ({
  async listForUser(userId) {
    const integrations = await UserIntegration.find({
      userId: new Types.ObjectId(userId),
    })
      .select(
        "provider status lastSyncCompletedAt lastSuccessfulSyncAt lastSyncStatus lastErrorCode"
      )
      .sort({ provider: 1 })
      .lean<IUserIntegration[]>();
    return integrations.map(statusView);
  },

  async connect(userId, email, password) {
    validateConnectInput(email, password);
    const { authKey } = await client.login(email, password);
    const newEnvelope = cryptoService.encryptCredential(authKey);
    const objectUserId = new Types.ObjectId(userId);

    let displaced: IUserIntegration | null;
    try {
      displaced = await swapCredential(objectUserId, newEnvelope);
    } catch (error) {
      try {
        await client.logout(authKey);
      } catch {
        // The new provider session is not stored; local consistency still wins.
      }
      throw error;
    }

    if (displaced?.credentialEnvelope) {
      try {
        const previousAuthKey = cryptoService.decryptCredential(displaced.credentialEnvelope);
        if (previousAuthKey !== authKey) await client.logout(previousAuthKey);
      } catch (error) {
        const code = error instanceof StremioClientError ? error.code : "revocation_failed";
        warnRevocationFailure(userId, code);
      }
    }

    return statusView({
      provider: "stremio",
      status: "connected",
      lastSyncCompletedAt: displaced?.lastSyncCompletedAt,
      lastSuccessfulSyncAt: displaced?.lastSuccessfulSyncAt,
      lastSyncStatus: displaced?.lastSyncStatus,
      lastErrorCode: undefined,
    });
  },

  async disconnect(userId) {
    // Destroy the locally stored credential before making any remote call.
    // Returning the previous document ensures this request revokes only the
    // credential displaced by its own atomic state transition.
    const displaced = await UserIntegration.findOneAndUpdate(
      {
        userId: new Types.ObjectId(userId),
        provider: "stremio",
      },
      {
        $set: { status: "disconnected" },
        $unset: { credentialEnvelope: 1, lastErrorCode: 1 },
      },
      { new: false, runValidators: true }
    ).select("+credentialEnvelope");

    let remoteRevocationConfirmed = false;
    if (displaced?.credentialEnvelope) {
      try {
        const authKey = cryptoService.decryptCredential(displaced.credentialEnvelope);
        await client.logout(authKey);
        remoteRevocationConfirmed = true;
      } catch (error) {
        if (error instanceof StremioClientError && error.code === "invalid_session") {
          remoteRevocationConfirmed = true;
        } else {
          const code = error instanceof StremioClientError ? error.code : "revocation_failed";
          warnRevocationFailure(userId, code);
        }
      }
    }

    return {
      provider: "stremio",
      status: "disconnected",
      connected: false,
      remoteRevocationConfirmed,
    };
  },

  async markReauthRequired(userId, credentialVersion) {
    const versionCondition =
      credentialVersion === 0
        ? { $or: [{ credentialVersion: 0 }, { credentialVersion: { $exists: false } }] }
        : { credentialVersion };
    const result = await UserIntegration.updateOne(
      {
        userId: new Types.ObjectId(userId),
        provider: "stremio",
        status: "connected",
        ...versionCondition,
      },
      {
        $set: {
          status: "reauth_required",
          lastErrorCode: "provider_session_invalid",
        },
        $unset: { credentialEnvelope: 1 },
      }
    );
    return result.modifiedCount === 1;
  },
});

const stremioIntegrationService = createStremioIntegrationService();

export default stremioIntegrationService;
