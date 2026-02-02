// FILE: api/payfast-itn.js
const https = require('https');
const querystring = require('querystring');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// ----- ENV -----
const SUPA_URL = process.env.SUPA_URL || process.env.REACT_APP_SUPABASE_URL || '';
const SUPA_SERVICE =
    process.env.SUPA_SERVICE_ROLE ||
    process.env.REACT_APP_SUPABASE_SERVICE_ROLE ||
    '';

const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE || ''; // optional (only if you set one on PayFast)
const PAYFAST_VALIDATE_HOST = process.env.PAYFAST_VALIDATE_HOST || 'www.payfast.co.za';
const PAYFAST_VALIDATE_PATH = process.env.PAYFAST_VALIDATE_PATH || '/eng/query/validate';

const EXPECTED_MERCHANT_ID =
    process.env.REACT_APP_PAYFAST_MERCHANT_ID ||
    process.env.VITE_PAYFAST_MERCHANT_ID ||
    process.env.PAYFAST_MERCHANT_ID ||
    '';

const EXPECTED_AMOUNT = process.env.PAYFAST_EXPECTED_AMOUNT || '350.00'; // optional strict check (string)

function readRawBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => (data += chunk));
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

// Build param string exactly like PayFast expects (sorted, exclude signature)
function buildParamString(pfData) {
    const keys = Object.keys(pfData)
        .filter(k => k !== 'signature')
        .sort();

    const pairs = [];
    for (const k of keys) {
        const v = pfData[k];
        if (v === undefined || v === null) continue;
        // PayFast expects urlencoded key=value joined by &
        pairs.push(`${k}=${encodeURIComponent(String(v).trim()).replace(/%20/g, '+')}`);
    }

    let paramString = pairs.join('&');
    if (PAYFAST_PASSPHRASE) {
        paramString += `&passphrase=${encodeURIComponent(PAYFAST_PASSPHRASE.trim()).replace(/%20/g, '+')}`;
    }
    return paramString;
}

function md5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

function postToPayFastValidate(rawBody) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: PAYFAST_VALIDATE_HOST,
            path: PAYFAST_VALIDATE_PATH,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(rawBody),
            },
        };

        const r = https.request(options, resp => {
            let out = '';
            resp.on('data', d => (out += d));
            resp.on('end', () => resolve({ statusCode: resp.statusCode, body: out }));
        });

        r.on('error', reject);
        r.write(rawBody);
        r.end();
    });
}

module.exports = async (req, res) => {
    // PayFast sends POST (x-www-form-urlencoded)
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const raw = await readRawBody(req);
        const pfData = querystring.parse(raw);

        // 1) Basic presence checks
        const paymentStatus = String(pfData.payment_status || '');
        const mPaymentId = String(pfData.m_payment_id || ''); // your reference if you send it (optional)
        const customId = String(pfData.custom_str1 || ''); // we use this (Supabase row id)
        const signature = String(pfData.signature || '');

        // 2) Verify signature (local check)
        const paramString = buildParamString(pfData);
        const calculatedSig = md5(paramString);

        if (!signature || calculatedSig !== signature) {
            console.error('PayFast ITN signature mismatch', {
                calculatedSig,
                signature,
                sample: paramString.slice(0, 200),
            });
            return res.status(400).send('Invalid signature');
        }

        // 3) Optional merchant check (recommended)
        if (EXPECTED_MERCHANT_ID && String(pfData.merchant_id || '') !== String(EXPECTED_MERCHANT_ID)) {
            console.error('PayFast ITN merchant mismatch', {
                expected: EXPECTED_MERCHANT_ID,
                got: pfData.merchant_id,
            });
            return res.status(400).send('Merchant mismatch');
        }

        // 4) Server-side validation with PayFast (critical)
        const validateResp = await postToPayFastValidate(raw);
        const validateBody = (validateResp.body || '').trim();

        // PayFast returns "VALID" for good payload
        if (!/^VALID$/i.test(validateBody)) {
            console.error('PayFast validate failed', {
                statusCode: validateResp.statusCode,
                body: validateBody,
            });
            return res.status(400).send('Validation failed');
        }

        // 5) Only mark paid when COMPLETE
        if (paymentStatus !== 'COMPLETE') {
            console.log('PayFast ITN received but not COMPLETE', { paymentStatus, customId, mPaymentId });
            // Still respond 200 so PayFast stops retrying for non-complete statuses
            return res.status(200).send('OK');
        }

        // 6) Optional amount check (you can disable by leaving EXPECTED_AMOUNT empty)
        if (EXPECTED_AMOUNT) {
            const amountGross = String(pfData.amount_gross || '');
            // PayFast sometimes sends "350.00"
            if (amountGross && amountGross !== EXPECTED_AMOUNT) {
                console.error('PayFast amount mismatch', { expected: EXPECTED_AMOUNT, got: amountGross });
                return res.status(400).send('Amount mismatch');
            }
        }

        // 7) Update Supabase
        if (!SUPA_URL || !SUPA_SERVICE) {
            console.error('Server misconfigured: missing SUPA_URL or SUPA_SERVICE_ROLE');
            return res.status(500).send('Server misconfigured');
        }
        if (!customId) {
            console.error('Missing custom_str1 (row id) in ITN');
            return res.status(400).send('Missing reference');
        }

        const supabase = createClient(SUPA_URL, SUPA_SERVICE);

        const { error } = await supabase
            .from('mentorship_applications')
            .update({ paid: true })
            .eq('id', customId);

        if (error) {
            console.error('Supabase update failed', error);
            return res.status(500).send('Database update failed');
        }

        console.log('PayFast ITN: marked paid', { id: customId });

        // PayFast expects 200 OK
        return res.status(200).send('OK');
    } catch (err) {
        console.error('PayFast ITN unexpected error', err);
        return res.status(500).send('Server error');
    }
};
