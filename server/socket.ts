import { Server } from "socket.io";
import { Server as HttpServer } from "http";
import { isOriginAllowed } from "./utils/corsConfig";

let io: Server;

export const initIO = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        callback(null, isOriginAllowed(origin));
      },
    },
  });

  io.on("connection", (socket) => {
    socket.on("join:group", (groupId: string) => {
      socket.join(groupId);
    });

    socket.on("leave:group", (groupId: string) => {
      socket.leave(groupId);
    });
  });

  return io;
};

export const getIO = (): Server => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};
