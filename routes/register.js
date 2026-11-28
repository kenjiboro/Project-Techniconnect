const express = require('express');
const router = express.Router();
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|jpg|jpeg|png/;
    const ext = allowed.test(require('path').extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error('Only PDF, JPG, JPEG, PNG files are allowed.'));
  }
});

// --- Register: create user + registration request with ID document ---
router.post('/', upload.single('id_document'), async (req, res) => {
  const { email, password, first_name, middle_name, last_name, batch_year, college, contact_number, address } = req.body;
  if (!email || !password || !first_name || !last_name) {
    return res.status(400).send('Email, password, first name, and last name are required.');
  }
  if (password.length < 8) {
    return res.status(400).send('Password must be at least 8 characters.');
  }
  if (!req.file) {
    return res.status(400).send('A government-issued ID document is required.');
  }

  // Check existing email
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .limit(1);
  if (existing && existing.length > 0) {
    return res.status(409).send('An account with this email already exists.');
  }

  const hash = await bcrypt.hash(password, 10);

  // Upload ID document to Supabase Storage
  const fileExt = require('path').extname(req.file.originalname);
  const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExt}`;
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('id-documents')
    .upload(fileName, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false
    });

  if (uploadError) {
    console.error('Upload error:', uploadError);
    return res.status(500).send('Failed to upload ID document.');
  }

  const publicUrl = supabase.storage.from('id-documents').getPublicUrl(fileName).data.publicUrl;

  // Create user
  const { data: newUser, error: userError } = await supabase
    .from('users')
    .insert([{ email, password_hash: hash, role: 'alumni' }])
    .select('id')
    .single();

  if (userError) {
    return res.status(500).send('Failed to create account.');
  }

  // Create registration request
  const { error: reqError } = await supabase
    .from('registration_requests')
    .insert([{
      user_id: newUser.id,
      status: 'pending',
      id_document_path: publicUrl
    }]);

  if (reqError) {
    return res.status(500).send('Failed to submit registration request.');
  }

  // Save profile data now so it is ready when staff approves — is_verified stays false until then
  const { error: profileError } = await supabase
    .from('alumni_profiles')
    .insert([{
      user_id: newUser.id,
      first_name: first_name.trim(),
      middle_name: middle_name ? middle_name.trim() : null,
      last_name: last_name.trim(),
      batch_year: batch_year ? parseInt(batch_year) : null,
      college: college || null,
      email: email,
      contact_number: contact_number || null,
      address: address || null,
      is_verified: false
    }]);

  if (profileError) {
    console.error('Profile insert error:', profileError);
    // Non-fatal: registration request was already created, so continue
  }

  res.json({ success: true });
});

module.exports = router;
