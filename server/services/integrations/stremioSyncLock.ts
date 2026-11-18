import { randomUUID } from "crypto";
import { Types } from "mongoose";
import UserIntegration, { IntegrationSyncTrigger } from "../../models/UserIntegration";

// A full Stremio pipeline (snapshot, episode catalog lookups, matching and
// import) normally finishes in seconds to a few minutes. The lease outlives
// that comfortably, and if a process dies mid-sync the lease simply expires.
const DEFAULT_LEASE_MS = 30 * 60 * 1000;

const leaseMs = () => {
  const configured = Number(process.env.STREMIO_SYNC_LOCK_TTL_MS);
  return Number.isFinite(configured) && configured >= 60_000 ? configured : DEFAULT_LEASE_MS;
};

export type StremioSyncLockResult =
  | { status: "acquired"; token: string }
  | { status: "busy" }
  | { status: "missing" };

export interface StremioSyncLockService {
  acquire(userId: string, trigger: IntegrationSyncTrigger): Promise<StremioSyncLockResult>;
  release(userId: string, token: string): Promise<void>;
}

export const createStremioSyncLockService = ({
  now = () => new Date(),
  ttlMs = leaseMs,
}: {
  now?: () => Date;
  ttlMs?: () => number;
} = {}): StremioSyncLockService => ({
  async acquire(userId, trigger) {
    if (!Types.ObjectId.isValid(userId)) return { status: "missing" };
    const owner = { userId: new Types.ObjectId(userId), provider: "stremio" as const };
    const startedAt = now();
    const token = randomUUID();
    // Single atomic conditional write: only one caller, on any instance, can
    // move the lease from free/expired to held.
    const result = await UserIntegration.updateOne(
      {
        ...owner,
        $or: [
          { syncLockUntil: { $exists: false } },
          { syncLockUntil: null },
          { syncLockUntil: { $lte: startedAt } },
        ],
      },
      {
        $set: {
          syncLockUntil: new Date(startedAt.getTime() + ttlMs()),
          syncLockToken: token,
          lastSyncTrigger: trigger,
        },
      }
    );
    if (result.matchedCount === 1) return { status: "acquired", token };
    return (await UserIntegration.exists(owner)) ? { status: "busy" } : { status: "missing" };
  },

  async release(userId, token) {
    if (!Types.ObjectId.isValid(userId)) return;
    // Token-scoped so a caller whose lease expired and was reclaimed can never
    // release the new holder's lease.
    await UserIntegration.updateOne(
      { userId: new Types.ObjectId(userId), provider: "stremio", syncLockToken: token },
      { $unset: { syncLockUntil: 1, syncLockToken: 1 } }
    );
  },
});

const stremioSyncLockService = createStremioSyncLockService();

export default stremioSyncLockService;
