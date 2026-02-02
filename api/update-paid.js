// FILE: api/update-paid.js
const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = process.env.SUPA_URL || '';
const SUPA_SERVICE = process.env.SUPA_SERVICE_ROLE || '';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id, admin_password } = req.body || {};
  if (!id || !admin_password) return res.status(400).json({ error: 'Missing id or admin_password' });

  // Simple admin password check (for local testing). Replace with stronger checks in production.
  if (admin_password !== (process.env.VERCEL_ADMIN_PWD || 'admin123')) {
    return res.status(401).json({ error: 'Invalid admin password' });
  }

  if (!SUPA_URL || !SUPA_SERVICE) {
    return res.status(500).json({ error: 'Server misconfigured (missing supabase service role)' });
  }

  const supabase = createClient(SUPA_URL, SUPA_SERVICE);
  try {
    const { data, error } = await supabase
      .from('mentorship_applications_2026')
      .update({ paid: true })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message || 'Failed to update' });

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    console.error('update-paid error', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
};
