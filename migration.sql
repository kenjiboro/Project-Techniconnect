-- Run once in the Supabase SQL editor

-- 1. New alumni profile columns
alter table alumni_profiles add column if not exists program text;
alter table alumni_profiles add column if not exists show_in_directory boolean default false;
alter table alumni_profiles add column if not exists privacy_settings jsonb
  default '{"batch_year":true,"college":true,"program":true,"email":false,"contact_number":false}'::jsonb;

-- 2. Job offers posted by staff
create table if not exists job_offers (
  id bigint generated always as identity primary key,
  company_name text not null,
  job_title text not null,
  description text,
  requirements text not null,
  qualifications text not null,
  contact_numbers text not null,
  contact_email text,
  location text,
  employment_type text,
  salary_range text,
  application_deadline date,
  target_colleges text[] not null default '{}',   -- empty + empty targets = open to all alumni
  target_programs text[] not null default '{}',
  published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table job_offers enable row level security; -- the server uses the service role key, which bypasses RLS
