import type { NextFunction, Request, Response } from "express";
import { describeError } from "../utils/safeLog";

// Registered after every route so it sees their errors. Client-side failures
// (413 from the body limit, multer rejections) keep their real status and a
// safe message; server-side failures never leak internals.
export const globalErrorHandler = (
  err: Error & { status?: number; statusCode?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    console.error("Global error handler:", describeError(err));
  }

  const msg =
    status === 413
      ? "Request body is too large."
      : status >= 500
        ? "Server error"
        : err.message || "Request failed";

  res.status(status).json({
    msg,
    ...(process.env.NODE_ENV === "development" ? { error: err.message } : {}),
  });
};
