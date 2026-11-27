const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const { sendApprovalEmail, sendRejectionEmail } = require('../mailer');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Strip characters that would break a PostgREST or() filter string
const clean = (s) => String(s || '').replace(/[,()%*\\]/g, ' ').trim();

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

  // Send email notification to the alumni (non-fatal if mail fails)
  try {
    const { data: userRow } = await supabase
      .from('users')
      .select('email')
      .eq('id', request.user_id)
      .single();

    const { data: profileRow } = await supabase
      .from('alumni_profiles')
      .select('first_name')
      .eq('user_id', request.user_id)
      .single();

    const toEmail = userRow?.email;
    const firstName = profileRow?.first_name || 'Alumni';

    if (toEmail) {
      if (newStatus === 'approved') {
        await sendApprovalEmail(toEmail, firstName);
      } else {
        await sendRejectionEmail(toEmail, firstName, admin_notes || null);
      }
    }
  } catch (mailErr) {
    console.error('[mailer] Failed to send notification email:', mailErr.message);
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

// --- Announcements: list all (staff sees unpublished too) ---
router.get('/announcements', async (req, res) => {
  const { data: rows, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).send('Server error.');
  res.json(rows || []);
});

// --- Announcements: create ---
router.post('/announcements', async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).send('Title and content are required.');
  const { error } = await supabase
    .from('announcements')
    .insert([{ title, content, published: true, created_by: req.session.user.id }]);
  if (error) return res.status(500).send('Failed to create announcement.');
  res.json({ success: true });
});

// --- Announcements: toggle published / update ---
router.post('/announcements/:id', async (req, res) => {
  const { title, content, published } = req.body;
  const updates = {};
  if (title !== undefined) updates.title = title;
  if (content !== undefined) updates.content = content;
  if (published !== undefined) updates.published = published === true || published === 'true';
  const { error } = await supabase
    .from('announcements')
    .update(updates)
    .eq('id', req.params.id);
  if (error) return res.status(500).send('Update failed.');
  res.json({ success: true });
});

// --- Announcements: delete ---
router.delete('/announcements/:id', async (req, res) => {
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).send('Delete failed.');
  res.json({ success: true });
});

// --- Staff: search/filter/sort/view alumni records ---
// Query params: q, college, batch_year, verified (true|false), sort, order (asc|desc)
const SORTABLE = ['last_name', 'first_name', 'email', 'batch_year', 'college', 'program',
                  'is_verified', 'show_in_directory', 'created_at'];

router.get('/alumni-records', async (req, res) => {
  const { q, college, batch_year, verified, sort, order } = req.query;
  let query = supabase
    .from('alumni_profiles')
    .select('*, users(email)');

  const s = clean(q);
  if (s) {
    query = query.or(
      `first_name.ilike.%${s}%,last_name.ilike.%${s}%,student_id.ilike.%${s}%,` +
      `email.ilike.%${s}%,college.ilike.%${s}%,program.ilike.%${s}%`
    );
  }
  if (clean(college)) query = query.ilike('college', `%${clean(college)}%`);
  if (batch_year && !isNaN(parseInt(batch_year))) query = query.eq('batch_year', parseInt(batch_year));
  if (verified === 'true' || verified === 'false') query = query.eq('is_verified', verified === 'true');

  const sortCol = SORTABLE.includes(sort) ? sort : 'created_at';
  const ascending = sort ? order !== 'desc' : false; // default: newest first
  query = query.order(sortCol, { ascending, nullsFirst: false });

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
  const { first_name, middle_name, last_name, batch_year, college, program, email, contact_number, address } = req.body;
  const { error } = await supabase
    .from('alumni_profiles')
    .update({
      first_name, middle_name: middle_name || null, last_name,
      batch_year: batch_year ? parseInt(batch_year) : null, college,
      program: program || null, email,
      contact_number, address, updated_at: new Date().toISOString()
    })
    .eq('id', req.params.id);

  if (error) return res.status(500).send('Update failed.');
  res.json({ success: true, message: 'Record updated.' });
});

// --- Job offers (staff) ---
function toList(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map((x) => x.trim()).filter(Boolean);
  return [];
}

router.get('/job-offers', async (req, res) => {
  const { data: rows, error } = await supabase
    .from('job_offers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).send('Server error.');
  res.json(rows || []);
});

router.post('/job-offers', async (req, res) => {
  const b = req.body;
  const required = ['company_name', 'job_title', 'requirements', 'qualifications', 'contact_numbers'];
  for (const f of required) {
    if (!b[f] || !String(b[f]).trim()) {
      return res.status(400).send('Company name, job title, requirements, qualifications, and contact numbers are required.');
    }
  }

  const { error } = await supabase.from('job_offers').insert([{
    company_name: b.company_name.trim(),
    job_title: b.job_title.trim(),
    description: b.description ? b.description.trim() : null,
    requirements: b.requirements.trim(),
    qualifications: b.qualifications.trim(),
    contact_numbers: b.contact_numbers.trim(),
    contact_email: b.contact_email ? b.contact_email.trim() : null,
    location: b.location ? b.location.trim() : null,
    employment_type: b.employment_type || null,
    salary_range: b.salary_range ? b.salary_range.trim() : null,
    application_deadline: b.application_deadline || null,
    target_colleges: toList(b.target_colleges),
    target_programs: toList(b.target_programs),
    published: true
  }]);

  if (error) {
    console.error('Job offer insert error:', error);
    return res.status(500).send('Failed to create job offer.');
  }
  res.json({ success: true });
});

// Toggle published
router.post('/job-offers/:id', async (req, res) => {
  const { published } = req.body;
  if (published === undefined) return res.status(400).send('Nothing to update.');
  const { error } = await supabase
    .from('job_offers')
    .update({ published: published === true || published === 'true' })
    .eq('id', req.params.id);
  if (error) return res.status(500).send('Update failed.');
  res.json({ success: true });
});

router.delete('/job-offers/:id', async (req, res) => {
  const { error } = await supabase
    .from('job_offers')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).send('Delete failed.');
  res.json({ success: true });
});

module.exports = router;
