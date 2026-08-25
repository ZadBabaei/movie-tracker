import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { API_BASE_URL, LOCAL_API_BASE_URL } from "../api/apiClient";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  API_BASE_URL ||
  (import.meta.env.DEV ? window.location.origin : LOCAL_API_BASE_URL);

let sharedSocket: Socket | null = null;

const getSocket = (): Socket => {
  if (!sharedSocket) {
    sharedSocket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      // Read as a callback so a reconnect picks up the current token rather
      // than one captured when the socket was first created.
      auth: (cb) => cb({ token: localStorage.getItem("token") || "" }),
    });
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
