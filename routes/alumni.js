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

// --- Privacy helpers ---
// Fields an alumnus can choose to show or hide. The name is always shown when listed;
// to hide the name too, the alumnus turns off "Appear in directory".
const DEFAULT_PRIVACY = { batch_year: true, college: true, program: true, email: false, contact_number: false };
const PRIVACY_FIELDS = Object.keys(DEFAULT_PRIVACY);

function getPrivacy(p) {
  return { ...DEFAULT_PRIVACY, ...(p.privacy_settings || {}) };
}

// Returns only what the owner allows others to see
function maskProfile(p) {
  const privacy = getPrivacy(p);
  const out = { id: p.id, first_name: p.first_name, last_name: p.last_name };
  PRIVACY_FIELDS.forEach((f) => { if (privacy[f]) out[f] = p[f]; });
  return out;
}

async function getOwnProfile(req) {
  const { data, error } = await supabase
    .from('alumni_profiles')
    .select('*')
    .eq('user_id', req.session.user.id)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0];
}

const norm = (s) => String(s || '').trim().toLowerCase();

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
  const { first_name, middle_name, last_name, batch_year, college, program, email, contact_number, address } = req.body;
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
      batch_year: batch_year ? parseInt(batch_year) : null, college,
      program: program || null, email,
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

// --- Alumni directory (opt-in, verified alumni only, respects each owner's privacy settings) ---
// Query params: q, college, batch_year
router.get('/directory', async (req, res) => {
  const me = await getOwnProfile(req);
  if (!me) return res.status(404).send('Profile not found.');
  if (!me.is_verified) return res.status(403).send('Only verified alumni can browse the directory.');

  const { data, error } = await supabase
    .from('alumni_profiles')
    .select('id, first_name, last_name, batch_year, college, program, email, contact_number, privacy_settings')
    .eq('is_verified', true)
    .eq('show_in_directory', true)
    .order('last_name', { ascending: true });

  if (error) return res.status(500).send('Server error.');

  // Mask first, then filter, so hidden fields can never be matched by a search
  let rows = (data || []).map(maskProfile);

  const { q, college, batch_year } = req.query;
  if (q && q.trim()) {
    const needle = norm(q);
    rows = rows.filter((r) =>
      [r.first_name, r.last_name, r.batch_year, r.college, r.program]
        .map(norm).join(' ').includes(needle)
    );
  }
  if (college && college.trim()) {
    rows = rows.filter((r) => norm(r.college).includes(norm(college)));
  }
  if (batch_year && !isNaN(parseInt(batch_year))) {
    rows = rows.filter((r) => r.batch_year === parseInt(batch_year));
  }

  res.json(rows);
});

// --- View one alumni profile (only the fields the owner allows) ---
router.get('/directory/:id', async (req, res) => {
  const me = await getOwnProfile(req);
  if (!me) return res.status(404).send('Profile not found.');
  if (!me.is_verified) return res.status(403).send('Only verified alumni can view profiles.');

  const { data, error } = await supabase
    .from('alumni_profiles')
    .select('id, first_name, last_name, batch_year, college, program, email, contact_number, privacy_settings')
    .eq('id', req.params.id)
    .eq('is_verified', true)
    .eq('show_in_directory', true)
    .limit(1);

  if (error) return res.status(500).send('Server error.');
  if (!data || data.length === 0) return res.status(404).send('Profile not available.');
  res.json(maskProfile(data[0]));
});

// --- Toggle directory opt-in ---
router.post('/directory/opt-in', async (req, res) => {
  const { show } = req.body; // boolean

  const { data: profile, error: findErr } = await supabase
    .from('alumni_profiles')
    .select('id, is_verified')
    .eq('user_id', req.session.user.id)
    .limit(1)
    .single();

  if (findErr || !profile) return res.status(404).send('Profile not found.');
  if (!profile.is_verified) return res.status(403).send('Only verified alumni can join the directory.');

  const { error: updErr } = await supabase
    .from('alumni_profiles')
    .update({ show_in_directory: !!show })
    .eq('id', profile.id);

  if (updErr) return res.status(500).send('Update failed.');
  res.json({ success: true, show_in_directory: !!show });
});

// --- Privacy settings: which fields other alumni may see ---
router.get('/privacy', async (req, res) => {
  const me = await getOwnProfile(req);
  if (!me) return res.status(404).send('Profile not found.');
  res.json({ show_in_directory: !!me.show_in_directory, fields: getPrivacy(me) });
});

router.post('/privacy', async (req, res) => {
  const me = await getOwnProfile(req);
  if (!me) return res.status(404).send('Profile not found.');
  if (!me.is_verified) return res.status(403).send('Only verified alumni can change directory privacy.');

  const incoming = (req.body && req.body.fields) || {};
  const fields = {};
  PRIVACY_FIELDS.forEach((f) => { fields[f] = incoming[f] === true || incoming[f] === 'true'; });

  const { error } = await supabase
    .from('alumni_profiles')
    .update({ privacy_settings: fields })
    .eq('id', me.id);

  if (error) return res.status(500).send('Update failed.');
  res.json({ success: true, fields });
});

// --- Job offers visible to this alumnus (published, not expired, matching college or program) ---
router.get('/job-offers', async (req, res) => {
  const me = await getOwnProfile(req);
  if (!me) return res.status(404).send('Profile not found.');
  if (!me.is_verified) return res.status(403).send('Only verified alumni can view job offers.');

  const { data, error } = await supabase
    .from('job_offers')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).send('Server error.');

  const today = new Date().toISOString().slice(0, 10);
  const myCollege = norm(me.college);
  const myProgram = norm(me.program);

  const rows = (data || []).filter((j) => {
    if (j.application_deadline && j.application_deadline < today) return false;
    const colleges = (j.target_colleges || []).map(norm);
    const programs = (j.target_programs || []).map(norm);
    if (colleges.length === 0 && programs.length === 0) return true; // open to all
    return (myCollege && colleges.includes(myCollege)) || (myProgram && programs.includes(myProgram));
  });

  res.json(rows);
});

module.exports = router;
