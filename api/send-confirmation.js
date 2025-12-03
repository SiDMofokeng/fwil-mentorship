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

    // Build confirmation HTML (same structure as client PDF)
    const paidText = data.paid ? 'PAID' : 'NOT PAID';
    const date = data.created_at || new Date().toISOString();
    const html = `
      <div style="font-family: Arial, sans-serif; color:#111; max-width:720px; margin:0 auto; padding:24px;">
        <div style="text-align:center;">
          <img src="${process.env.SITE_LOGO_URL || ''}" style="max-height:56px; margin-bottom:8px;" alt="FWIL"/>
          <h2 style="margin:0;">For Women in Law</h2>
          <div style="font-size:13px; color:#667;">Mentorship Program Registration Confirmation</div>
        </div>

        <div style="margin-top:18px;">
          <p>This confirms that the following applicant has been registered with the Mentorship Programme:</p>
          <table style="width:100%; border-collapse:collapse;">
            <tr><td style="padding:6px; width:35%; font-weight:700;">Name</td><td style="padding:6px;">${data.name} ${data.surname}</td></tr>
            <tr><td style="padding:6px; font-weight:700;">Email</td><td style="padding:6px;">${data.email}</td></tr>
            <tr><td style="padding:6px; font-weight:700;">Contact</td><td style="padding:6px;">${data.contact}</td></tr>
            <tr><td style="padding:6px; font-weight:700;">Location</td><td style="padding:6px;">${data.location || '—'}</td></tr>
            <tr><td style="padding:6px; font-weight:700;">Status</td><td style="padding:6px;">${data.status || '—'}</td></tr>
            <tr><td style="padding:6px; font-weight:700;">Payment</td><td style="padding:6px; font-weight:700;">${paidText}</td></tr>
            <tr><td style="padding:6px; font-weight:700;">Date</td><td style="padding:6px;">${new Date(date).toLocaleString()}</td></tr>
          </table>
          <p style="color:#6b7280; margin-top:12px;">This document confirms registration on the FWIL mentorship programme.</p>
        </div>
      </div>`;

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
