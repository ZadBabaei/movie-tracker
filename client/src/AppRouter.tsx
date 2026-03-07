import React from "react";
import { useLocation } from "react-router-dom";
import App from "./App";

const AppRouter: React.FC = () => {
  const location = useLocation();
  const isAuthPage =
    location.pathname === "/" || location.pathname === "/signup";
  const token = localStorage.getItem("token");
  const isAuthenticated = !!token;

  return <App isAuthenticated={isAuthenticated} isAuthPage={isAuthPage} />;
};

export default AppRouter;
