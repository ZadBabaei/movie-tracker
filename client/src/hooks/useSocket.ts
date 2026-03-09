import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "http://localhost:5000";

let sharedSocket: Socket | null = null;

const getSocket = (): Socket => {
  if (!sharedSocket) {
    sharedSocket = io(SERVER_URL, { transports: ["websocket", "polling"] });
  }
  return sharedSocket;
};

export const useSocket = (groupId: string) => {
  const socketRef = useRef<Socket>(getSocket());

  useEffect(() => {
    const socket = socketRef.current;
    socket.emit("join:group", groupId);

    return () => {
      socket.emit("leave:group", groupId);
    };
  }, [groupId]);

  return socketRef.current;
};
