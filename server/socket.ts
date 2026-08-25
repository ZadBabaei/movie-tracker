import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import mongoose from "mongoose";
import Group from "./models/Groups";
import { verifyAuthToken } from "./utils/authToken";
import { isOriginAllowed } from "./utils/corsConfig";

let io: Server;

const getHandshakeToken = (socket: Socket) => {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === "string" && authToken) return authToken;

  const header = socket.handshake.headers?.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }

  return "";
};

export const initIO = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        callback(null, isOriginAllowed(origin));
      },
    },
  });

  // Group rooms carry chat, poll and watch-history events, so the handshake
  // has to prove who is connecting before any room can be joined.
  io.use((socket, next) => {
    const token = getHandshakeToken(socket);
    if (!token) {
      next(new Error("Unauthorized"));
      return;
    }

    try {
      const decoded = verifyAuthToken(token);
      socket.data.userId = decoded.id;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("join:group", async (groupId: string) => {
      const id = String(groupId || "");
      if (!mongoose.Types.ObjectId.isValid(id)) return;

      try {
        const group = await Group.findById(id)
          .select("members")
          .lean<{ members: mongoose.Types.ObjectId[] }>();
        const userId = String(socket.data.userId || "");

        if (group?.members?.some((memberId) => memberId.toString() === userId)) {
          socket.join(id);
        }
      } catch (error) {
        console.error("Socket join:group failed:", error);
      }
    });

    socket.on("leave:group", (groupId: string) => {
      socket.leave(String(groupId || ""));
    });
  });

  return io;
};

export const getIO = (): Server => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};
