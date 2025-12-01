// FILE: src/pages/AdminPanel.jsx
import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import '../components/MentorshipForm.css'; // reuse existing styles (you already have this)
const fwilLogoPath = '/fw_logo.jpg';

// Use anon key for read-only listing (safe). Update is done server-side.
const SUPA_URL = process.env.REACT_APP_SUPABASE_URL || '';
const SUPA_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPA_URL, SUPA_ANON || '');

// Admin page component
export default function AdminPanel() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [message, setMessage] = useState('');
  const [adminPass, setAdminPass] = useState('');

  const search = async () => {
    setMessage('');
    setLoading(true);
    try {
      let res;
      if (!query.trim()) {
        // fetch latest 20 rows if no query
        res = await supabase
          .from('mentorship_applications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);
      } else {
        // search by email or name or surname
        const q = query.trim();
        res = await supabase
          .from('mentorship_applications')
          .select('*')
          .or(`email.ilike.%${q}%,name.ilike.%${q}%,surname.ilike.%${q}%`)
          .order('created_at', { ascending: false })
          .limit(50);
      }

      if (res.error) {
        setMessage('Error fetching rows. See console.');
        console.error('supabase fetch error', res.error);
      } else {
        setRows(res.data || []);
        if (!res.data || res.data.length === 0) setMessage('No results found.');
      }
    } catch (err) {
      console.error(err);
      setMessage('Unexpected error fetching rows.');
    } finally {
      setLoading(false);
    }
  };

  // call serverless function to update paid (secure)
  const markPaid = async (id) => {
    if (!adminPass) {
      setMessage('Enter admin password before performing actions.');
      return;
    }
    setActionLoadingId(id);
    setMessage('');
    try {
      const resp = await fetch('/api/update-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, admin_password: adminPass })
      });
      const json = await resp.json();
      if (!resp.ok) {
        setMessage(json?.error || 'Failed to update. Check server logs.');
        console.error('update-paid error', json);
      } else {
        setMessage('Marked as paid successfully.');
        // update local state
        setRows(r => r.map(row => (row.id === id ? { ...row, paid: true } : row)));
      }
    } catch (err) {
      console.error(err);
      setMessage('Network error when calling server.');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="fwil-page" style={{ padding: 24, minHeight: '100vh' }}>
      <header className="logo-header" style={{ marginBottom: 14 }}>
        <img src={fwilLogoPath} alt="FWIL" style={{ maxHeight: 56 }} />
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ color: '#8B1E3F', marginBottom: 6 }}>Admin — Mentorship Applications</h2>
        <p style={{ color: '#475569', marginBottom: 18 }}>
          Search by name, surname or email. Enter admin password (kept secret on server) to mark applicants as paid.
        </p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
          <input
            placeholder="Search by email, name or leave empty to list recent"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}
          />
          <button className="btn primary" onClick={search} disabled={loading}>{loading ? 'Searching...' : 'Search'}</button>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18 }}>
          <input
            placeholder="Admin password"
            type="password"
            value={adminPass}
            onChange={(e) => setAdminPass(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: '1px solid #e2e8f0' }}
          />
          <div style={{ color: '#64748b', fontSize: 14 }}>Password is checked server-side. Do not share.</div>
        </div>

        {message && <div style={{ marginBottom: 14, color: '#b91c1c' }}>{message}</div>}

        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map(row => (
            <div key={row.id} style={{ background: '#fff', padding: 16, borderRadius: 12, boxShadow: '0 6px 20px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 800 }}>{row.name} {row.surname} <span style={{ fontWeight: 600, color: '#64748b', fontSize: 13 }}>({row.status})</span></div>
                <div style={{ color: '#475569' }}>{row.email} • {row.contact}</div>
                <div style={{ marginTop: 8, fontSize: 13 }}><strong>Location:</strong> {row.location || '—'} • <strong>Paid:</strong> {row.paid ? 'Yes' : 'No'}</div>
                {row.created_at && <div style={{ color: '#94a3b8', marginTop: 6, fontSize: 13 }}>Applied: {new Date(row.created_at).toLocaleString()}</div>}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {!row.paid && (
                  <button
                    className="btn primary"
                    onClick={() => markPaid(row.id)}
                    disabled={actionLoadingId === row.id}
                    style={{ minWidth: 140 }}
                  >
                    {actionLoadingId === row.id ? 'Marking...' : 'Mark as paid'}
                  </button>
                )}
                <a className="btn ghost-dark" href={`https://app.supabase.com/project/${SUPA_URL.replace('https://', '').replace('.supabase.co','')}/database/table/mentorship_applications/rows/${row.id}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                  Edit in Supabase
                </a>
              </div>
            </div>
          ))}

          {rows.length === 0 && !loading && <div style={{ color: '#64748b' }}>No results. Press Search to load recent applicants.</div>}
        </div>
      </main>
    </div>
  );
}
