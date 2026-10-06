import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { Resend } from "resend";
import { IBugReport } from "../models/BugReport";
import { ConfigurationError, getAppUrl, isDeployedEnvironment } from "./deploymentConfig";

export type EmailProvider = "resend" | "smtp";

const RESEND_TEST_SENDER = "Movie Tracker <onboarding@resend.dev>";
const SMTP_CONNECTION_TIMEOUT_MS = 10_000;
const SMTP_GREETING_TIMEOUT_MS = 10_000;
const SMTP_SOCKET_TIMEOUT_MS = 20_000;
const RESEND_REQUEST_TIMEOUT_MS = 15_000;

const readEnv = (...names: string[]) => {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return undefined;
};

const senderAddress = (from: string) =>
  (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();

/**
 * Provider selection:
 * - EMAIL_PROVIDER=resend|smtp is always honoured; nothing else is tried.
 * - Unset in a deployed environment: Resend's HTTPS API whenever
 *   RESEND_API_KEY exists, because hosts such as Railway Hobby block SMTP.
 * - Unset locally: SMTP when its credentials exist, otherwise Resend.
 */
export const getEmailConfig = () => {
  const host = readEnv("EMAIL_HOST", "SMTP_HOST") || "smtp.gmail.com";
  const port = Number(readEnv("EMAIL_PORT", "SMTP_PORT")) || 587;
  const user = readEnv("EMAIL_USER", "SMTP_USER");
  const pass = readEnv("EMAIL_PASS", "SMTP_PASS");
  const resendApiKey = readEnv("RESEND_API_KEY");
  const requested = String(process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  const deployed = isDeployedEnvironment();

  if (requested && requested !== "resend" && requested !== "smtp") {
    throw new ConfigurationError("EMAIL_PROVIDER must be either \"resend\" or \"smtp\".");
  }

  const hasSmtpConfig = Boolean(user && pass);
  const provider: EmailProvider = requested
    ? (requested as EmailProvider)
    : deployed
      ? resendApiKey ? "resend" : "smtp"
      : hasSmtpConfig || !resendApiKey ? "smtp" : "resend";

  const configuredFrom = readEnv("EMAIL_FROM");
  const from = configuredFrom
    || (provider === "resend"
      ? deployed ? undefined : RESEND_TEST_SENDER
      : user ? `Movie Tracker <${user}>` : undefined);

  return { provider, host, port, user, pass, from, resendApiKey, deployed };
};

/** Throws a ConfigurationError describing what is missing; never includes secret values. */
export const assertEmailConfig = () => {
  const config = getEmailConfig();

  if (config.provider === "resend") {
    if (!config.resendApiKey) {
      throw new ConfigurationError("RESEND_API_KEY must be set when sending through Resend.");
    }
    if (!config.from) {
      throw new ConfigurationError("EMAIL_FROM must be set to a sender on a Resend-verified domain.");
    }
    // Resend's shared test sender only delivers to the Resend account owner.
    if (config.deployed && senderAddress(config.from).endsWith("@resend.dev")) {
      throw new ConfigurationError("EMAIL_FROM must use a Resend-verified domain, not resend.dev.");
    }
  } else {
    if (!config.user || !config.pass) {
      throw new ConfigurationError("SMTP_USER/SMTP_PASS (or EMAIL_USER/EMAIL_PASS) must be set when sending through SMTP.");
    }
    if (!config.from) throw new ConfigurationError("EMAIL_FROM is not configured.");
  }

  return config as typeof config & { from: string };
};

const getEmailDomain = (email: string) => {
  const domain = String(email || "").split("@")[1];
  return domain || "missing";
};

/** Replaceable in tests so no real email provider is contacted. */
export const emailTransports = {
  createResendClient: (apiKey: string) => new Resend(apiKey),
  createSmtpTransport: (options: SMTPTransport.Options) =>
    nodemailer.createTransport(options),
};

let resendClient: { apiKey: string; client: ReturnType<typeof emailTransports.createResendClient> } | null = null;
const getResendClient = (apiKey: string) => {
  if (!resendClient || resendClient.apiKey !== apiKey) {
    resendClient = { apiKey, client: emailTransports.createResendClient(apiKey) };
  }
  return resendClient.client;
};

export const resetEmailClientCache = () => {
  resendClient = null;
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

interface SendMailParams {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

const sendEmail = async ({ to, subject, text, html }: SendMailParams): Promise<void> => {
  const config = assertEmailConfig();

  if (config.provider === "resend") {
    const { error } = await withTimeout(
      getResendClient(config.resendApiKey!).emails.send({
        from: config.from,
        to,
        subject,
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
      } as Parameters<Resend["emails"]["send"]>[0]),
      RESEND_REQUEST_TIMEOUT_MS,
      "Resend request timed out"
    );

    if (error) {
      throw new Error(`Resend send failed: ${error.name} - ${error.message}`);
    }
    return;
  }

  const transport = emailTransports.createSmtpTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
  });
  await transport.sendMail({ from: config.from, to, subject, text, html });
};

/** Log-safe description of an email failure: no addresses, links, or secrets. */
export const describeEmailError = (error: unknown) => {
  const err = error as { name?: string; message?: string; code?: string; responseCode?: number };
  let provider: EmailProvider | "unknown" = "unknown";
  try {
    provider = getEmailConfig().provider;
  } catch {
    // Already reported by the error itself.
  }
  return {
    provider,
    name: err?.name || "Error",
    message: String(err?.message || "").replace(/https?:\/\/\S+/g, "[url]").slice(0, 300),
    ...(err?.code ? { code: err.code } : {}),
    ...(err?.responseCode ? { responseCode: err.responseCode } : {}),
  };
};

export async function sendGroupInviteEmail(
  to: string,
  inviterName: string,
  groupName: string,
  inviteLink: string
): Promise<void> {
  const escapedInviterName = escapeHtml(inviterName);
  const escapedGroupName = escapeHtml(groupName);
  const escapedInviteLink = escapeHtml(inviteLink);
  const text = [
    `${inviterName} invited you to join ${groupName} on Movie Tracker.`,
    "",
    `Open this invite link: ${inviteLink}`,
    "",
    "This invitation link will expire in 7 days.",
  ].join("\n");
  const html = `
    <div style="background:#1a1a2e;color:#e0e0e0;font-family:Arial,sans-serif;padding:40px 20px;text-align:center;">
      <div style="max-width:480px;margin:0 auto;background:#16213e;border-radius:12px;padding:32px;border:1px solid #eab11433;">
        <h1 style="color:#eab114;margin:0 0 8px;">Movie Tracker</h1>
        <p style="color:#aaa;font-size:14px;margin:0 0 24px;">You've been invited!</p>
        <p style="font-size:16px;line-height:1.6;margin:0 0 8px;">
          <strong style="color:#eab114;">${escapedInviterName}</strong> invited you to join
        </p>
        <p style="font-size:20px;font-weight:bold;color:#fff;margin:0 0 24px;">
          ${escapedGroupName}
        </p>
        <a href="${escapedInviteLink}" style="display:inline-block;background:#eab114;color:#1a1a2e;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
          Join Group
        </a>
        <p style="color:#666;font-size:12px;margin:24px 0 0;">
          This invitation link will expire in 7 days.
        </p>
      </div>
    </div>
  `;

  try {
    await sendEmail({
      to,
      subject: `${inviterName} invited you to "${groupName}" on Movie Tracker`,
      text,
      html,
    });
    console.log("Invite email sent:", { recipientDomain: getEmailDomain(to) });
  } catch (error) {
    console.error("Failed to send invite email:", {
      recipientDomain: getEmailDomain(to),
      name: (error as Error).name,
      message: (error as Error).message,
    });
    throw error;
  }
}

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  const escapedResetLink = escapeHtml(resetLink);
  const text = [
    "Reset your Movie Tracker password",
    "",
    "We received a request to reset your password.",
    `Open this link to choose a new password: ${resetLink}`,
    "",
    "If you did not request this, you can ignore this email. Your password was not changed.",
  ].join("\n");
  const html = `
    <div style="background:#040a1c;color:#e0e0e0;font-family:Arial,sans-serif;padding:40px 20px;text-align:center;">
      <div style="max-width:520px;margin:0 auto;background:#071425;border-radius:12px;padding:32px;border:1px solid #2ecc7140;">
        <h1 style="color:#70efa2;margin:0 0 8px;">Movie Tracker</h1>
        <p style="color:#aaa;font-size:14px;margin:0 0 24px;">Reset your password</p>
        <p style="font-size:16px;line-height:1.6;margin:0 0 24px;">
          We received a request to reset your Movie Tracker password. This link expires soon.
        </p>
        <a href="${escapedResetLink}" style="display:inline-block;background:#2ecc71;color:#052211;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
          Reset Password
        </a>
        <p style="color:#777;font-size:12px;line-height:1.5;margin:24px 0 0;">
          If you did not request this, you can ignore this email. Your password was not changed.
        </p>
      </div>
    </div>
  `;

  await sendEmail({
    to,
    subject: "Reset your Movie Tracker password",
    text,
    html,
  });
}

const escapeHtml = (value: string | undefined) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export async function sendBugReportEmail(to: string, bugReport: IBugReport): Promise<void> {
  const screenshotText = bugReport.screenshotUrl
    ? bugReport.screenshotUrl.startsWith("data:")
      ? "Screenshot was stored with the bug report payload."
      : bugReport.screenshotUrl
    : "None";

  const html = `
    <div style="background:#111;color:#e8e8e8;font-family:Arial,sans-serif;padding:28px;">
      <div style="max-width:720px;margin:0 auto;background:#181818;border:1px solid #ffffff1a;border-radius:12px;padding:24px;">
        <h1 style="margin:0 0 8px;color:#fff;">New Movie Tracker Bug Report</h1>
        <p style="margin:0 0 20px;color:#ff6b72;font-weight:bold;">${escapeHtml(bugReport.severity)} severity</p>
        <h2 style="margin:0 0 18px;color:#fff;">${escapeHtml(bugReport.title)}</h2>

        <p><strong>User:</strong> ${escapeHtml(bugReport.userName)} (${escapeHtml(bugReport.userEmail)})</p>
        <p><strong>Affected page:</strong> ${escapeHtml(bugReport.affectedPage)}</p>
        <p><strong>Current URL:</strong> ${escapeHtml(bugReport.pageUrl)}</p>
        <p><strong>Browser:</strong> ${escapeHtml(bugReport.browserInfo)}</p>

        <hr style="border:0;border-top:1px solid #ffffff1a;margin:20px 0;" />

        <p><strong>What happened?</strong></p>
        <p style="white-space:pre-wrap;">${escapeHtml(bugReport.description)}</p>

        <p><strong>Steps to reproduce</strong></p>
        <p style="white-space:pre-wrap;">${escapeHtml(bugReport.stepsToReproduce)}</p>

        <p><strong>Expected result</strong></p>
        <p style="white-space:pre-wrap;">${escapeHtml(bugReport.expectedResult)}</p>

        <p><strong>Actual result</strong></p>
        <p style="white-space:pre-wrap;">${escapeHtml(bugReport.actualResult)}</p>

        <p><strong>Screenshot:</strong> ${escapeHtml(screenshotText)}</p>
      </div>
    </div>
  `;

  await sendEmail({
    to,
    subject: `[Bug][${bugReport.severity}] ${bugReport.title}`,
    html,
  });
}

/**
 * Startup check for deployed environments. Problems are reported loudly
 * instead of crashing so one email misconfiguration cannot take the whole
 * API offline; affected email flows refuse to send until it is fixed.
 */
export const reportEmailConfiguration = (): boolean => {
  if (!isDeployedEnvironment()) return true;
  try {
    getAppUrl();
    const { provider } = assertEmailConfig();
    console.log("Email configuration OK:", { provider });
    return true;
  } catch (error) {
    console.error("EMAIL CONFIGURATION ERROR: outgoing email (including password reset) is not deliverable until fixed:", describeEmailError(error));
    return false;
  }
};
