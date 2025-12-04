// FILE: api/send-confirmation.js
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const SUPA_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPA_URL || '';
const SUPA_SERVICE = process.env.SUPA_SERVICE_ROLE || process.env.REACT_APP_SUPABASE_SERVICE_ROLE || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'no-reply@yourdomain.com';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing id' });

  if (!SUPA_URL || !SUPA_SERVICE) return res.status(500).json({ error: 'Server misconfigured (missing supabase service key)' });

  const supabase = createClient(SUPA_URL, SUPA_SERVICE);
  try {
    const { data, error } = await supabase.from('mentorship_applications').select('*').eq('id', id).single();
    if (error || !data) return res.status(404).json({ error: 'Application not found' });

    // Only allow sending when paid is explicit (true or false)
    if (data.paid === undefined || data.paid === null) {
      return res.status(400).json({ error: 'Payment status not set. Mark paid/unpaid before emailing.' });
    }

    // Build NEW confirmation email (matching updated PDF)
    const fullName = `${data.name} ${data.surname}`;
    const programName = "FWIL Mentorship Programme";
    const paidText = data.paid ? "PAID" : "NOT PAID";
    const statusColor = data.paid ? "#065f46" : "#b91c1c";
    const date = data.created_at
      ? new Date(data.created_at).toLocaleString()
      : new Date().toLocaleString();

    const html = `
    <!DOCTYPE html>
    <html>
    <body style="margin:0; padding:0; font-family:Arial, sans-serif; background:#f7f7f7;">
      <div style="max-width:600px; margin:0 auto; background:#ffffff; padding:24px; border-radius:12px;">

        <!-- Logo -->
        <div style="text-align:center; margin-bottom:20px;">
          <img src="https://fwil-mentorship.vercel.app/fw_logo.jpg"
               alt="For Women in Law"
               style="max-height:60px;" />
        </div>

        <!-- Heading -->
        <h2 style="text-align:center; color:#8B1E3F; margin-bottom:6px;">
          You Are Fully Registered
        </h2>

        <p style="text-align:center; color:#475569; font-size:14px; margin-top:0;">
          ${programName} — Confirmation Notice
        </p>

        <hr style="border:none; border-top:1px solid #eee; margin:20px 0;" />

        <!-- Greeting -->
        <p style="font-size:15px; color:#111;">
          Dear <strong>${fullName}</strong>,
        </p>

        <!-- Message -->
        <p style="font-size:15px; color:#111; line-height:1.6;">
          Thank you for registering for the <strong>${programName}</strong>.
          This email serves as your official confirmation that your registration
          has been received and processed.
        </p>

        <p style="font-size:15px; color:#111; line-height:1.6;">
          Below are your registration details:
        </p>

        <!-- Details -->
        <div style="margin-top:18px;">
          <div style="display:flex; margin-bottom:8px;">
            <div style="width:160px; font-weight:700; color:#374151;">Full Name</div>
            <div>${fullName}</div>
          </div>

          <div style="display:flex; margin-bottom:8px;">
            <div style="width:160px; font-weight:700; color:#374151;">Email</div>
            <div>${data.email}</div>
          </div>

          <div style="display:flex; margin-bottom:8px;">
            <div style="width:160px; font-weight:700; color:#374151;">Contact</div>
            <div>${data.contact}</div>
          </div>

          <div style="display:flex; margin-bottom:8px;">
            <div style="width:160px; font-weight:700; color:#374151;">Status</div>
            <div>${data.status}</div>
          </div>

          <div style="display:flex; margin-bottom:8px;">
            <div style="width:160px; font-weight:700; color:#374151;">Location</div>
            <div>${data.location}</div>
          </div>

          <div style="display:flex; margin-bottom:8px;">
            <div style="width:160px; font-weight:700; color:#374151;">Payment Status</div>
            <div style="font-weight:700; color:${statusColor};">${paidText}</div>
          </div>

          <div style="display:flex; margin-bottom:8px;">
            <div style="width:160px; font-weight:700; color:#374151;">Date</div>
            <div>${date}</div>
          </div>
        </div>

        <hr style="border:none; border-top:1px solid #eee; margin:22px 0;" />

        <p style="font-size:13px; color:#64748b;">
          This confirmation was issued by <strong>For Women in Law (FWIL)</strong>.
        </p>

        <p style="font-size:13px; color:#64748b;">
          If you have any questions, simply reply to this email.
        </p>

      </div>
    </body>
    </html>
    `;

    // Nodemailer transport - must set SMTP_* env vars in Vercel
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: (process.env.SMTP_SECURE === 'true'), // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      }
    });

    const mailOptions = {
      from: EMAIL_FROM,
      to: data.email,
      subject: 'FWIL Mentorship — Registration Confirmation',
      html
    };

    await transporter.sendMail(mailOptions);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send-confirmation error', err);
    return res.status(500).json({ error: 'Server error sending email' });
  }
};
