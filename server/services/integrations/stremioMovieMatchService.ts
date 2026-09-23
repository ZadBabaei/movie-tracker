import { Types } from "mongoose";
import IntegrationMediaState, {
  IIntegrationMediaState,
  IntegrationMatchStatus,
} from "../../models/IntegrationMediaState";
import Movie, { IMovie } from "../../models/movie";
import UserIntegration from "../../models/UserIntegration";
import { currentStremioProviderStateFilter } from "./stremioSyncService";
import tmdbMovieResolver, {
  ResolvedTmdbMovie,
  TmdbMovieResolver,
  TmdbMovieResolverError,
} from "./tmdbMovieResolver";

const DEFAULT_CONCURRENCY = 6;
const CANDIDATE_MATCH_STATUSES: IntegrationMatchStatus[] = [
  "unresolved",
  "retryable_error",
];

export interface StremioMovieMatchSummary {
  examined: number;
  matched: number;
  movieMissing: number;
  unsupported: number;
  retryableErrors: number;
  skippedStale: number;
}

export type StremioMovieMatchResult =
  | "matched"
  | "movie_missing"
  | "unsupported_identifier"
  | "retryable_error"
  | "integration_changed";

const versionCondition = (credentialVersion: number) =>
  credentialVersion === 0
    ? { $or: [{ credentialVersion: 0 }, { credentialVersion: { $exists: false } }] }
    : { credentialVersion };

const isDuplicateKey = (error: unknown) =>
  Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);

const findOrCreateCanonicalMovie = async (
  resolved: ResolvedTmdbMovie,
  userId: Types.ObjectId
): Promise<IMovie> => {
  const imdbID = `tmdb-${resolved.tmdbId}`;
  try {
    const movie = await Movie.findOneAndUpdate(
      { imdbID },
      {
        $setOnInsert: {
          imdbID,
          title: resolved.title,
          poster: resolved.posterPath,
          vote_average: resolved.voteAverage,
          addedBy: userId,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (!movie) throw new Error("canonical_movie_upsert_failed");
    return movie;
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const winner = await Movie.findOne({ imdbID });
    if (!winner) throw error;
    return winner;
  }
};

const matchingFilter = (
  state: IIntegrationMediaState,
  integrationId: Types.ObjectId,
  credentialVersion: number
) => ({
  _id: state._id,
  integrationId,
  ...(credentialVersion === 0
    ? {
        $or: [
          { observedCredentialVersion: 0 },
          { observedCredentialVersion: { $exists: false } },
        ],
      }
    : { observedCredentialVersion: credentialVersion }),
  matchStatus: { $in: CANDIDATE_MATCH_STATUSES },
});

export const createStremioMovieMatchService = ({
  resolver = tmdbMovieResolver,
  concurrency = DEFAULT_CONCURRENCY,
}: {
  resolver?: TmdbMovieResolver;
  concurrency?: number;
} = {}) => {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    throw new RangeError("concurrency must be an integer between 1 and 32");
  }

  return {
    async matchCurrentStremioMovies(userId: string): Promise<StremioMovieMatchSummary> {
      const ownerId = new Types.ObjectId(userId);
      const integration = await UserIntegration.findOne({
        userId: ownerId,
        provider: "stremio",
        status: "connected",
      });
      if (!integration) {
        return {
          examined: 0,
          matched: 0,
          movieMissing: 0,
          unsupported: 0,
          retryableErrors: 0,
          skippedStale: 0,
        };
      }

      const credentialVersion = integration.credentialVersion ?? 0;
      const integrationFilter = {
        _id: integration._id,
        status: "connected" as const,
        ...versionCondition(credentialVersion),
      };
      const candidates = await IntegrationMediaState.find({
        ...currentStremioProviderStateFilter(integration._id, credentialVersion),
        providerMediaType: "movie",
        completed: true,
        matchStatus: { $in: CANDIDATE_MATCH_STATUSES },
      });
      const summary: StremioMovieMatchSummary = {
        examined: candidates.length,
        matched: 0,
        movieMissing: 0,
        unsupported: 0,
        retryableErrors: 0,
        skippedStale: 0,
      };

      const transition = async (
        state: IIntegrationMediaState,
        status: Exclude<IntegrationMatchStatus, "unresolved">,
        options: { movie?: IMovie; tmdbId?: number; errorCode?: string } = {}
      ): Promise<boolean> => {
        if (!(await UserIntegration.exists(integrationFilter))) return false;
        const unset = {
          ...(!options.movie ? { matchedMovieId: 1, matchedTmdbId: 1 } : {}),
          ...(!options.errorCode ? { lastErrorCode: 1 } : {}),
        };
        const update = await IntegrationMediaState.updateOne(
          matchingFilter(state, integration._id, credentialVersion),
          {
            $set: {
              matchStatus: status,
              ...(options.movie && options.tmdbId
                ? { matchedMovieId: options.movie._id, matchedTmdbId: options.tmdbId }
                : {}),
              ...(options.errorCode ? { lastErrorCode: options.errorCode.slice(0, 128) } : {}),
            },
            ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
          }
        );
        return update.matchedCount === 1;
      };

      const processState = async (state: IIntegrationMediaState): Promise<StremioMovieMatchResult> => {
        if (state.identifierNamespace !== "imdb") {
          return (await transition(state, "unsupported_identifier"))
            ? "unsupported_identifier"
            : "integration_changed";
        }

        try {
          const resolved = await resolver.resolveByImdbId(state.providerItemId);
          if (!resolved) {
            return (await transition(state, "movie_missing"))
              ? "movie_missing"
              : "integration_changed";
          }
          // This check keeps stale account work from creating a global Movie in
          // the normal reconnect race. The state CAS below is the final guard.
          if (!(await UserIntegration.exists(integrationFilter))) return "integration_changed";
          const movie = await findOrCreateCanonicalMovie(resolved, ownerId);
          return (await transition(state, "matched", { movie, tmdbId: resolved.tmdbId }))
            ? "matched"
            : "integration_changed";
        } catch (error) {
          const errorCode =
            error instanceof TmdbMovieResolverError
              ? error.code
              : "tmdb_matching_failed";
          return (await transition(state, "retryable_error", { errorCode }))
            ? "retryable_error"
            : "integration_changed";
        }
      };

      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < candidates.length) {
          const state = candidates[nextIndex++];
          const result = await processState(state);
          if (result === "matched") summary.matched += 1;
          else if (result === "movie_missing") summary.movieMissing += 1;
          else if (result === "unsupported_identifier") summary.unsupported += 1;
          else if (result === "retryable_error") summary.retryableErrors += 1;
          else summary.skippedStale += 1;
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker())
      );
      return summary;
    },
  };
};

const stremioMovieMatchService = createStremioMovieMatchService();

export default stremioMovieMatchService;
