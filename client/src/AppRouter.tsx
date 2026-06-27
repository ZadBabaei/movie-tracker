import React from "react";
import { useLocation } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import App from "./App";

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
  const location = useLocation();
  const isAuthPage =
    location.pathname === "/" || location.pathname === "/signup";
  const isAuthenticated = isTokenValid(localStorage.getItem("token"));

  return <App isAuthenticated={isAuthenticated} isAuthPage={isAuthPage} />;
};

export default AppRouter;
