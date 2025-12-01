// FILE: api/update-paid.js
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id, admin_password } = req.body || {};

  if (!id || !admin_password) {
    return res.status(400).json({ error: 'Missing id or admin_password' });
  }

  // Admin password to verify (set in Vercel env VAR: VERCEL_ADMIN_PWD)
  const ADMIN_PWD = process.env.VERCEL_ADMIN_PWD;
  if (!ADMIN_PWD || admin_password !== ADMIN_PWD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SUPA_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPA_URL || '';
  const SUPA_SERVICE = process.env.SUPA_SERVICE_ROLE || process.env.REACT_APP_SUPABASE_SERVICE_ROLE || '';

  if (!SUPA_URL || !SUPA_SERVICE) {
    return res.status(500).json({ error: 'Server misconfigured (supabase service key missing)' });
  }

  try {
    const supabase = createClient(SUPA_URL, SUPA_SERVICE);

    // Update the row to mark as paid
    const { data, error } = await supabase
      .from('mentorship_applications')
      .update({ paid: true, payfast_token: 'manual-admin' })
      .eq('id', id)
      .select();

    if (error) {
      console.error('Supabase update error', error);
      return res.status(500).json({ error: 'DB update failed', details: error });
    }

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    console.error('Server error', err);
    return res.status(500).json({ error: 'Server exception' });
  }
};
