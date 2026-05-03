"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultAvatarUrl = void 0;
const getDefaultAvatarUrl = (name, email) => {
    const seed = String(name || email || "Movie Tracker User").trim() || "Movie Tracker User";
    return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(seed)}`;
};
exports.getDefaultAvatarUrl = getDefaultAvatarUrl;
