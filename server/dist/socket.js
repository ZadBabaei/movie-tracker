"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIO = exports.initIO = void 0;
const socket_io_1 = require("socket.io");
const corsConfig_1 = require("./utils/corsConfig");
let io;
const initIO = (httpServer) => {
    io = new socket_io_1.Server(httpServer, {
        cors: {
            origin(origin, callback) {
                callback(null, (0, corsConfig_1.isOriginAllowed)(origin));
            },
        },
    });
    io.on("connection", (socket) => {
        socket.on("join:group", (groupId) => {
            socket.join(groupId);
        });
        socket.on("leave:group", (groupId) => {
            socket.leave(groupId);
        });
    });
    return io;
};
exports.initIO = initIO;
const getIO = () => {
    if (!io)
        throw new Error("Socket.io not initialized");
    return io;
};
exports.getIO = getIO;
