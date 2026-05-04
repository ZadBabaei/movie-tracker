"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsOptions = exports.isOriginAllowed = exports.getAllowedOrigins = void 0;
const fallbackOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://movietracker.zadprogramming.com",
    "https://movieTracker.zadprogramming.com",
];
const normalizeOrigin = (origin) => {
    try {
        return new URL(origin).origin;
    }
    catch {
        return origin.replace(/\/+$/, "");
    }
};
const getAllowedOrigins = () => {
    const configuredOrigins = [
        process.env.CLIENT_URL,
        process.env.APP_URL,
        process.env.CORS_ORIGINS,
        process.env.VERCEL_PREVIEW_ORIGINS,
    ]
        .filter(Boolean)
        .flatMap((value) => String(value).split(","))
        .map((origin) => normalizeOrigin(origin.trim()))
        .filter(Boolean);
    return Array.from(new Set([...fallbackOrigins.map(normalizeOrigin), ...configuredOrigins]));
};
exports.getAllowedOrigins = getAllowedOrigins;
const isOriginAllowed = (origin) => {
    if (!origin)
        return true;
    return (0, exports.getAllowedOrigins)().includes(normalizeOrigin(origin));
};
exports.isOriginAllowed = isOriginAllowed;
exports.corsOptions = {
    origin(origin, callback) {
        if ((0, exports.isOriginAllowed)(origin)) {
            callback(null, true);
            return;
        }
        const message = `CORS blocked origin: ${origin}`;
        if (process.env.NODE_ENV === "development") {
            callback(new Error(message));
            return;
        }
        callback(null, false);
    },
};
