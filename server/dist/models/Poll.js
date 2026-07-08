"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const PollSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    groupId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Group", required: true },
    creator: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    movies: [
        {
            tmdbId: { type: String, required: true },
            title: { type: String, required: true },
            poster_path: String,
            vote_average: Number,
        },
    ],
    votes: [
        {
            userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
            rankings: [
                {
                    movieTmdbId: { type: String, required: true },
                    rank: { type: Number, required: true },
                },
            ],
        },
    ],
    status: {
        type: String,
        enum: ["active", "completed", "cancelled"],
        default: "active",
    },
    round: { type: Number, default: 1 },
    winningMovieTmdbId: String,
    result: {
        mode: { type: String, enum: ["ranked", "runoff", "randomTieBreak"] },
        lowestScoreWins: Boolean,
        randomTieBreak: Boolean,
        movies: [
            {
                movieTmdbId: String,
                title: String,
                score: Number,
            },
        ],
    },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
});
PollSchema.index({ groupId: 1, status: 1 });
const Poll = mongoose_1.default.model("Poll", PollSchema);
// Polls are retained for 30 days. The database previously carried a 7-day
// TTL on createdAt, which deleted history early — realign it on startup.
const POLL_RETENTION_SECONDS = 30 * 24 * 60 * 60;
const ensurePollRetentionIndex = async () => {
    try {
        const collection = mongoose_1.default.connection.db?.collection("polls");
        if (!collection)
            return;
        const indexes = await collection.indexes();
        const createdAtIndex = indexes.find((index) => index.name === "createdAt_1");
        if (createdAtIndex?.expireAfterSeconds === POLL_RETENTION_SECONDS)
            return;
        if (createdAtIndex) {
            await collection.dropIndex("createdAt_1");
        }
        await collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: POLL_RETENTION_SECONDS });
        console.info("Poll retention TTL index set to 30 days.");
    }
    catch (error) {
        console.warn("Could not update poll retention TTL index:", error);
    }
};
if (mongoose_1.default.connection.readyState === 1) {
    void ensurePollRetentionIndex();
}
else {
    mongoose_1.default.connection.once("open", () => void ensurePollRetentionIndex());
}
exports.default = Poll;
