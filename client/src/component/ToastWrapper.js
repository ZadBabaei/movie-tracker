// ToastWrapper.js
import React from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const ToastWrapper = () => (
  <ToastContainer position="top-right" autoClose={2000} hideProgressBar />
);

export default ToastWrapper;
