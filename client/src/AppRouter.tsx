import React, { useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import App from "./App";
import { getSessionGeneration, subscribeSession } from "./auth/sessionScope";

const isTokenValid = (token: string | null): boolean => {
  if (!token) return false;
  try {
    const decoded = jwtDecode<{ exp: number }>(token);
    return decoded.exp * 1000 > Date.now();
  } catch {
    return false;
  }
};

const AppRouter: React.FC = () => {
  const sessionGeneration = useSyncExternalStore(
    subscribeSession,
    getSessionGeneration,
    getSessionGeneration
  );
  const location = useLocation();
  const isAuthPage =
    location.pathname === "/" ||
    location.pathname === "/login" ||
    location.pathname === "/signup";
  const isAuthenticated = isTokenValid(localStorage.getItem("token"));

  return (
    <App
      key={sessionGeneration}
      isAuthenticated={isAuthenticated}
      isAuthPage={isAuthPage}
    />
  );
};

export default AppRouter;
