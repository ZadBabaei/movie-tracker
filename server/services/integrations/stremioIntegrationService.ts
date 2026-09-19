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
  markReauthRequired(userId: string): Promise<void>;
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
    const existing = await UserIntegration.findOne({
      userId: objectUserId,
      provider: "stremio",
    }).select("+credentialEnvelope");

    let connected: IUserIntegration;
    try {
      connected = await UserIntegration.findOneAndUpdate(
        { userId: objectUserId, provider: "stremio" },
        {
          $set: {
            status: "connected",
            credentialEnvelope: newEnvelope,
          },
          $unset: { lastErrorCode: 1 },
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      ).orFail();
    } catch (error) {
      try {
        await client.logout(authKey);
      } catch {
        // The new provider session is not stored; local consistency still wins.
      }
      throw error;
    }

    if (existing?.credentialEnvelope) {
      try {
        const previousAuthKey = cryptoService.decryptCredential(existing.credentialEnvelope);
        if (previousAuthKey !== authKey) await client.logout(previousAuthKey);
      } catch (error) {
        const code = error instanceof StremioClientError ? error.code : "revocation_failed";
        warnRevocationFailure(userId, code);
      }
    }

    return statusView(connected);
  },

  async disconnect(userId) {
    const integration = await UserIntegration.findOne({
      userId: new Types.ObjectId(userId),
      provider: "stremio",
    }).select("+credentialEnvelope");

    let remoteRevocationConfirmed = false;
    if (integration?.credentialEnvelope) {
      try {
        const authKey = cryptoService.decryptCredential(integration.credentialEnvelope);
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

    if (integration) {
      integration.status = "disconnected";
      integration.credentialEnvelope = undefined;
      integration.lastErrorCode = undefined;
      await integration.save();
    }

    return {
      provider: "stremio",
      status: "disconnected",
      connected: false,
      remoteRevocationConfirmed,
    };
  },

  async markReauthRequired(userId) {
    await UserIntegration.updateOne(
      { userId: new Types.ObjectId(userId), provider: "stremio" },
      {
        $set: {
          status: "reauth_required",
          lastErrorCode: "provider_session_invalid",
        },
        $unset: { credentialEnvelope: 1 },
      }
    );
  },
});

const stremioIntegrationService = createStremioIntegrationService();

export default stremioIntegrationService;
