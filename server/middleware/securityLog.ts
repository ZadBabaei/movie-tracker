import { NextFunction, Request, Response } from "express";

type SecurityOutcome =
  | "authentication_failed"
  | "authorization_denied"
  | "rate_limited";

const OUTCOMES: Record<number, SecurityOutcome> = {
  401: "authentication_failed",
  403: "authorization_denied",
  429: "rate_limited",
};

// Authentication and authorization failures are security events, not noise.
// They are emitted as single-line JSON so the platform log view stays greppable
// and the records can be shipped to an aggregator without reparsing.
export const securityEventLogger = (req: Request, res: Response, next: NextFunction) => {
  res.on("finish", () => {
    const outcome = OUTCOMES[res.statusCode];
    if (!outcome) return;

    console.warn(
      JSON.stringify({
        type: "security_event",
        outcome,
        status: res.statusCode,
        method: req.method,
        path: req.originalUrl.split("?")[0].slice(0, 200),
        userId: req.user?.id,
        ip: req.ip,
        userAgent: (req.get("user-agent") || "").slice(0, 120),
        at: new Date().toISOString(),
      })
    );
  });

  next();
};
