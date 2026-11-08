const path = require('path');
const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  console.error('Set them before starting, e.g.:');
  console.error('  $env:SUPABASE_URL="https://your-project.supabase.co"');
  console.error('  $env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const fs = require('fs');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'techniconnect-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireStaff(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role !== 'staff') return res.status(403).send('Staff access only.');
  next();
}

function requireAlumni(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role !== 'alumni') return res.status(403).send('Alumni access only.');
  next();
}

app.use(require('./routes/auth'));
app.use('/register', require('./routes/register'));
app.use('/alumni', requireAuth, requireAlumni, require('./routes/alumni'));
app.use('/staff', requireAuth, requireStaff, require('./routes/staff'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'staff' ? '/staff/dashboard' : '/alumni/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/alumni/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});
app.get('/register-success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register-success.html'));
});

app.listen(PORT, () => {
  console.log(`TechniConnect server running at http://localhost:${PORT}`);
});
