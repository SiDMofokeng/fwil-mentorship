// FILE: src/components/MentorshipForm.jsx
import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import './MentorshipForm.css';

console.log("🔥 MentorshipForm loaded");

// read images from public/ to avoid bundler import issues
const fwilLogoPath = '/fw_logo.jpg';
const heroImagePath = '/hero_african_lawyer.jpg';

// Supabase client (reads from env) - accept REACT_APP_ or VITE_ prefixed envs
const SUPA_URL = process.env.REACT_APP_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPA_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
let supabase;
try {
  supabase = createClient(SUPA_URL, SUPA_KEY);
  console.log('Supabase init -> url:', SUPA_URL ? '(present)' : '(missing)', ' key:', SUPA_KEY ? '(present)' : '(missing)');
} catch (e) {
  console.error('Supabase client error', e);
  supabase = {
    from: () => ({ insert: async () => ({ error: new Error('Supabase client missing') }) })
  };
}

// PayFast config from env
const PAYFAST_URL = process.env.REACT_APP_PAYFAST_URL || process.env.VITE_PAYFAST_URL || 'https://www.payfast.co.za/eng/process';
const PAYFAST_MERCHANT_ID = process.env.REACT_APP_PAYFAST_MERCHANT_ID || process.env.VITE_PAYFAST_MERCHANT_ID || '';
const PAYFAST_MERCHANT_KEY = process.env.REACT_APP_PAYFAST_MERCHANT_KEY || process.env.VITE_PAYFAST_MERCHANT_KEY || '';

// put near your PayFast config at the top
const APP_BASE_URL =
  process.env.REACT_APP_APP_BASE_URL ||
  process.env.VITE_APP_BASE_URL ||
  'https://fwil-mentorship.vercel.app';

const PAYFAST_RETURN_URL =
  process.env.REACT_APP_PAYFAST_RETURN_URL ||
  process.env.VITE_PAYFAST_RETURN_URL ||
  `${APP_BASE_URL}/?pay=success`;

const PAYFAST_CANCEL_URL =
  process.env.REACT_APP_PAYFAST_CANCEL_URL ||
  process.env.VITE_PAYFAST_CANCEL_URL ||
  `${APP_BASE_URL}/?pay=cancel`;

const PAYFAST_AMOUNT =
  process.env.REACT_APP_PAYFAST_AMOUNT ||
  process.env.VITE_PAYFAST_AMOUNT ||
  '350';

// Explicitly reference to satisfy CI / ESLint
void PAYFAST_RETURN_URL;
void PAYFAST_CANCEL_URL;

function humanSupabaseError(err) {
  if (!err) return 'Something went wrong. Please try again.';

  const code = String(err.code || '');
  const msg = String(err.message || '');

  // Postgres unique violation
  if (code === '23505' || /duplicate key/i.test(msg)) {
    // If your unique constraint name includes email_unique
    if (/email/i.test(msg) || /email_unique/i.test(msg)) {
      return 'This email address has already been used to apply for Mentorship 2026. Please use a different email, or contact FWIL if you need help.';
    }
    return 'A duplicate record was detected. Please check your details and try again.';
  }

  // Common Supabase auth/RLS style responses
  if (/row level security/i.test(msg) || /permission/i.test(msg)) {
    return 'Your request was blocked by database security rules. Please contact the administrator.';
  }

  // Fallback
  return msg || 'Something went wrong. Please try again.';
}

