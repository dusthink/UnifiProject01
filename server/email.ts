import nodemailer from "nodemailer";

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user || "noreply@example.com";

  if (!host || !user || !pass) return null;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return { transporter, from };
}

export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendTenantInvite({
  toEmail,
  firstName,
  inviteUrl,
  unitNumber,
  buildingName,
  communityName,
}: {
  toEmail: string;
  firstName: string;
  inviteUrl: string;
  unitNumber: string;
  buildingName: string;
  communityName: string;
}): Promise<boolean> {
  const config = getTransporter();
  if (!config) {
    console.log(`[email] SMTP not configured. Invite URL for ${toEmail}: ${inviteUrl}`);
    return false;
  }

  const { transporter, from } = config;

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
      <h2 style="margin-bottom: 4px;">You've been invited to the tenant portal</h2>
      <p style="color: #555;">Hi ${firstName},</p>
      <p style="color: #555;">
        Your property manager has set up access for you to manage your WiFi settings for
        <strong>Unit ${unitNumber}</strong> at <strong>${buildingName}</strong>, ${communityName}.
      </p>
      <p style="color: #555;">Click the button below to create your account. This link expires in 7 days.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${inviteUrl}" style="
          background: #2563eb;
          color: #fff;
          padding: 12px 28px;
          border-radius: 6px;
          text-decoration: none;
          font-weight: 600;
          font-size: 15px;
        ">Create My Account</a>
      </div>
      <p style="color: #888; font-size: 13px;">
        Or copy this link into your browser:<br/>
        <a href="${inviteUrl}" style="color: #2563eb; word-break: break-all;">${inviteUrl}</a>
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="color: #aaa; font-size: 12px;">
        This invite was sent by your property manager. If you were not expecting this, you can ignore this email.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from,
      to: toEmail,
      subject: `Your tenant portal invite — Unit ${unitNumber}, ${buildingName}`,
      html,
    });
    console.log(`[email] Invite sent to ${toEmail}`);
    return true;
  } catch (err) {
    console.error(`[email] Failed to send invite to ${toEmail}:`, err);
    return false;
  }
}

export async function sendTenantCredentials({
  toEmail,
  firstName,
  password,
  loginUrl,
}: {
  toEmail: string;
  firstName: string;
  password: string;
  loginUrl: string;
}): Promise<boolean> {
  const config = getTransporter();
  if (!config) {
    console.log(`[email] SMTP not configured. Credentials for ${toEmail} — password: ${password}`);
    return false;
  }

  const { transporter, from } = config;

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
      <h2 style="margin-bottom: 4px;">Your tenant portal account is ready</h2>
      <p style="color: #555;">Hi ${firstName},</p>
      <p style="color: #555;">Your account has been created. Here are your login credentials:</p>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
        <p style="margin: 0 0 8px;"><strong>Email:</strong> ${toEmail}</p>
        <p style="margin: 0;"><strong>Password:</strong> <span style="font-family: monospace; font-size: 15px; background: #fff; padding: 2px 8px; border-radius: 4px; border: 1px solid #e0e0e0;">${password}</span></p>
      </div>
      <p style="color: #555;">We recommend changing your password after your first login.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${loginUrl}" style="
          background: #2563eb;
          color: #fff;
          padding: 12px 28px;
          border-radius: 6px;
          text-decoration: none;
          font-weight: 600;
          font-size: 15px;
        ">Log In Now</a>
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="color: #aaa; font-size: 12px;">
        Keep this email safe as it contains your login credentials.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from,
      to: toEmail,
      subject: "Your tenant portal login credentials",
      html,
    });
    console.log(`[email] Credentials sent to ${toEmail}`);
    return true;
  } catch (err) {
    console.error(`[email] Failed to send credentials to ${toEmail}:`, err);
    return false;
  }
}
