// FILE: src/pages/AdminPanel.jsx
import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import '../components/MentorshipForm.css';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

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

  // --- Add export CSV helper (place inside AdminPanel component, e.g. after markPaid) ---
const exportApplicantsCsv = async () => {
  setMessage('Preparing CSV...');
  try {
    // Fetch ALL rows (no range) sorted by surname then name
    const res = await supabase
      .from('mentorship_applications')
      .select('*')
      .order('surname', { ascending: true })
      .order('name', { ascending: true });

    if (res.error) {
      console.error('Supabase fetch for CSV error', res.error);
      setMessage('Failed to fetch applicants for export.');
      return;
    }

    const all = res.data || [];
    if (!all.length) {
      setMessage('No applicants to export.');
      return;
    }

    // Columns to include (in this order). Add or remove keys if your table differs.
    const headers = [
      'id', 'status', 'name', 'surname', 'email', 'contact',
      'location', 'paid', 'created_at', 'payment_method', 'payment_reference', 'payment_date'
    ];

    // Build CSV string (UTF-8 BOM + rows)
    const escapeCell = (val) => {
      if (val === null || val === undefined) return '';
      const s = String(val);
      // escape quotes by doubling them, and wrap cell in quotes if it contains comma/newline/quote
      const needsQuotes = /[",\n\r]/.test(s);
      const escaped = s.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    };

    const csvRows = [];
    csvRows.push(headers.join(',')); // header row

    // Ensure alphabetical order (surname then name) as a safety net
    all.sort((a, b) => {
      const sa = String(a.surname || '').toLowerCase();
      const sb = String(b.surname || '').toLowerCase();
      if (sa < sb) return -1;
      if (sa > sb) return 1;
      // tie-breaker: name
      const na = String(a.name || '').toLowerCase();
      const nb = String(b.name || '').toLowerCase();
      if (na < nb) return -1;
      if (na > nb) return 1;
      return 0;
    });

    all.forEach(row => {
      const rowVals = headers.map(h => {
        // format booleans and dates for readability
        if (h === 'paid') return row.paid ? 'TRUE' : 'FALSE';
        if (h === 'created_at' || h === 'payment_date') return row[h] ? new Date(row[h]).toLocaleString() : '';
        return escapeCell(row[h]);
      });
      csvRows.push(rowVals.join(','));
    });

    const csvString = '\uFEFF' + csvRows.join('\r\n'); // BOM so Excel detects UTF-8
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = `fwil_applicants_${new Date().toISOString().slice(0,10)}.csv`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setMessage(`Exported ${all.length} applicants`);
  } catch (err) {
    console.error('CSV export error', err);
    setMessage('Unexpected error exporting CSV. See console.');
  }
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

// Build a printable HTML string (new professional layout)
const buildConfirmationHtml = (row) => {
  const user = getUserFields(row);
  const applicantName = `${row.name || ''} ${row.surname || ''}`.trim();
  const paid = row.paid ? 'PAID' : 'NOT PAID';
  const payColor = row.paid ? '#065f46' : '#b91c1c';
  const date = row.created_at
    ? new Date(row.created_at).toLocaleString()
    : new Date().toLocaleString();

  // Build detail rows
  let detailRows = '';
  Object.entries(user).forEach(([key, value]) => {
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    detailRows += `
      <div class="detail-row">
        <div class="detail-label">${label}</div>
        <div class="detail-value">${value}</div>
      </div>`;
  });

  // Add paid + date rows
  detailRows += `
    <div class="detail-row">
      <div class="detail-label">Registration status</div>
      <div class="detail-value" style="font-weight:700; color:${payColor};">${paid}</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Date</div>
      <div class="detail-value">${date}</div>
    </div>
  `;

  // HTML structure
  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <title>FWIL Confirmation</title>
    <style>
      body {
        padding: 32px;
        font-family: "Inter", Arial, sans-serif;
        color: #0B0F1E;
        background:#fff;
        max-width:800px;
        margin:0 auto;
        line-height:1.55;
      }
      .logo {
        max-height:70px;
        margin-bottom:16px;
      }
      .heading-main {
        font-size:26px;
        font-weight:800;
        color:#8B1E3F;
        margin-bottom:4px;
      }
      .subheading {
        font-size:16px;
        color:#475569;
        margin-bottom:24px;
      }
      .detail-block {
        margin-top:18px;
        border:1px solid #e5e7eb;
        border-radius:12px;
        padding:18px 20px;
        background:#fafafa;
      }
      .detail-row {
        display:flex;
        padding:8px 0;
        border-bottom:1px solid #eee;
      }
      .detail-row:last-child {
        border-bottom:none;
      }
      .detail-label {
        width:180px;
        font-weight:700;
        color:#374151;
      }
      .detail-value {
        flex:1;
        color:#0B0F1E;
      }
      .footer {
        margin-top:32px;
        font-size:13px;
        color:#6b7280;
        border-top:1px solid #e5e7eb;
        padding-top:12px;
      }
    </style>
  </head>

  <body>
    <img src="${fwilLogoPath}" class="logo" />

    <div class="heading-main">You Are Fully Registered for the FWIL Mentorship Programme</div>
    <div class="subheading">Thank you for joining the For Women in Law community.</div>

    <p><strong>Dear ${applicantName},</strong></p>

    <p>
      Thank you for registering for the <strong>For Women in Law Mentorship Programme</strong>.
      Your application has been successfully received.
    </p>

    <p style="margin-top:12px; font-size:15px; font-weight:700; color:${payColor};">
      ${paid}
    </p>

    <p>
      We appreciate your commitment to your legal career. The FWIL Mentorship Programme supports
      women in law through professional development, mentorship and community.
    </p>

    <h2 style="margin-top:24px; font-size:20px; font-weight:700;">Your Registration Details</h2>

    <div class="detail-block">
      ${detailRows}
    </div>

    <div class="footer">
      This document serves as an official confirmation of your registration with the
      For Women in Law Mentorship Programme. Please keep it for your records.
    </div>

    <p style="margin-top:20px;">
      Warm regards,<br />
      <strong>The For Women in Law Team</strong>
    </p>
  </body>
  </html>
  `;
};

// Replace downloadPDF with this:
const downloadPDF = async (row) => {
  if (!row) return;

  try {
    // 1. Build the full HTML page content
    const html = buildConfirmationHtml(row);

    // 2. Create hidden iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    iframe.style.width = '800px';
    iframe.style.height = '1200px';
    document.body.appendChild(iframe);

    // 3. Write HTML into iframe
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();

    // 4. Wait for all images (logo) to load
    await new Promise((resolve) => {
      const imgs = iframe.contentDocument.images;
      if (imgs.length === 0) return resolve();

      let loaded = 0;
      for (let i = 0; i < imgs.length; i++) {
        imgs[i].onload = imgs[i].onerror = () => {
          loaded++;
          if (loaded === imgs.length) resolve();
        };
      }

      // fallback timeout
      setTimeout(resolve, 2500);
    });

    // 5. Wait a moment for layout
    await new Promise((r) => setTimeout(r, 180));

    // 6. Render the iframe body to canvas
    const canvas = await html2canvas(iframe.contentDocument.body, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff'
    });

    // 7. Generate PDF
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;

    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height / canvas.width) * imgWidth;
    const imgData = canvas.toDataURL('image/jpeg', 0.98);

    pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
    pdf.save(`FWIL_confirmation_${row.id || Date.now()}.pdf`);

    // Cleanup
    document.body.removeChild(iframe);

  } catch (err) {
    console.error('PDF ERROR:', err);
    alert('Failed to generate PDF. Check console for details.');
  }
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

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn ghost-dark" onClick={() => { setQuery(''); setStatusFilter(''); setLocationFilter(''); setPaidFilter(''); setPage(1); fetchRows(); }}>Reset</button>

            <button className="btn ghost-dark" onClick={() => { setPage(1); fetchRows(); }}>Refresh</button>

            <button
              className="btn ghost-dark"
              onClick={exportApplicantsCsv}
              title="Download all applicants as CSV (alphabetical by surname)"
            >
              Download CSV
            </button>
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

              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
