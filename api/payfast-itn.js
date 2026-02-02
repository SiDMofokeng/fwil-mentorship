// FILE: api/payfast-itn.js
const crypto = require("crypto");

function readRawBody(req) {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => resolve(data));
        req.on("error", reject);
    });
}

function parseUrlEncoded(body) {
    const params = new URLSearchParams(body);
    const obj = {};
    for (const [k, v] of params.entries()) obj[k] = v;
    return obj;
}

function buildSignatureString(data, passphrase) {
    const keys = Object.keys(data).filter((k) => k !== "signature").sort();
    const pairs = [];
    for (const k of keys) {
        const val = data[k] ?? "";
        pairs.push(`${k}=${encodeURIComponent(val).replace(/%20/g, "+")}`);
    }
    let str = pairs.join("&");
    if (passphrase && passphrase.trim().length > 0) {
        str += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`;
    }
    return str;
}

function md5(str) {
    return crypto.createHash("md5").update(str, "utf8").digest("hex");
}

async function validateWithPayFast(rawBody, sandbox) {
    const host = sandbox ? "sandbox.payfast.co.za" : "www.payfast.co.za";
    const url = `https://${host}/eng/query/validate`;

    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: rawBody,
    });

    const text = await resp.text();
    return text.trim() === "VALID";
}

async function updateSupabase(data) {
    // ✅ support both env naming styles
    const supaUrl =
        process.env.SUPABASE_URL ||
        process.env.SUPA_URL ||
        process.env.SUPA_URL?.trim();

    const serviceKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPA_SERVICE_ROLE ||
        process.env.SUPA_SERVICE_ROLE?.trim();

    const table =
        process.env.SUPABASE_MENTORSHIP_TABLE ||
        process.env.SUPABASE_TABLE ||
        "mentorship_applications_2026";

    if (!supaUrl || !serviceKey) {
        throw new Error("Missing SUPABASE_URL/SUPA_URL or SUPABASE_SERVICE_ROLE_KEY/SUPA_SERVICE_ROLE");
    }

    // ✅ PayFast standard field:
    // Use m_payment_id first, fallback to custom_str1
    const mPaymentId = data.m_payment_id || data.custom_str1;
    if (!mPaymentId) throw new Error("Missing m_payment_id (and custom_str1 fallback)");

    const paymentStatus = String(data.payment_status || "").toUpperCase();

    // Store metadata always
    const updates = {
        payment_method: data.payment_method || null,
        payment_reference: data.pf_payment_id || null,
        payment_date: new Date().toISOString(),
        payfast_token: data.token || null,
        payfast_status: paymentStatus || null,
    };

    // ✅ Only mark paid true when COMPLETE
    // Do NOT force paid=false for other statuses (prevents overwriting)
    if (paymentStatus === "COMPLETE") {
        updates.paid = true;
    }

    const url = `${supaUrl}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(mPaymentId)}`;

    const resp = await fetch(url, {
        method: "PATCH",
        headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
        },
        body: JSON.stringify(updates),
    });

    if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Supabase update failed: ${resp.status} ${t}`);
    }

    return true;
}

module.exports = async (req, res) => {
    if (req.method !== "POST") {
        res.statusCode = 200;
        res.end("OK");
        return;
    }

    try {
        const rawBody = await readRawBody(req);
        const data = parseUrlEncoded(rawBody);

        const sandbox = String(process.env.PAYFAST_SANDBOX || "false").toLowerCase() === "true";
        const passphrase = process.env.PAYFAST_PASSPHRASE || "";

        // 1) signature check
        const sigString = buildSignatureString(data, passphrase);
        const expectedSig = md5(sigString);
        const gotSig = String(data.signature || "").toLowerCase();

        if (!gotSig || expectedSig !== gotSig) {
            res.statusCode = 400;
            res.end("Invalid signature");
            return;
        }

        // 2) validate with PayFast
        const isValid = await validateWithPayFast(rawBody, sandbox);
        if (!isValid) {
            res.statusCode = 400;
            res.end("PayFast validation failed");
            return;
        }

        // 3) update supabase
        await updateSupabase(data);

        res.statusCode = 200;
        res.end("OK");
    } catch (err) {
        console.error("ITN ERROR:", err);
        res.statusCode = 500;
        res.end("Server error");
    }
};
