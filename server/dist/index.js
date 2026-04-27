"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = __importDefault(require("http"));
const socket_1 = require("./socket");
dotenv_1.default.config();
const groupRoutes_1 = __importDefault(require("./routes/groupRoutes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const pollRoutes_1 = __importDefault(require("./routes/pollRoutes"));
const chatRoutes_1 = __importDefault(require("./routes/chatRoutes"));
const inboxRoutes_1 = __importDefault(require("./routes/inboxRoutes"));
const watchlistRoutes_1 = __importDefault(require("./routes/watchlistRoutes"));
const profileRoutes_1 = __importDefault(require("./routes/profileRoutes"));
const assistantRoutes_1 = __importDefault(require("./routes/assistantRoutes"));
const commentRoutes_1 = __importDefault(require("./routes/commentRoutes"));
const app = (0, express_1.default)();
const httpServer = http_1.default.createServer(app);
const PORT = process.env.PORT || 5000;
(0, socket_1.initIO)(httpServer);
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use("/api/groups", groupRoutes_1.default);
app.use("/api/inbox", inboxRoutes_1.default);
app.use("/api/user", userRoutes_1.default);
app.use("/api/auth", authRoutes_1.default);
app.use("/api/chat", chatRoutes_1.default);
app.use("/api/polls", pollRoutes_1.default);
app.use("/api/watchlist", watchlistRoutes_1.default);
app.use("/api/profile", profileRoutes_1.default);
app.use("/api/assistant", assistantRoutes_1.default);
app.use("/api/comments", commentRoutes_1.default);
app.use((err, req, res, next) => {
    console.error("Global error handler:", err);
    res.status(500).json({
        msg: "Server error",
        error: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
    });
});
app.get("/", (_req, res) => {
    res.send("Hello from Movie Tracker Backend!");
});
mongoose_1.default
    .connect(process.env.MONGODB_URI)
    .then(async () => {
    console.log("MongoDB Connected to:", mongoose_1.default.connection.db.databaseName);
    const collections = await mongoose_1.default.connection.db.listCollections().toArray();
    console.log("Collections:", collections.map((c) => c.name));
})
    .catch((err) => console.error("MongoDB Connection Error:", err));
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
