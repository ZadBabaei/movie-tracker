import React from "react";
import ReactDOM from "react-dom/client";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { BrowserRouter } from "react-router-dom";
import AppRouter from "./AppRouter";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
const theme = createTheme({
  typography: {
    fontFamily: "Arial, Helvetica, sans-serif",
  },
});

root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
