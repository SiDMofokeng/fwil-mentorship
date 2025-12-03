// FILE: src/pages/AdminPanel.jsx
import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import '../components/MentorshipForm.css';

const fwilLogoPath = '/fw_logo.jpg';
const SUPA_URL = process.env.REACT_APP_SUPABASE_URL || '';
const SUPA_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPA_URL, SUPA_ANON || '');

export default function AdminPanel() {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [paidFilter, setPaidFilter] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [selected, setSelected] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => { fetchRows(); }, [page, statusFilter, locationFilter, paidFilter]);

  async function fetchRows() {
    setLoading(true); setMessage('');
    try {
      let qb = supabase
        .from('mentorship_applications')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (query && query.trim()) {
        const q = query.trim();
        qb = qb.or(`email.ilike.%${q}%,name.ilike.%${q}%,surname.ilike.%${q}%,contact.ilike.%${q}%`);
      }
      if (statusFilter) qb = qb.eq('status', statusFilter);
      if (locationFilter) qb = qb.eq('location', locationFilter);
      if (paidFilter) qb = qb.eq('paid', paidFilter === 'paid');

      const res = await qb;
      if (res.error) { console.error('Supabase fetch error', res.error); setMessage('Error fetching rows'); }
      else setRows(res.data || []);
    } catch (err) { console.error(err); setMessage('Unexpected error fetching rows.'); }
    finally { setLoading(false); }
  }

  const onSearch = async () => { setPage(1); await fetchRows(); };

  // Mark paid server call (api/update-paid must be deployed)
  const markPaid = async (id) => {
    const adminPwd = window.prompt('Enter admin password to confirm action'); if (!adminPwd) return;
    setActionLoadingId(id); setMessage('');
    try {
      const resp = await fetch('/api/update-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, admin_password: adminPwd }),
      });
      const json = await resp.json();
      if (!resp.ok) { setMessage(json?.error || 'Failed to mark as paid.'); console.error('update-paid:', json); }
      else {
        setMessage('Marked as paid.');
        setRows(r => r.map(row => row.id === id ? { ...row, paid: true } : row));
        if (selected && selected.id === id) setSelected({ ...selected, paid: true });
      }
    } catch (err) { console.error(err); setMessage('Network error when calling server.'); }
    finally { setActionLoadingId(null); }
  };

  // --- DETAILS modal helpers ------------------------------------------------

  // Build a clean "user-entered fields only" object
  const getUserFields = (row) => {
    if (!row) return {};
    // fields we consider user inputs (tweak if your table has different names)
    const fields = ['status', 'name', 'surname', 'email', 'contact', 'location'];
    const obj = {};
    fields.forEach(k => {
      if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') obj[k] = row[k];
    });
    return obj;
  };

  // Build a printable HTML string (legal-style) for the confirmation
  const buildConfirmationHtml = (row) => {
    const user = getUserFields(row);
    const paidText = row.paid ? 'PAID' : 'NOT PAID';
    const date = row.created_at ? new Date(row.created_at).toLocaleString() : new Date().toLocaleString();

    const company = 'For Women in Law';
    const header = `
      <div style="text-align:center; margin-bottom:18px;">
        <img src="${fwilLogoPath}" alt="${company}" style="max-height:56px; display:block; margin: 0 auto 8px;" />
        <h2 style="margin:6px 0 0; font-family:Georgia, 'Times New Roman', serif;">${company}</h2>
        <div style="font-size:12px; color:#666; margin-top:4px;">Mentorship Program Registration Confirmation</div>
      </div>`;

    let body = `<div style="margin-top:10px; font-family: 'Helvetica Neue', Arial, sans-serif; color:#111;">`;
    body += `<p style="margin:0 0 10px">This confirms that the following applicant has been registered with the Mentorship Programme:</p>`;

    body += '<table style="width:100%; border-collapse:collapse; font-size:15px;">';
    Object.entries(user).forEach(([k,v]) => {
      const label = k.charAt(0).toUpperCase() + k.slice(1);
      body += `
        <tr>
          <td style="padding:8px 6px; width:35%; vertical-align:top; color:#374151;"><strong>${label}</strong></td>
          <td style="padding:8px 6px; vertical-align:top;">${String(v)}</td>
        </tr>`;
    });
    body += `
      <tr>
        <td style="padding:8px 6px; color:#374151;"><strong>Registration status</strong></td>
        <td style="padding:8px 6px;"><strong>${paidText}</strong></td>
      </tr>`;
    body += `
      <tr>
        <td style="padding:8px 6px; color:#374151;"><strong>Date</strong></td>
        <td style="padding:8px 6px;">${date}</td>
      </tr>`;
    body += '</table>';

    body += '<hr style="margin:18px 0; border:none; border-top:1px solid #e6e6e6" />';
    body += '<p style="font-size:13px; color:#6b7280">This document confirms registration on the FWIL mentorship program. This notice is issued by For Women in Law.</p>';
    body += '</div>';

    return `<!doctype html><html><head><meta charset="utf-8"><title>FWIL Confirmation</title></head><body style="padding:28px; font-family:Arial, sans-serif; color:#111; max-width:800px; margin:0 auto;">${header}${body}</body></html>`;
  };

  // Open printable window for PDF (uses print-to-PDF in browser)
  const downloadPDF = (row) => {
    if (!row) return;
    const html = buildConfirmationHtml(row);
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) { alert('Popups blocked — allow popups for this site to download PDF.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    // small delay to allow images to load
    setTimeout(() => { w.focus(); w.print(); }, 500);
  };

  // Call serverless function to send confirmation email
  const emailConfirmation = async (row) => {
    if (!row) return;
    if (row.paid === null || row.paid === undefined) {
      alert('Payment status not set. Mark paid or unpaid before emailing confirmation.');
      return;
    }
    const confirm = window.confirm(`Send registration confirmation to ${row.email}?`);
    if (!confirm) return;
    setActionLoadingId(row.id);
    setMessage('');
    try {
      const resp = await fetch('/api/send-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id })
      });
      const json = await resp.json();
      if (!resp.ok) { setMessage(json?.error || 'Failed to send email.'); console.error('send-confirmation:', json); }
      else setMessage('Confirmation email sent.');
    } catch (err) { console.error(err); setMessage('Network error sending email.'); }
    finally { setActionLoadingId(null); }
  };

  // --- UI rendering ---------------------------------------------------------
  return (
    <div className="fwil-page" style={{ minHeight: '100vh', padding: 20 }}>
      <header className="logo-header" style={{ marginBottom: 18 }}>
        <img src={fwilLogoPath} alt="FWIL" style={{ maxHeight: 56 }} />
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{ color: '#8B1E3F', marginBottom: 6 }}>Admin — Mentorship Applications</h2>
        <p style={{ color: '#475569', marginBottom: 18 }}>Search, filter and mark applications as paid. Use Details to download or email a confirmation.</p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <input placeholder="Search by name, email, contact..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }} />
          <button className="btn primary" onClick={onSearch} disabled={loading}>{loading ? 'Searching...' : 'Search'}</button>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: 10, borderRadius: 10 }}>
            <option value="">All status</option><option value="Student">Student</option><option value="Graduate">Graduate</option>
          </select>

          <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} style={{ padding: 10, borderRadius: 10 }}>
            <option value="">All locations</option><option value="Pretoria">Pretoria</option><option value="Johannesburg">Johannesburg</option><option value="Outside Gauteng">Outside Gauteng</option>
          </select>

          <select value={paidFilter} onChange={(e) => setPaidFilter(e.target.value)} style={{ padding: 10, borderRadius: 10 }}>
            <option value="">All payment</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option>
          </select>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn ghost-dark" onClick={() => { setQuery(''); setStatusFilter(''); setLocationFilter(''); setPaidFilter(''); setPage(1); fetchRows(); }}>Reset</button>
            <button className="btn ghost-dark" onClick={() => { setPage(1); fetchRows(); }}>Refresh</button>
          </div>
        </div>

        {message && <div style={{ marginBottom: 12, color: '#b91c1c' }}>{message}</div>}

        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((row) => (
            <div key={row.id} style={{ background: '#fff', padding: 16, borderRadius: 12, boxShadow: '0 6px 20px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name} {row.surname} <span style={{ fontWeight: 600, color: '#64748b', fontSize: 13 }}>({row.status || '—'})</span></div>
                <div style={{ color: '#475569' }}>{row.email} • {row.contact}</div>
                <div style={{ marginTop: 6, fontSize: 13 }}><strong>Location:</strong> {row.location || '—'} • <strong>Paid:</strong> {row.paid ? 'Yes' : 'No'}</div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn ghost-dark" onClick={() => setSelected(row)}>Details</button>
                {!row.paid && <button className="btn primary" onClick={() => markPaid(row.id)} disabled={actionLoadingId === row.id}>{actionLoadingId === row.id ? 'Marking...' : 'Mark as paid'}</button>}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* DETAILS modal */}
      {selected && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-panel" style={{ maxWidth: 720 }}>
            <div className="modal-head">
              <button className="link-back" onClick={() => setSelected(null)}>← Close</button>
              <h3 style={{ color:'#0b0f1e' }}>Applicant details</h3>
              <span className="chip">{selected.status || 'Applicant'}</span>
            </div>

            <div className="modal-body">
              {/* Clean list of only user-entered fields */}
              <div style={{ background:'#fff', borderRadius:10, padding:14, border:'1px solid #eef2f7' }}>
                {Object.entries(getUserFields(selected)).map(([k,v]) => (
                  <div key={k} style={{ display:'flex', gap:12, padding:'6px 0', borderBottom:'1px solid #f3f4f6' }}>
                    <div style={{ width:160, color:'#374151', fontWeight:700 }}>{k.charAt(0).toUpperCase()+k.slice(1)}</div>
                    <div style={{ color:'#0f172a' }}>{String(v)}</div>
                  </div>
                ))}

                {/* Paid status row */}
                <div style={{ display:'flex', gap:12, padding:'10px 0' }}>
                  <div style={{ width:160, color:'#374151', fontWeight:700 }}>Payment</div>
                  <div>
                    <div style={{ fontWeight:800, color: selected.paid ? '#065f46' : '#b91c1c' }}>{selected.paid ? 'Paid' : 'Not paid'}</div>
                    <div style={{ color:'#64748b', fontSize:13, marginTop:6 }}>
                      {selected.paid ? 'Registration confirmed as paid.' : 'Registration pending payment.'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn ghost-dark" onClick={() => setSelected(null)}>Close</button>

                {/* Download only available when record exists */}
                <button className="btn ghost-dark" onClick={() => downloadPDF(selected)}>Download PDF</button>

                {/* Email only allowed when paid state is defined (true/false) */}
                <button className="btn primary" onClick={() => emailConfirmation(selected)} disabled={actionLoadingId === selected.id || selected.paid === undefined || selected.paid === null}>
                  {actionLoadingId === selected.id ? 'Sending...' : 'Email confirmation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
