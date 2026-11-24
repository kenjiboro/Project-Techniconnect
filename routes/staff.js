const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --- Staff dashboard ---
router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'staff-dashboard.html'));
});

// --- Verification queue ---
router.get('/verification-queue', async (req, res) => {
  const { data: rows, error } = await supabase
    .from('registration_requests')
    .select('*, users(email)')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).send('Server error.');
  res.json(rows || []);
});

// --- Approve/reject request ---
router.post('/verification-queue/:id/action', async (req, res) => {
  const { id } = req.params;
  const { action, admin_notes } = req.body;

  const { data: request, error: fetchErr } = await supabase
    .from('registration_requests')
    .select('*')
    .eq('id', id)
    .eq('status', 'pending')
    .limit(1)
    .single();

  if (fetchErr || !request) {
    return res.status(404).send('Request not found or already processed.');
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  const { error: updErr } = await supabase
    .from('registration_requests')
    .update({
      status: newStatus,
      admin_notes: admin_notes || null,
      reviewed_by: req.session.user.id,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', id);

  if (updErr) return res.status(500).send('Update failed.');

  if (newStatus === 'approved') {
    // Profile was created at registration time with is_verified = false.
    // On approval we simply mark it verified. If for any reason it is missing
    // (e.g. legacy registrations), we insert a minimal placeholder instead.
    const { data: existing } = await supabase
      .from('alumni_profiles')
      .select('id')
      .eq('user_id', request.user_id)
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabase
        .from('alumni_profiles')
        .insert([{ user_id: request.user_id, is_verified: true }]);
    } else {
      await supabase
        .from('alumni_profiles')
        .update({ is_verified: true })
        .eq('id', existing[0].id);
    }
  }

  res.json({ success: true, message: `Request ${newStatus}.` });
});

// --- Duplicate detection: check if a pending request matches an existing verified profile ---
router.get('/duplicate-check/:userId', async (req, res) => {
  // Get the pending registrant's profile data
  const { data: pending, error: pendingErr } = await supabase
    .from('alumni_profiles')
    .select('first_name, last_name, email')
    .eq('user_id', req.params.userId)
    .limit(1)
    .single();

  if (pendingErr || !pending) return res.json({ duplicates: [] });

  // Find verified profiles with the same name or email
  const { data: matches, error: matchErr } = await supabase
    .from('alumni_profiles')
    .select('id, first_name, last_name, email, batch_year, college')
    .eq('is_verified', true)
    .neq('user_id', req.params.userId)
    .or(
      `email.eq.${pending.email},` +
      `and(first_name.ilike.${pending.first_name},last_name.ilike.${pending.last_name})`
    );

  if (matchErr) return res.json({ duplicates: [] });
  res.json({ duplicates: matches || [] });
});

// --- Staff: search/view/maintain alumni records ---
router.get('/alumni-records', async (req, res) => {
  const { q } = req.query;
  let query = supabase
    .from('alumni_profiles')
    .select('*, users(email)')
    .order('created_at', { ascending: false });

  if (q) {
    query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,student_id.ilike.%${q}%,users.email.ilike.%${q}%`);
  }

  const { data: rows, error } = await query;
  if (error) return res.status(500).send('Server error.');
  res.json(rows || []);
});

router.get('/alumni-records/:id', async (req, res) => {
  const { data: row, error } = await supabase
    .from('alumni_profiles')
    .select('*, users(email)')
    .eq('id', req.params.id)
    .limit(1)
    .single();

  if (error || !row) return res.status(404).send('Record not found.');
  res.json(row);
});

router.post('/alumni-records/:id', async (req, res) => {
  const { first_name, middle_name, last_name, batch_year, college, email, contact_number, address } = req.body;
  const { error } = await supabase
    .from('alumni_profiles')
    .update({
      first_name, middle_name: middle_name || null, last_name,
      batch_year: batch_year ? parseInt(batch_year) : null, college, email,
      contact_number, address, updated_at: new Date().toISOString()
    })
    .eq('id', req.params.id);

  if (error) return res.status(500).send('Update failed.');
  res.json({ success: true, message: 'Record updated.' });
});

module.exports = router;
