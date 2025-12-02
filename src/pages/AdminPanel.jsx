// FILE: src/pages/AdminPanel.jsx
import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import '../components/MentorshipForm.css';

const fwilLogoPath = '/fw_logo.jpg';

// Supabase read-only client (anon key)
const SUPA_URL = process.env.REACT_APP_SUPABASE_URL || '';
const SUPA_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPA_URL, SUPA_ANON || '');

// page component
export default function AdminPanel() {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '', 'Student', 'Graduate'
  const [locationFilter, setLocationFilter] = useState(''); // '', 'Pretoria', 'Johannesburg', 'Outside Gauteng'
  const [paidFilter, setPaidFilter] = useState(''); // '', 'paid', 'unpaid'
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null); // selected row for modal
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, locationFilter, paidFilter]);

  async function fetchRows() {
    setLoading(true);
    setMessage('');
    try {
      // build query with filters
      let qb = supabase
        .from('mentorship_applications')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      // search
      if (query && query.trim()) {
        const q = query.trim();
        // search by email, name, surname, contact
        qb = qb.or(`email.ilike.%${q}%,name.ilike.%${q}%,surname.ilike.%${q}%,contact.ilike.%${q}%`);
      }

      // filters applied via PostgREST .filter
      if (statusFilter) qb = qb.eq('status', statusFilter);
      if (locationFilter) qb = qb.eq('location', locationFilter);
      if (paidFilter) qb = qb.eq('paid', paidFilter === 'paid');

      const res = await qb;
      if (res.error) {
        console.error('Supabase fetch error', res.error);
        setMessage('Error fetching rows (check console).');
      } else {
        setRows(res.data || []);
        setTotal(res.count ?? (res.data ? res.data.length : 0));
        if (!res.data || res.data.length === 0) {
          setMessage('No results found for the current filters.');
        }
      }
    } catch (err) {
      console.error(err);
      setMessage('Unexpected error fetching rows.');
    } finally {
      setLoading(false);
    }
  }

  // search action: resets to page 1 then fetch
  const onSearch = async () => {
    setPage(1);
    await fetchRows();
  };

  // server call to mark as paid - uses Vercel serverless endpoint api/update-paid
  const markPaid = async (id) => {
    if (!window.prompt) return;
    const adminPwd = window.prompt('Enter admin password to confirm action'); // quick one-step auth prompt
    if (!adminPwd) return;

    setActionLoadingId(id);
    try {
      const resp = await fetch('/api/update-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, admin_password: adminPwd }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        console.error('update-paid error', json);
        setMessage(json?.error || 'Failed to mark as paid. Check server logs.');
      } else {
        setMessage('Marked as paid.');
        // update local state to reflect paid
        setRows((r) => r.map((row) => (row.id === id ? { ...row, paid: true } : row)));
        if (selected && selected.id === id) setSelected({ ...selected, paid: true });
      }
    } catch (err) {
      console.error(err);
      setMessage('Network error when calling server.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // open detail modal
  const openDetails = (row) => {
    setSelected(row);
  };

  // close modal
  const closeDetails = () => setSelected(null);

  // pagination helpers
  const nextPage = () => {
    if (rows.length === pageSize) setPage((p) => p + 1);
  };
  const prevPage = () => {
    if (page > 1) setPage((p) => p - 1);
  };

  return (
    <div className="fwil-page" style={{ minHeight: '100vh', padding: 20 }}>
      <header className="logo-header" style={{ marginBottom: 18 }}>
        <img src={fwilLogoPath} alt="FWIL" style={{ maxHeight: 56 }} />
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{ color: '#8B1E3F', marginBottom: 6 }}>Admin — Mentorship Applications</h2>
        <p style={{ color: '#475569', marginBottom: 18 }}>
          Search, filter and mark applications as paid. Results are paginated. Use the details button to view full
          applicant data.
        </p>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            aria-label="search"
            placeholder="Search by name, email, contact..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          />
          <button className="btn primary" onClick={onSearch} disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: 10, borderRadius: 10 }}>
            <option value="">All status</option>
            <option value="Student">Student</option>
            <option value="Graduate">Graduate</option>
          </select>

          <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} style={{ padding: 10, borderRadius: 10 }}>
            <option value="">All locations</option>
            <option value="Pretoria">Pretoria</option>
            <option value="Johannesburg">Johannesburg</option>
            <option value="Outside Gauteng">Outside Gauteng</option>
          </select>

          <select value={paidFilter} onChange={(e) => setPaidFilter(e.target.value)} style={{ padding: 10, borderRadius: 10 }}>
            <option value="">All payment states</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn ghost-dark" onClick={() => { setQuery(''); setStatusFilter(''); setLocationFilter(''); setPaidFilter(''); setPage(1); fetchRows(); }}>
              Reset
            </button>
            <button className="btn ghost-dark" onClick={() => { setPage(1); fetchRows(); }}>Refresh</button>
          </div>
        </div>

        {message && <div style={{ marginBottom: 12, color: '#b91c1c' }}>{message}</div>}

        {/* List */}
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((row) => (
            <div key={row.id} style={{ background: '#fff', padding: 16, borderRadius: 12, boxShadow: '0 6px 20px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ textAlign: 'left', minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.name} {row.surname} <span style={{ fontWeight: 600, color: '#64748b', fontSize: 13 }}>({row.status || '—'})</span>
                </div>
                <div style={{ color: '#475569' }}>{row.email} • {row.contact}</div>
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  <strong>Location:</strong> {row.location || '—'} • <strong>Paid:</strong> {row.paid ? 'Yes' : 'No'}
                </div>
                {row.created_at && <div style={{ color: '#94a3b8', marginTop: 6, fontSize: 13 }}>Applied: {new Date(row.created_at).toLocaleString()}</div>}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn ghost-dark" onClick={() => openDetails(row)}>Details</button>
                {!row.paid && (
                  <button className="btn primary" onClick={() => markPaid(row.id)} disabled={actionLoadingId === row.id}>
                    {actionLoadingId === row.id ? 'Marking...' : 'Mark as paid'}
                  </button>
                )}
              </div>
            </div>
          ))}

          {rows.length === 0 && !loading && <div style={{ color: '#64748b' }}>No results. Try changing filters or search text, then click Search.</div>}
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <div style={{ color: '#64748b' }}>Page {page} • Showing {rows.length} items</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost-dark" onClick={prevPage} disabled={page === 1}>Prev</button>
            <button className="btn ghost-dark" onClick={nextPage} disabled={rows.length < pageSize}>Next</button>
          </div>
        </div>
      </main>

      {/* Details modal */}
      {selected && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-panel" style={{ maxWidth: 760 }}>
            <div className="modal-head">
              <button className="link-back" onClick={closeDetails}>← Close</button>
              <h3>Applicant details</h3>
              <span className="chip">{selected.status || 'Applicant'}</span>
            </div>

            <div className="modal-body">
              <div style={{ display: 'grid', gap: 8 }}>
                <div><strong>Name:</strong> {selected.name} {selected.surname}</div>
                <div><strong>Email:</strong> {selected.email}</div>
                <div><strong>Contact:</strong> {selected.contact}</div>
                <div><strong>Location:</strong> {selected.location}</div>
                <div><strong>Paid:</strong> {selected.paid ? 'Yes' : 'No'}</div>
                <div><strong>Applied:</strong> {selected.created_at ? new Date(selected.created_at).toLocaleString() : '—'}</div>
                {/* show any extra fields present */}
                {Object.keys(selected).map((k) => {
                  if (['id','name','surname','email','contact','location','status','paid','created_at'].includes(k)) return null;
                  return <div key={k}><strong>{k}:</strong> {String(selected[k])}</div>;
                })}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn ghost-dark" onClick={closeDetails}>Close</button>
              {!selected.paid && <button className="btn primary" onClick={() => markPaid(selected.id)}>Mark as paid</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
