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
const groupSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    creator: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "User" }],
    pendingInvitations: [
        {
            userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
            inviterName: { type: String },
        },
    ],
    movies: [
        {
            movieId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Movie", required: true },
            watchedDate: { type: Date, default: Date.now },
            watchedAt: { type: Date },
            watchedWhere: { type: String, default: "" },
            watchedLocation: { type: String, default: "" },
            watchedWith: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "User" }],
            watchedNotes: { type: String, default: "" },
            ratings: [
                {
                    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
                    rating: { type: Number, required: true, min: 1, max: 10 },
                    createdAt: { type: Date, default: Date.now },
                    updatedAt: { type: Date, default: Date.now },
                },
            ],
        },
    ],
    currentPoll: { type: mongoose_1.Schema.Types.ObjectId, ref: "Poll" },
    pollHistory: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "Poll" }],
}, { timestamps: true });
groupSchema.methods.hasActivePoll = async function () {
    const Poll = mongoose_1.default.model("Poll");
    const activePoll = await Poll.findOne({ groupId: this._id, status: "active" });
    return !!activePoll;
};
const Group = mongoose_1.default.models.Group || mongoose_1.default.model("Group", groupSchema);
exports.default = Group;
