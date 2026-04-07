/**
 * Email service — wraps Nodemailer with Gmail SMTP (App Password).
 *
 * Required environment variables:
 *   SMTP_USER   — Gmail address  (e.g. noreply@furnicore.com)
 *   SMTP_PASS   — Gmail App Password (Settings → Security → App Passwords)
 *
 * Optional environment variables:
 *   SMTP_HOST   — default: smtp.gmail.com
 *   SMTP_PORT   — default: 587
 *   SMTP_FROM   — default: "FurniCore ERP <{SMTP_USER}>"
 *   APP_URL     — public base URL for links in emails (default: http://localhost:5173)
 *   EMAIL_ENABLED — set to "false" to skip sending and log to console instead (dev mode)
 */

import nodemailer from "nodemailer";

const {
  SMTP_HOST = "smtp.gmail.com",
  SMTP_PORT = "587",
  SMTP_USER = "",
  SMTP_PASS = "",
  SMTP_FROM = `FurniCore ERP <${SMTP_USER}>`,
  APP_URL   = "http://localhost:5173",
  EMAIL_ENABLED = "true",
} = process.env;

const emailEnabled = EMAIL_ENABLED !== "false" && SMTP_USER !== "" && SMTP_PASS !== "";

/** Lazily-created transporter — only instantiated when email is actually enabled. */
function createTransporter() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,  // TLS on 465, STARTTLS on 587
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

/* ─────────────────────────────────────────────────────────────────────────── */

function verificationEmailHtml(name: string, verifyUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your FurniCore account</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background:#18181b;padding:32px 40px;text-align:center;">
              <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">
                &#128296; FurniCore
              </span>
              <p style="margin:6px 0 0;font-size:12px;color:#a1a1aa;letter-spacing:1px;text-transform:uppercase;">
                Precision ERP for Manufacturing
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#18181b;">
                Verify your email address
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">
                Hi ${name}, welcome to FurniCore! To complete your registration and activate
                your account, please click the button below.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td align="center" style="background:#18181b;border-radius:8px;">
                    <a href="${verifyUrl}"
                       style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Warning -->
              <p style="margin:0 0 16px;font-size:13px;color:#71717a;line-height:1.5;">
                &#x23F0; This link expires in <strong>15 minutes</strong>. If it has expired,
                you can request a new one from the login page.
              </p>
              <p style="margin:0;font-size:13px;color:#71717a;line-height:1.5;">
                If you didn&apos;t create a FurniCore account, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e4e4e7;margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;">
              <p style="margin:0 0 8px;font-size:12px;color:#a1a1aa;">
                Can&apos;t click the button? Copy and paste this URL into your browser:
              </p>
              <p style="margin:0;font-size:11px;color:#a1a1aa;word-break:break-all;">
                ${verifyUrl}
              </p>
            </td>
          </tr>

        </table>

        <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;">
          &copy; ${new Date().getFullYear()} FurniCore ERP &mdash; This is an automated message, please do not reply.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function verificationEmailText(name: string, verifyUrl: string): string {
  return [
    `Hi ${name},`,
    ``,
    `Welcome to FurniCore! Please verify your email address by visiting the link below:`,
    ``,
    verifyUrl,
    ``,
    `This link expires in 15 minutes.`,
    ``,
    `If you did not create a FurniCore account, please ignore this email.`,
    ``,
    `— FurniCore ERP`,
  ].join("\n");
}

/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * Send an email-verification link to a newly registered user.
 *
 * @param to    Recipient email address
 * @param name  Recipient's display name
 * @param token Raw JWT verification token (appended as ?token= query param)
 */
export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string,
): Promise<void> {
  const verifyUrl = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;

  if (!emailEnabled) {
    console.info(
      `[email] EMAIL_ENABLED=false — skipping send to ${to}.\n` +
      `[email] Verification URL: ${verifyUrl}`,
    );
    return;
  }

  const transporter = createTransporter();

  await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject: "Verify your FurniCore account",
    text: verificationEmailText(name, verifyUrl),
    html: verificationEmailHtml(name, verifyUrl),
  });
}
