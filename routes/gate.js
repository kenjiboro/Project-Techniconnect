const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { sendGateAlertEmail } = require('../mailer');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000; // ignore the same card tapped again within 2 minutes

// Shared by the gate scanner and the staff "test scan" form.
async function recordScan(cardUid, gate) {
  const uid = String(cardUid || '').trim().toUpperCase();
  if (!uid) return { status: 400, body: { ok: false, message: 'Card number is required.' } };

  const { data: prof } = await supabase
    .from('alumni_profiles')
    .select('id, first_name, last_name, batch_year, college, program, is_verified')
    .eq('id_card_uid', uid)
    .limit(1)
    .maybeSingle();

  if (!prof) return { status: 404, body: { ok: false, message: 'Card not registered.' } };
  if (!prof.is_verified) return { status: 403, body: { ok: false, message: 'Alumni account is not verified.' } };

  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const { data: recent } = await supabase
    .from('gate_scans').select('id').eq('alumni_id', prof.id).gte('scanned_at', since).limit(1);
  const name = `${prof.first_name} ${prof.last_name}`;
  if (recent && recent.length) return { status: 200, body: { ok: true, duplicate: true, name, message: 'Already logged.' } };

  const gateName = String(gate || 'Main Gate').trim().slice(0, 60) || 'Main Gate';
  const { error } = await supabase.from('gate_scans').insert([{ alumni_id: prof.id, card_uid: uid, gate: gateName }]);
  if (error) { console.error('gate_scans insert error:', error); return { status: 500, body: { ok: false, message: 'Server error.' } }; }

  sendGateAlertEmail(prof, gateName).catch((e) => console.error('[mailer] gate alert failed:', e.message));
  return { status: 200, body: { ok: true, name, message: 'Welcome, ' + prof.first_name + '!' } };
}

// ---- Scanner endpoint (no login; protected by a shared key) ----
const scannerRouter = express.Router();
scannerRouter.post('/scan', async (req, res) => {
  const key = process.env.GATE_SCANNER_KEY;
  if (!key) return res.status(503).json({ ok: false, message: 'Scanner key is not configured.' });
  if (req.get('x-scanner-key') !== key) return res.status(401).json({ ok: false, message: 'Invalid scanner key.' });
  const r = await recordScan(req.body.card_uid, req.body.gate);
  res.status(r.status).json(r.body);
});

// ---- Staff endpoints (mounted behind requireStaff) ----
const staffRouter = express.Router();

staffRouter.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('gate_scans')
    .select('id, gate, scanned_at, is_read, alumni_profiles(first_name, last_name, batch_year, college, program)')
    .order('scanned_at', { ascending: false })
    .limit(100);
  if (error) return res.status(500).send('Server error.');
  res.json(data || []);
});

staffRouter.post('/read', async (req, res) => {
  const { error } = await supabase.from('gate_scans').update({ is_read: true }).eq('is_read', false);
  if (error) return res.status(500).send('Update failed.');
  res.json({ success: true });
});

staffRouter.post('/test-scan', async (req, res) => {
  const r = await recordScan(req.body.card_uid, req.body.gate);
  res.status(r.status).json(r.body);
});

module.exports = { scannerRouter, staffRouter };