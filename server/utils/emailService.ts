import nodemailer from "nodemailer";
import { IBugReport } from "../models/BugReport";

const getEmailConfig = () => {
  const host = process.env.EMAIL_HOST || process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.EMAIL_PORT || process.env.SMTP_PORT) || 587;
  const user = process.env.EMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM || (user ? `Movie Tracker <${user}>` : undefined);

  return { host, port, user, pass, from };
};

const getEmailDomain = (email: string) => {
  const domain = String(email || "").split("@")[1];
  return domain || "missing";
};

const getSmtpTransporter = () => {
  const { host, port, user, pass } = getEmailConfig();

  if (!user || !pass) {
    throw new Error("EMAIL_USER/EMAIL_PASS or SMTP_USER/SMTP_PASS must be configured to send email");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
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
  const { from } = getEmailConfig();
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
    await getSmtpTransporter().sendMail({
      from,
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

  await getSmtpTransporter().sendMail({
    from: getEmailConfig().from,
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

  await getSmtpTransporter().sendMail({
    from: getEmailConfig().from,
    to,
    subject: `[Bug][${bugReport.severity}] ${bugReport.title}`,
    html,
  });
}