export default function MentorshipForm() {
  const [showForm, setShowForm] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [appRow, setAppRow] = useState(null);
  const [payAmount, setPayAmount] = useState(String(PAYFAST_AMOUNT || '350'));
  const [bannerError, setBannerError] = useState(''); // NEW: nicer error display

  const [formData, setFormData] = useState({
    status: '', // 'Student' | 'Graduate'
    name: '',
    surname: '',
    email: '',
    contact: '',
    location: '' // 'Pretoria' | 'Johannesburg' | 'Outside Gauteng'
  });
  const [errors, setErrors] = useState({});

  // lock body scroll when modals are open
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pay = params.get('pay'); // success | cancel
    const pid = params.get('pid');

    if (!pid) return;
    if (pay !== 'success' && pay !== 'cancel') return;

    (async () => {
      try {
        if (!supabase || !supabase.from) return;

        const nowIso = new Date().toISOString();

        // IMPORTANT: your real column is payment_reference (not payfast_reference)
        const updates =
          pay === 'success'
            ? {
              paid: true,
              payment_date: nowIso,
              notes: `Marked PAID via return_url (no ITN) @ ${nowIso}`,
              payfast_token: null,
              payfast_method: null,
              payment_reference: null,
            }
            : {
              paid: false,
              payment_date: nowIso,
              notes: `Payment CANCELLED via cancel_url @ ${nowIso}`,
              payfast_token: null,
              payfast_method: null,
              payment_reference: null,
            };

        const { error } = await supabase
          .from('mentorship_applications_2026')
          .update(updates)
          .eq('id', pid);

        if (error) {
          console.error('Return/Cancel URL update failed:', error);
          alert(`Payment ${pay} detected, but failed to update database: ${humanSupabaseError(error)}`);
          return;
        }

        // Clean URL so refresh doesn't re-run the update
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);

        alert(
          pay === 'success'
            ? 'Payment success detected ✅ Database updated.'
            : 'Payment cancelled ❌ Database updated.'
        );
      } catch (e) {
        console.error('Return/Cancel URL update exception:', e);
        alert(`Payment ${pay} detected, but update crashed. Please contact support.`);
      }
    })();
  }, []);

  const openFormFor = (status) => {
    setFormData(f => ({ ...f, status })); // preselect but allow change inside form
    setErrors({});
    setBannerError('');
    setShowForm(true);
  };

  const update = (e) => {
    const { name, value, type } = e.target;
    if (type === 'radio') {
      setFormData(f => ({ ...f, [name]: value }));
    } else {
      setFormData(f => ({ ...f, [name]: value }));
    }

    // clear field-level error as user types
    setErrors(prev => {
      if (!prev[name]) return prev;
      const copy = { ...prev };
      delete copy[name];
      return copy;
    });
    setBannerError('');
  };

  const validateDetails = () => {
    const e = {};
    if (!formData.status) e.status = 'Choose student or graduate';
    if (!formData.name.trim()) e.name = 'Required';
    if (!formData.surname.trim()) e.surname = 'Required';
    if (!formData.email.trim()) e.email = 'Required';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) e.email = 'Invalid email';
    if (!formData.contact.trim()) e.contact = 'Required';
    if (formData.contact && !/^[0-9+\s()-]{7,}$/.test(formData.contact)) e.contact = 'Invalid number';
    if (!formData.location) e.location = 'Choose a location';

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // NEW: Pre-check duplicate email for nicer UX
  const emailAlreadyApplied = async (email) => {
    try {
      const clean = String(email || '').trim().toLowerCase();
      if (!clean) return { exists: false };

      const res = await supabase
        .from('mentorship_applications_2026')
        .select('id, paid, created_at')
        .eq('email', clean)
        .limit(1);

      if (res.error) {
        // If RLS prevents selects, we just can't pre-check. Insert will still catch 23505.
        console.warn('Email pre-check blocked or failed:', res.error);
        return { exists: false, unknown: true };
      }

      const row = (res.data || [])[0] || null;
      if (!row) return { exists: false };

      return { exists: true, row };
    } catch (err) {
      console.warn('Email pre-check exception:', err);
      return { exists: false, unknown: true };
    }
  };

  const saveAndOpenPay = async () => {
    setBannerError('');
    if (!validateDetails()) return;

    setSaving(true);

    try {
      if (!supabase || !supabase.from) {
        console.error('Supabase client not initialized. SUPA_URL or SUPA_KEY may be missing.');
        setBannerError('System error: database connection is not configured. Please contact the administrator.');
        setSaving(false);
        return;
      }

      // Normalize email to avoid duplicates by casing/spaces
      const normalizedEmail = String(formData.email || '').trim().toLowerCase();

      // 1) Pre-check duplicates for friendly message
      const dup = await emailAlreadyApplied(normalizedEmail);
      if (dup.exists) {
        setErrors(prev => ({ ...prev, email: 'This email has already applied.' }));
        setBannerError(
          `This email address has already been used to apply for Mentorship 2026. ` +
          `If this is you, please contact FWIL for assistance.`
        );
        setSaving(false);
        return;
      }

      const payload = {
        status: formData.status,
        name: formData.name,
        surname: formData.surname,
        email: normalizedEmail,
        contact: formData.contact,
        location: formData.location,
        // IMPORTANT: should be false until payment is confirmed
        paid: false,
      };

      console.log('Attempting insert payload:', payload);

      const res = await supabase
        .from('mentorship_applications_2026')
        .insert([payload])
        .select()
        .single();

      console.log('Supabase insert result:', res);

      const data = res?.data ?? null;
      const error = res?.error ?? null;

      if (error) {
        console.error('Insert returned error object:', error);
        try {
          console.error('Raw error full object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        } catch (jsonErr) { }

        const friendly = humanSupabaseError(error);

        // If it's the email unique error, attach it to the email field too
        if (String(error.code) === '23505' || /email_unique/i.test(String(error.message || ''))) {
          setErrors(prev => ({ ...prev, email: 'This email has already applied.' }));
        }

        setBannerError(friendly);
        setSaving(false);
        return;
      }

      // success path
      console.log('Insert succeeded, data:', data);
      setAppRow(data);
      setShowForm(false);
      setPayAmount(String(PAYFAST_AMOUNT || '350'));
      setShowPay(true);
      setSaving(false);
    } catch (err) {
      console.error('Unexpected exception during insert:', err);
      setBannerError('Unexpected error saving your application. Please try again, or contact FWIL if the issue persists.');
      setSaving(false);
    }
  };

  const submitPayfast = () => {
    const pf = document.getElementById('payfastForm');
    if (!pf) {
      alert('Payment form missing.');
      return;
    }
    pf.submit();
  };

  return (
    <div className="fwil-page">
      <header className="logo-header">
        <img src={fwilLogoPath} alt="For Women in Law" />
      </header>

      <section className="hero dark-bg">
        <div className="hero-inner">
          <div className="hero-left">
            <p className="tiny-tag">FOR WOMEN IN LAW</p>
            <h1>MENTORSHIP 2026</h1>
            <p className="lede">
              Exclusive to law students that are enrolled in a tertiary institution and graduates entering the profession within South Africa. The 8 week programme includes sessions during which the mentees are exposed to traditional and non-traditional career opportunities available within legal profession, and receive training in the following areas: CV/Cover Letter Drafting | Personal Branding | Mental health education | Professional Conduct | Articles, Pupillage & Alternatives | Interview prep: What recruiters want.
            </p>

            <div className="cta-row">
              <button className="btn primary" onClick={() => openFormFor('Student')}>Apply Here</button>
            </div>
          </div>

          <div className="hero-right">
            <div className="hero-card">
              <img className="hero-img" src={heroImagePath} alt="FWIL community" />
              <div className="hero-overlay">
                <span className="badge">MENTORSHIP & CAREER INSIGHT</span>
                <p className="caption">A glimpse of the FWIL community in action — inspiring and supporting one another.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {showForm && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-panel wide">
            <div className="modal-head">
              <button className="link-back" onClick={() => setShowForm(false)}>← Back</button>
              <h3>Tell us about you</h3>
              <span className="chip">{formData.status || 'Applicant'}</span>
            </div>

            <div className="modal-body">
              {/* NEW: friendly banner error */}
              {bannerError && (
                <div
                  style={{
                    background: '#fff1f2',
                    border: '1px solid #fecdd3',
                    color: '#9f1239',
                    padding: '10px 12px',
                    borderRadius: 10,
                    marginBottom: 12,
                    fontWeight: 700
                  }}
                >
                  {bannerError}
                </div>
              )}

              <div className="form-grid">
                {/* Status (Student / Graduate) */}
                <div className="form-field full">
                  <label>Are you a</label>
                  <div className="segmented" role="radiogroup" aria-label="Status">
                    <input
                      type="radio"
                      id="status_student"
                      name="status"
                      value="Student"
                      checked={formData.status === 'Student'}
                      onChange={update}
                    />
                    <label htmlFor="status_student">Law Student</label>

                    <input
                      type="radio"
                      id="status_graduate"
                      name="status"
                      value="Graduate"
                      checked={formData.status === 'Graduate'}
                      onChange={update}
                    />
                    <label htmlFor="status_graduate">Law Graduate</label>
                  </div>
                  {errors.status && <span className="err">{errors.status}</span>}
                </div>

                <div className="form-field">
                  <label>Name</label>
                  <input name="name" value={formData.name} onChange={update} placeholder="e.g., Noemi" />
                  {errors.name && <span className="err">{errors.name}</span>}
                </div>

                <div className="form-field">
                  <label>Surname</label>
                  <input name="surname" value={formData.surname} onChange={update} placeholder="e.g., Muya" />
                  {errors.surname && <span className="err">{errors.surname}</span>}
                </div>

                <div className="form-field">
                  <label>Email address</label>
                  <input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={update}
                    placeholder="you@example.com"
                    style={errors.email ? { borderColor: '#e11d48' } : undefined}
                  />
                  {errors.email && <span className="err">{errors.email}</span>}
                </div>

                <div className="form-field">
                  <label>Contact number</label>
                  <input name="contact" value={formData.contact} onChange={update} placeholder="+27 ..." />
                  {errors.contact && <span className="err">{errors.contact}</span>}
                </div>

                {/* Location: Pretoria, Johannesburg, Outside Gauteng */}
                <div className="form-field full">
                  <label>Location</label>
                  <div className="segmented" style={{ gridTemplateColumns: 'auto auto auto' }}>
                    <input type="radio" id="loc_pta" name="location" value="Pretoria" checked={formData.location === 'Pretoria'} onChange={update} />
                    <label htmlFor="loc_pta">Pretoria</label>

                    <input type="radio" id="loc_jhb" name="location" value="Johannesburg" checked={formData.location === 'Johannesburg'} onChange={update} />
                    <label htmlFor="loc_jhb">Johannesburg</label>

                    <input type="radio" id="loc_out" name="location" value="Outside Gauteng" checked={formData.location === 'Outside Gauteng'} onChange={update} />
                    <label htmlFor="loc_out">Outside Gauteng</label>
                  </div>
                  {errors.location && <span className="err">{errors.location}</span>}
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn ghost-dark" onClick={() => setShowForm(false)}>Cancel</button>
              <h5>NB: Please note that after paying the fee, you will be fully registered.</h5>
              <button className="btn primary" onClick={saveAndOpenPay} disabled={saving}>
                {saving ? 'Saving...' : 'Continue: once off fee R350'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPay && appRow && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-panel">
            <div className="modal-head">
              <button className="link-back" onClick={() => { setShowPay(false); setShowForm(true); }}>← Back</button>
              <h3>Confirm & Pay</h3>
              <span className="pill">R{payAmount || PAYFAST_AMOUNT}</span>
            </div>

            <div className="modal-body">
              <div className="summary">
                <div className="row"><span className="label">Applying as</span><span className="val">{appRow.status}</span></div>
                <div className="row"><span className="label">Name</span><span className="val">{appRow.name} {appRow.surname}</span></div>
                <div className="row"><span className="label">Email</span><span className="val">{appRow.email}</span></div>
                <div className="row"><span className="label">Contact</span><span className="val">{appRow.contact}</span></div>
                <div className="row"><span className="label">Location</span><span className="val">{appRow.location}</span></div>
              </div>

              <div style={{ marginTop: 14 }}>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>
                  Test amount (ZAR)
                </label>

                <input
                  type="number"
                  min="1"
                  step="1"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    fontSize: 16
                  }}
                  placeholder="350"
                />

                <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                  Use a small amount for testing. This will be sent to PayFast.
                </div>
              </div>

              <form id="payfastForm" action={PAYFAST_URL} method="post" className="hidden-form">
                <input type="hidden" name="merchant_id" value={PAYFAST_MERCHANT_ID} />
                <input type="hidden" name="merchant_key" value={PAYFAST_MERCHANT_KEY} />

                <input type="hidden" name="amount" value={payAmount || PAYFAST_AMOUNT} />
                <input type="hidden" name="item_name" value="FWIL Mentorship Application" />

                <input type="hidden" name="m_payment_id" value={String(appRow.id)} />
                <input type="hidden" name="custom_str1" value={String(appRow.id)} />

                <input type="hidden" name="name_first" value={appRow.name} />
                <input type="hidden" name="name_last" value={appRow.surname} />
                <input type="hidden" name="email_address" value={appRow.email} />
                <input type="hidden" name="cell_number" value={appRow.contact} />

                {/* IMPORTANT: update this later to your new domain once everything is confirmed */}
                <input
                  type="hidden"
                  name="notify_url"
                  value="https://fwil-mentorship.vercel.app/api/payfast-itn"
                />

                <input
                  type="hidden"
                  name="return_url"
                  value={`${APP_BASE_URL}/api/payment-return?pay=success&pid=${encodeURIComponent(String(appRow.id))}`}
                />

                <input
                  type="hidden"
                  name="cancel_url"
                  value={`${APP_BASE_URL}/api/payment-return?pay=cancel&pid=${encodeURIComponent(String(appRow.id))}`}
                />
              </form>
            </div>

            <div className="modal-actions">
              <button className="btn ghost-dark" onClick={() => { setShowPay(false); setShowForm(true); }}>Cancel</button>
              <button className="btn primary" onClick={submitPayfast}>
                Pay R{payAmount || PAYFAST_AMOUNT}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
