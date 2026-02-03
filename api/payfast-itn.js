// FILE: api/payfast-itn.js
// PayFast ITN handler for Vercel
// - Signature check
// - Validate with PayFast
// - Update Supabase using YOUR REAL columns:
//   payfast_token (text), payfast_method (text), paid (bool),
//   payment_reference (text), payment_date (timestamp), notes (text)

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

// PayFast signature string builder (sorted keys, exclude signature, urlencode w/ spaces as +)
function buildSignatureString(data, passphrase) {
  const keys = Object.keys(data)
    .filter((k) => k !== "signature")
    .sort();

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
  return { ok: text.trim() === "VALID", raw: text };
}

async function updateSupabasePaid(data) {
  const supaUrl = process.env.SUPA_URL;
  const serviceKey = process.env.SUPA_SERVICE_ROLE;
  const table = process.env.SUPABASE_MENTORSHIP_TABLE || "mentorship_applications_2026";

  if (!supaUrl || !serviceKey) {
    throw new Error("Missing SUPA_URL or SUPA_SERVICE_ROLE in Vercel env");
  }

  // You are sending appRow.id into BOTH of these:
  // - m_payment_id (now added)
  // - custom_str1
  const rowId = data.m_payment_id || data.custom_str1;
  if (!rowId) throw new Error("Missing row id: expected m_payment_id or custom_str1");

  const paymentStatus = String(data.payment_status || "").toUpperCase();
  const isPaid = paymentStatus === "COMPLETE";

  // Match YOUR REAL columns exactly
  const updates = {
    paid: isPaid,
    payfast_token: data.token || null,
    payfast_method: data.payment_method || null,
    payment_reference: data.pf_payment_id || null,
    payment_date: new Date().toISOString(),
    notes: `ITN status=${paymentStatus} gross=${data.amount_gross || ""} fee=${data.amount_fee || ""} net=${data.amount_net || ""}`,
  };

  const url = `${supaUrl}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(rowId)}`;

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
  // PayFast expects 200 OK responses for ITN processing
  if (req.method !== "POST") {
    res.statusCode = 200;
    res.end("OK");
    return;
  }

  try {
    const rawBody = await readRawBody(req);
    const data = parseUrlEncoded(rawBody);

    const sandbox = (process.env.PAYFAST_SANDBOX || "false").toLowerCase() === "true";
    const passphrase = process.env.PAYFAST_PASSPHRASE || "";

    // Debug logs (this is what you need right now)
    console.log("ITN RECEIVED keys:", Object.keys(data));
    console.log("ITN payment_status:", data.payment_status);
    console.log("ITN m_payment_id:", data.m_payment_id, "custom_str1:", data.custom_str1);

    // 1) Signature check
    const sigString = buildSignatureString(data, passphrase);
    const expectedSig = md5(sigString);
    const gotSig = (data.signature || "").toLowerCase();

    if (!gotSig || expectedSig !== gotSig) {
      console.log("ITN SIGNATURE FAIL", { gotSig, expectedSig, passphraseSet: !!passphrase });
      res.statusCode = 400;
      res.end("Invalid signature");
      return;
    }

    // 2) Validate with PayFast
    const validation = await validateWithPayFast(rawBody, sandbox);
    console.log("ITN VALIDATION:", validation.raw.trim());

    if (!validation.ok) {
      res.statusCode = 400;
      res.end("PayFast validation failed");
      return;
    }

    // 3) Update Supabase
    await updateSupabasePaid(data);

    res.statusCode = 200;
    res.end("OK");
  } catch (err) {
    console.error("ITN ERROR:", err);
    res.statusCode = 500;
    res.end("Server error");
  }
};
