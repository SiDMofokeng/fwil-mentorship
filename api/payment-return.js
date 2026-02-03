// FILE: api/payment-return.js
const { createClient } = require("@supabase/supabase-js");

const SUPA_URL = process.env.SUPA_URL || "";
const SUPA_SERVICE = process.env.SUPA_SERVICE_ROLE || "";
const TABLE = process.env.SUPABASE_MENTORSHIP_TABLE || "mentorship_applications_2026";

module.exports = async (req, res) => {
    try {
        const pay = String(req.query.pay || "").toLowerCase(); // success | cancel
        const pid = String(req.query.pid || "");

        if (!pid || (pay !== "success" && pay !== "cancel")) {
            return res.status(400).send("Missing or invalid pay/pid");
        }

        if (!SUPA_URL || !SUPA_SERVICE) {
            return res.status(500).send("Missing SUPA_URL or SUPA_SERVICE_ROLE");
        }

        const supabase = createClient(SUPA_URL, SUPA_SERVICE);

        const nowIso = new Date().toISOString();

        const updates =
            pay === "success"
                ? {
                    paid: true,
                    payment_date: nowIso,
                    notes: `Marked PAID via return_url @ ${nowIso}`,
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

        const { error } = await supabase.from(TABLE).update(updates).eq("id", pid);

        if (error) {
            console.error("payment-return update error:", error);
            return res.status(500).send(error.message || "Update failed");
        }

        // redirect back to homepage without query params
        res.statusCode = 302;
        res.setHeader("Location", "/");
        res.end();
    } catch (e) {
        console.error("payment-return fatal:", e);
        return res.status(500).send("Server error");
    }
};
