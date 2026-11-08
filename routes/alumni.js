const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --- Alumni dashboard ---
router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'alumni-dashboard.html'));
});
const path = require('path');

// --- View own profile ---
router.get('/profile', async (req, res) => {
  const { data: profile, error } = await supabase
    .from('alumni_profiles')
    .select('*, users(email)')
    .eq('user_id', req.session.user.id)
    .limit(1);

  if (error) return res.status(500).send('Server error.');
  if (!profile || profile.length === 0) {
    return res.send('<h3>No profile found.</h3><p>Your registration request may still be pending approval.</p><a href="/alumni/dashboard">Back to dashboard</a>');
  }
  res.json(profile[0]);
});

// --- Update own profile ---
router.post('/profile', async (req, res) => {
  const { first_name, middle_name, last_name, batch_year, college, email, contact_number, address } = req.body;
  const { data: profile, error: findErr } = await supabase
    .from('alumni_profiles')
    .select('id')
    .eq('user_id', req.session.user.id)
    .limit(1);

  if (findErr || !profile || profile.length === 0) {
    return res.status(404).send('Profile not found.');
  }

  const { error: updErr } = await supabase
    .from('alumni_profiles')
    .update({
      first_name, middle_name: middle_name || null, last_name,
      batch_year: batch_year ? parseInt(batch_year) : null, college, email,
      contact_number, address, updated_at: new Date().toISOString()
    })
    .eq('id', profile[0].id);

  if (updErr) return res.status(500).send('Update failed.');
  res.json({ success: true, message: 'Profile updated successfully.' });
});

// --- Own request status ---
router.get('/request-status', async (req, res) => {
  const { data: requests, error } = await supabase
    .from('registration_requests')
    .select('*')
    .eq('user_id', req.session.user.id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) return res.status(500).send('Server error.');
  res.json(requests && requests.length > 0 ? requests[0] : { status: 'none' });
});

// --- API: announcements ---
router.get('/announcements', async (req, res) => {
  const { data: rows, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).send('Server error.');
  res.json(rows || []);
});

module.exports = router;
