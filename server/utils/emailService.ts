import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, APP_URL } = process.env;

const transporter = nodemailer.createTransport({
  host: SMTP_HOST || "smtp.gmail.com",
  port: Number(SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

export async function sendGroupInviteEmail(
  to: string,
  inviterName: string,
  groupName: string,
  inviteLink: string
): Promise<void> {
  const html = `
    <div style="background:#1a1a2e;color:#e0e0e0;font-family:Arial,sans-serif;padding:40px 20px;text-align:center;">
      <div style="max-width:480px;margin:0 auto;background:#16213e;border-radius:12px;padding:32px;border:1px solid #eab11433;">
        <h1 style="color:#eab114;margin:0 0 8px;">Movie Tracker</h1>
        <p style="color:#aaa;font-size:14px;margin:0 0 24px;">You've been invited!</p>
        <p style="font-size:16px;line-height:1.6;margin:0 0 8px;">
          <strong style="color:#eab114;">${inviterName}</strong> invited you to join
        </p>
        <p style="font-size:20px;font-weight:bold;color:#fff;margin:0 0 24px;">
          ${groupName}
        </p>
        <a href="${inviteLink}" style="display:inline-block;background:#eab114;color:#1a1a2e;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
          Join Group
        </a>
        <p style="color:#666;font-size:12px;margin:24px 0 0;">
          This invitation link will expire in 7 days.
        </p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Movie Tracker" <${SMTP_USER}>`,
      to,
      subject: `${inviterName} invited you to "${groupName}" on Movie Tracker`,
      html,
    });
    console.log(`Invite email sent to ${to}`);
  } catch (error) {
    console.error("Failed to send invite email:", error);
    throw error;
  }
}
