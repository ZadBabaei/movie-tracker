"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIO = exports.initIO = void 0;
const socket_io_1 = require("socket.io");
let io;
const initIO = (httpServer) => {
    io = new socket_io_1.Server(httpServer, {
        cors: { origin: "*" },
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
