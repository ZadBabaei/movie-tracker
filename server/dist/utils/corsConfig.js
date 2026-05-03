"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsOptions = exports.getAllowedOrigins = void 0;
const fallbackOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
];
const getAllowedOrigins = () => {
    const configuredOrigins = [
        process.env.CLIENT_URL,
        process.env.APP_URL,
        process.env.CORS_ORIGINS,
    ]
        .filter(Boolean)
        .flatMap((value) => String(value).split(","))
        .map((origin) => origin.trim())
        .filter(Boolean);
    return configuredOrigins.length ? configuredOrigins : fallbackOrigins;
};
exports.getAllowedOrigins = getAllowedOrigins;
exports.corsOptions = {
    origin(origin, callback) {
        if (!origin) {
            callback(null, true);
            return;
        }
        callback(null, (0, exports.getAllowedOrigins)().includes(origin));
    },
};
