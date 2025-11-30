// FILE: src/components/MentorshipForm.jsx
import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import './MentorshipForm.css';

console.log("🔥 MentorshipForm loaded");

// read images from public/ to avoid bundler import issues
const fwilLogoPath = '/fw_logo.jpg';
const heroImagePath = '/hero_african_lawyer.jpg';

// Supabase client (reads from env) - accept REACT_APP_ or VITE_ formats
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
const PAYFAST_URL = process.env.REACT_APP_PAYFAST_URL || 'https://www.payfast.co.za/eng/process';
const PAYFAST_MERCHANT_ID = process.env.REACT_APP_PAYFAST_MERCHANT_ID || '';
const PAYFAST_MERCHANT_KEY = process.env.REACT_APP_PAYFAST_MERCHANT_KEY || '';

export default function MentorshipForm() {
  const [showForm, setShowForm] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [appRow, setAppRow] = useState(null);

  const [formData, setFormData] = useState({
    status: '', name: '', surname: '', email: '', contact: '', location: ''
  });
  const [errors, setErrors] = useState({});

useEffect(() => {
  console.log("🔥 FWIL APP RENDERED");
  document.body.style.overflow = (showForm || showPay) ? 'hidden' : 'auto';
  return () => { document.body.style.overflow = 'auto'; };
}, [showForm, showPay]);


  const openFormFor = (status) => {
    setFormData(f => ({ ...f, status }));
    setErrors({});
    setShowForm(true);
  };

  const update = (e) => {
    const { name, value, type } = e.target;
    // radio buttons send value via onChange with name property; handle that
    if (type === 'radio') {
      setFormData(f => ({ ...f, location: value }));
    } else {
      setFormData(f => ({ ...f, [name]: value }));
    }
  };

  const validateDetails = () => {
    const e = {};
    if (!formData.name.trim()) e.name = 'Required';
    if (!formData.surname.trim()) e.surname = 'Required';
    if (!formData.email.trim()) e.email = 'Required';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) e.email = 'Invalid email';
    if (!formData.contact.trim()) e.contact = 'Required';
    if (formData.contact && !/^[0-9+\s()-]{7,}$/.test(formData.contact)) e.contact = 'Invalid number';
    if (!formData.location) e.location = 'Choose a city';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

// Replace your existing saveAndOpenPay with this exact function
const saveAndOpenPay = async () => {
  if (!validateDetails()) return;
  setSaving(true);

  try {
    const payload = {
      status: formData.status,
      name: formData.name,
      surname: formData.surname,
      email: formData.email,
      contact: formData.contact,
      location: formData.location,
      paid: false
    };

    if (!supabase || !supabase.from) {
      console.error('Supabase client not initialized. SUPA_URL or SUPA_KEY may be missing.');
      alert('Supabase client not initialized. Check env variables and restart dev server.');
      setSaving(false);
      return;
    }

    console.log('Attempting insert payload:', payload);

    const res = await supabase
      .from('mentorship_applications')
      .insert([payload])
      .select()
      .single();

    // res may be { data, error } or similar depending on SDK version
    console.log('Supabase insert result:', res);

    // handle shape where result is { data, error }
    const data = res?.data ?? res?.[0] ?? null;
    const error = res?.error ?? (Array.isArray(res) ? null : res?.[1]) ?? null;

    if (error) {
      // more logging: if error.details or code exists
      console.error('Insert returned error object:', error);
      // If the SDK returned httpResponse in nested error, log it
      if (error?.details) console.error('Error details:', error.details);
      if (error?.status) console.error('HTTP status:', error.status);

      // Try to extract server logs or response if present
      try {
        // Some SDK shapes include `error` with `.response` or `.originalError`
        console.error('Raw error full object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      } catch (jsonErr) {
        // ignore stringify errors
      }

      // Show the user a helpful message and fallback
      alert('Failed to save application on server. See console for details.');

      // Fallback: save the application locally so you can continue to payment (local test)
      const fallbackId = 'local-' + Date.now();
      const fallbackRow = { id: fallbackId, ...payload, created_at: new Date().toISOString() };
      localStorage.setItem('fwil_fallback_application', JSON.stringify(fallbackRow));
      setAppRow(fallbackRow);
      setShowForm(false);
      setShowPay(true);
      setSaving(false);
      return;
    }

    // success path
    console.log('Insert succeeded, data:', data);
    setAppRow(data);
    setShowForm(false);
    setShowPay(true);
    setSaving(false);
  } catch (err) {
    console.error('Unexpected exception during insert:', err);
    // If err has response, log it
    if (err?.response) console.error('Exception response:', err.response);
    alert('Unexpected error saving application. See console for details.');

    // fallback local save so the flow continues while you fix server
    const fallbackId = 'local-' + Date.now();
    const fallbackRow = { id: fallbackId, status: formData.status, name: formData.name, surname: formData.surname, email: formData.email, contact: formData.contact, location: formData.location, created_at: new Date().toISOString(), paid: false };
    localStorage.setItem('fwil_fallback_application', JSON.stringify(fallbackRow));
    setAppRow(fallbackRow);
    setShowForm(false);
    setShowPay(true);
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
            <h1>Empowering women in law through mentorship, career guidance & legal education.</h1>
            <p className="lede">
              Apply to join our mentorship program. Choose your path below and complete your details — all in this window.
            </p>

            <div className="cta-row">
              <button className="btn primary" onClick={() => openFormFor('Student')}>Apply as Student</button>
              <button className="btn ghost" onClick={() => openFormFor('Graduate')}>Apply as Graduate</button>
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
              <div className="form-grid">
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
                  <input name="email" type="email" value={formData.email} onChange={update} placeholder="you@example.com" />
                  {errors.email && <span className="err">{errors.email}</span>}
                </div>

                <div className="form-field">
                  <label>Contact number</label>
                  <input name="contact" value={formData.contact} onChange={update} placeholder="+27 ..." />
                  {errors.contact && <span className="err">{errors.contact}</span>}
                </div>

                <div className="form-field full">
                  <label>Location</label>
                  <div className="segmented">
                    <input type="radio" id="pta" name="location" value="Pretoria" checked={formData.location === 'Pretoria'} onChange={update} />
                    <label htmlFor="pta">Pretoria</label>
                    <input type="radio" id="jhb" name="location" value="Johannesburg" checked={formData.location === 'Johannesburg'} onChange={update} />
                    <label htmlFor="jhb">Johannesburg</label>
                  </div>
                  {errors.location && <span className="err">{errors.location}</span>}
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn ghost-dark" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn primary" onClick={saveAndOpenPay} disabled={saving}>
                {saving ? 'Saving...' : 'Continue to payment'}
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
              <span className="pill">R350</span>
            </div>

            <div className="modal-body">
              <div className="summary">
                <div className="row"><span className="label">Applying as</span><span className="val">{appRow.status}</span></div>
                <div className="row"><span className="label">Name</span><span className="val">{appRow.name} {appRow.surname}</span></div>
                <div className="row"><span className="label">Email</span><span className="val">{appRow.email}</span></div>
                <div className="row"><span className="label">Contact</span><span className="val">{appRow.contact}</span></div>
                <div className="row"><span className="label">Location</span><span className="val">{appRow.location}</span></div>
              </div>

              <form id="payfastForm" action={PAYFAST_URL} method="post" className="hidden-form">
                <input type="hidden" name="merchant_id" value={PAYFAST_MERCHANT_ID} />
                <input type="hidden" name="merchant_key" value={PAYFAST_MERCHANT_KEY} />
                <input type="hidden" name="amount" value="350" />
                <input type="hidden" name="item_name" value="FWIL Mentorship Application" />
                <input type="hidden" name="custom_str1" value={String(appRow.id)} />
                <input type="hidden" name="name_first" value={appRow.name} />
                <input type="hidden" name="name_last" value={appRow.surname} />
                <input type="hidden" name="email_address" value={appRow.email} />
                <input type="hidden" name="cell_number" value={appRow.contact} />
              </form>
            </div>

            <div className="modal-actions">
              <button className="btn ghost-dark" onClick={() => { setShowPay(false); setShowForm(true); }}>Cancel</button>
              <button className="btn primary" onClick={submitPayfast}>Pay R350 on PayFast</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
