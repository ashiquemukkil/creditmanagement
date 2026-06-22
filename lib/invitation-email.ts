import "server-only";

import nodemailer from "nodemailer";

import type { AppRole } from "@/lib/auth";

function getInvitationEmailEnv() {
  const appUrl = process.env.APP_URL;
  const fromEmail = process.env.GMAIL_FROM_EMAIL;
  const appPassword = process.env.GMAIL_APP_PASSWORD;

  if (!appUrl || !fromEmail || !appPassword) {
    throw new Error(
      "Missing invitation email environment variables. Set APP_URL, GMAIL_FROM_EMAIL, and GMAIL_APP_PASSWORD.",
    );
  }

  return {
    appUrl,
    appPassword,
    fromEmail,
  };
}

function formatRole(role: AppRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export async function sendInvitationEmail(email: string, role: AppRole) {
  const { appPassword, appUrl, fromEmail } = getInvitationEmailEnv();
  const signupUrl = new URL("/signup", appUrl);
  const transporter = nodemailer.createTransport({
    auth: {
      pass: appPassword,
      user: fromEmail,
    },
    service: "gmail",
  });

  signupUrl.searchParams.set("email", email);

  const formattedRole = formatRole(role);

  await transporter.sendMail({
    from: fromEmail,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1c1917; line-height: 1.6;">
        <p style="font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: #b45309; font-weight: 700;">Credit Management</p>
        <h1 style="font-size: 24px; margin: 16px 0;">You have been invited</h1>
        <p>An administrator invited you to join as a <strong>${formattedRole}</strong>.</p>
        <p>Use this email address when creating your account:</p>
        <p style="font-weight: 700;">${email}</p>
        <p style="margin: 24px 0;">
          <a href="${signupUrl.toString()}" style="display: inline-block; background: #1c1917; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 12px; font-weight: 600;">Accept invitation</a>
        </p>
        <p>If the button does not work, open this link:</p>
        <p><a href="${signupUrl.toString()}" style="color: #b45309;">${signupUrl.toString()}</a></p>
      </div>
    `,
    subject: `Invitation to join Credit Management as ${formattedRole}`,
    to: email,
  });
}