# TechniConnect — Supabase Database Schema
# Run this in your Supabase project's SQL Editor (https://app.supabase.com/project/_/sql)

-- Enable UUID extension if needed
-- create extension if not exists "uuid-ossp";

-- 1. users table (alumni + staff accounts)
create table if not exists users (
  id bigserial primary key,
  email text unique not null,
  password_hash text not null,
  role text not null check (role in ('alumni', 'staff')),
  created_at timestamptz default now()
);

-- 2. alumni_profiles (main data entity)
create table if not exists alumni_profiles (
  id bigserial primary key,
  user_id bigint unique references users(id) on delete cascade,
  student_id text unique,
  first_name text not null,
  middle_name text,
  last_name text not null,
  batch_year integer,
  college text,
  email text,
  contact_number text,
  address text,
  is_verified boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. registration_requests (pending verification)
create table if not exists registration_requests (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  id_document_path text,
  admin_notes text,
  reviewed_by bigint references users(id),
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

-- 4. announcements
create table if not exists announcements (
  id bigserial primary key,
  title text not null,
  content text not null,
  published boolean default true,
  created_at timestamptz default now(),
  created_by bigint references users(id)
);

-- Indexes for common queries
create index if not exists idx_users_email on users(email);
create index if not exists idx_users_role on users(role);
create index if not exists idx_alumni_profiles_user_id on alumni_profiles(user_id);
create index if not exists idx_reg_requests_user_id on registration_requests(user_id);
create index if not exists idx_reg_requests_status on registration_requests(status);

-- Seed default staff account (password: admin123)
insert into users (email, password_hash, role)
values ('staff@cit.edu', '\$2a\$10\$K7L1M2N3O4P5Q6R7S8T9U0V1W2X3Y4Z5', 'staff')
on conflict (email) do nothing;

-- Seed sample announcements
insert into announcements (title, content, created_by)
values
  ('Welcome to TechniConnect', 'Welcome to the CIT-U alumni platform. Register and verify your account to access alumni services.', 1),
  ('Graduation Season Notice', 'Alumni document requests may take longer during graduation season. Please plan ahead.', 1),
  ('Campus Alumni Homecoming', 'Join us for the annual alumni homecoming event. Details to be announced.', 1)
on conflict do nothing;

-- 5. Storage bucket for ID documents
-- Create this bucket in Supabase Dashboard > Storage > New Bucket:
--   Bucket name: id-documents
--   Public: true (so staff can view uploaded IDs via public URL)
--   File size limit: 5 MB
--   Allowed MIME types: application/pdf, image/jpeg, image/png, image/jpg
