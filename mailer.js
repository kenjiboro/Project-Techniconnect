/**
 * mailer.js — TechniConnect email utility
 *
 * Uses Nodemailer with SMTP. Configure these env vars in your .env:
 *   MAIL_HOST     e.g. smtp.gmail.com
 *   MAIL_PORT     e.g. 587
 *   MAIL_USER     e.g. noreply@cit.edu
 *   MAIL_PASS     App password or SMTP password
 *   MAIL_FROM     e.g. "TechniConnect <noreply@cit.edu>"
 *
 * If MAIL_HOST is not set, emails are silently skipped (safe for local dev).
 */

const nodemailer = require('nodemailer');

let transporter = null;

if (process.env.MAIL_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT || '587'),
    secure: parseInt(process.env.MAIL_PORT || '587') === 465,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    }
  });
}

/**
 * Send a registration approved email to the alumni.
 * @param {string} toEmail
 * @param {string} firstName
 */
async function sendApprovalEmail(toEmail, firstName) {
  if (!transporter) {
    console.log(`[mailer] MAIL_HOST not set — skipping approval email to ${toEmail}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'TechniConnect <noreply@cit.edu>',
    to: toEmail,
    subject: 'Your TechniConnect registration has been approved',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2 style="color:#1f4e79;">Welcome to TechniConnect, ${firstName}!</h2>
        <p>Your alumni registration has been <strong>approved</strong> by Alumni Affairs staff.</p>
        <p>You can now log in and access your alumni profile, view announcements, and explore the alumni directory.</p>
        <a href="${process.env.APP_URL || 'http://localhost:3000'}/login"
           style="display:inline-block;margin-top:1rem;padding:0.75rem 1.5rem;
                  background:#1f4e79;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">
          Log In to TechniConnect
        </a>
        <p style="margin-top:2rem;font-size:0.85rem;color:#6b7280;">
          Cebu Institute of Technology – University &mdash; Alumni Affairs Office
        </p>
      </div>
    `
  });
  console.log(`[mailer] Approval email sent to ${toEmail}`);
}

/**
 * Send a registration rejected email to the alumni.
 * @param {string} toEmail
 * @param {string} firstName
 * @param {string|null} adminNotes
 */
async function sendRejectionEmail(toEmail, firstName, adminNotes) {
  if (!transporter) {
    console.log(`[mailer] MAIL_HOST not set — skipping rejection email to ${toEmail}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'TechniConnect <noreply@cit.edu>',
    to: toEmail,
    subject: 'Update on your TechniConnect registration',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2 style="color:#1f4e79;">TechniConnect Registration Update</h2>
        <p>Hi ${firstName},</p>
        <p>Unfortunately, your registration request could not be approved at this time.</p>
        ${adminNotes ? `<p><strong>Reason:</strong> ${adminNotes}</p>` : ''}
        <p>If you believe this is a mistake, please contact the Alumni Affairs Office directly.</p>
        <p style="margin-top:2rem;font-size:0.85rem;color:#6b7280;">
          Cebu Institute of Technology – University &mdash; Alumni Affairs Office
        </p>
      </div>
    `
  });
  console.log(`[mailer] Rejection email sent to ${toEmail}`);
}

module.exports = { sendApprovalEmail, sendRejectionEmail };
