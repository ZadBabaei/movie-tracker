
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ModalProvider } from "./context/ModalContext";
import AppRouter from "./AppRouter";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <ModalProvider>
        <AppRouter />
      </ModalProvider>
    </BrowserRouter>
  </React.StrictMode>
);
