-- Resume Builder: the complete database in one file.
--
-- How it's used:
--   * Automatically: the API runs this file when it starts. Each "-- ===== <name>" block below is
--     one step. Steps already recorded in schema_migrations are skipped, so restarts are safe.
--   * By hand: Supabase → SQL Editor → paste this whole file → Run (on an empty database).
--
-- To change the database later, add a new block at the end, just above "-- ===== end", named
-- with the next number (for example 012_add_something.sql). Never edit a block that has already
-- run on a live database. New tables also need: ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());

-- ============================================================ 001_init.sql

-- =====================================================================
-- Resume Builder: PostgreSQL schema (migration 001)
--
-- Every piece of resume content has its own table. Child rows are keyed
-- by (resume_id, id) so a duplicated resume can keep the same entry ids
-- without collisions, and every child is removed when its resume is
-- deleted (ON DELETE CASCADE). Ownership is enforced through
-- resumes.user_id / jobs.user_id, which every query filters on.
-- =====================================================================

-- ---------- accounts ----------

CREATE TABLE users (
  id            uuid PRIMARY KEY,
  email         text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lower CHECK (email = lower(email))
);
CREATE UNIQUE INDEX users_email_key ON users (email);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,               -- SHA-256 of the cookie token; the token itself is never stored
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- ---------- job applications ----------

CREATE TABLE jobs (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       varchar(160) NOT NULL DEFAULT '',
  company     varchar(160) NOT NULL DEFAULT '',
  url         varchar(500) NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 30000),
  status      varchar(20) NOT NULL DEFAULT 'saved'
              CHECK (status IN ('saved','applied','interviewing','offer','rejected','withdrawn')),
  applied_at  date,
  notes       text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_user_idx ON jobs (user_id, updated_at DESC);

-- ---------- resumes ----------

CREATE TABLE resumes (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       varchar(120) NOT NULL,
  kind       varchar(10) NOT NULL CHECK (kind IN ('master','tailored')),
  parent_id  uuid REFERENCES resumes(id) ON DELETE SET NULL,   -- master a tailored copy was made from
  job_id     uuid REFERENCES jobs(id) ON DELETE SET NULL,      -- job this resume is matched/tailored to
  revision   integer NOT NULL DEFAULT 1,                       -- optimistic concurrency counter
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX resumes_user_idx ON resumes (user_id, updated_at DESC);
CREATE INDEX resumes_parent_idx ON resumes (parent_id);
CREATE INDEX resumes_job_idx ON resumes (job_id);

-- Layout and writing preferences (one row per resume). Kept apart from content.
CREATE TABLE resume_settings (
  resume_id       uuid PRIMARY KEY REFERENCES resumes(id) ON DELETE CASCADE,
  template        varchar(20) NOT NULL DEFAULT 'classic' CHECK (template IN ('classic','modern','compact','technical')),
  font_family     varchar(20) NOT NULL DEFAULT 'Helvetica' CHECK (font_family IN ('Helvetica','Times-Roman')),
  font_size       numeric(4,2) NOT NULL DEFAULT 10.5 CHECK (font_size BETWEEN 9 AND 12),
  margin          numeric(5,2) NOT NULL DEFAULT 48 CHECK (margin BETWEEN 28 AND 72),
  line_height     numeric(4,2) NOT NULL DEFAULT 1.3 CHECK (line_height BETWEEN 1.1 AND 1.6),
  section_spacing numeric(5,2) NOT NULL DEFAULT 10 CHECK (section_spacing BETWEEN 4 AND 20),
  accent_color    char(7) CHECK (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  heading_case    varchar(5) NOT NULL DEFAULT 'upper' CHECK (heading_case IN ('upper','title')),
  page_size       varchar(6) NOT NULL DEFAULT 'A4' CHECK (page_size IN ('A4','LETTER')),
  market          varchar(5) NOT NULL DEFAULT 'IN' CHECK (market IN ('IN','US','EU','OTHER')),
  date_format     varchar(8) NOT NULL DEFAULT 'MMM YYYY' CHECK (date_format IN ('MMM YYYY','MM/YYYY','YYYY-MM')),
  writing_style   varchar(12) NOT NULL DEFAULT 'balanced' CHECK (writing_style IN ('conservative','balanced','achievement'))
);

-- Order and visibility of sections in exports.
CREATE TABLE resume_sections (
  resume_id   uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  section_key varchar(20) NOT NULL
              CHECK (section_key IN ('summary','experience','projects','skills','education','certifications','additional')),
  position    smallint NOT NULL,
  hidden      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (resume_id, section_key)
);

-- ---------- resume content ----------
-- Text origin: 'user' (typed), 'imported' (from an uploaded file), 'ai' (an AI rewrite the user accepted).
-- source_text keeps the user's wording before an accepted AI rewrite, so it can be compared/restored.
-- Dates are 'YYYY-MM', 'YYYY' or '' because resumes often give only a year.

CREATE TABLE resume_contacts (
  resume_id uuid PRIMARY KEY REFERENCES resumes(id) ON DELETE CASCADE,
  full_name varchar(120) NOT NULL DEFAULT '',
  headline  varchar(160) NOT NULL DEFAULT '',
  email     varchar(200) NOT NULL DEFAULT '',
  phone     varchar(40)  NOT NULL DEFAULT '',
  location  varchar(120) NOT NULL DEFAULT ''
);

CREATE TABLE contact_links (
  resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  id        varchar(40) NOT NULL,
  position  smallint NOT NULL,
  label     varchar(60)  NOT NULL DEFAULT '',
  url       varchar(300) NOT NULL DEFAULT '',
  PRIMARY KEY (resume_id, id)
);

CREATE TABLE resume_summaries (
  resume_id   uuid PRIMARY KEY REFERENCES resumes(id) ON DELETE CASCADE,
  text        varchar(1500) NOT NULL DEFAULT '',
  origin      varchar(8) NOT NULL DEFAULT 'user' CHECK (origin IN ('user','imported','ai')),
  source_text varchar(1500)
);

CREATE TABLE experiences (
  resume_id       uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  id              varchar(40) NOT NULL,
  position        smallint NOT NULL,
  title           varchar(120) NOT NULL DEFAULT '',
  company         varchar(120) NOT NULL DEFAULT '',
  location        varchar(120) NOT NULL DEFAULT '',
  employment_type varchar(40)  NOT NULL DEFAULT '',
  start_date      varchar(7)   NOT NULL DEFAULT '' CHECK (start_date ~ '^$|^\d{4}(-(0[1-9]|1[0-2]))?$'),
  end_date        varchar(7)   NOT NULL DEFAULT '' CHECK (end_date   ~ '^$|^\d{4}(-(0[1-9]|1[0-2]))?$'),
  is_current      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (resume_id, id)
);

CREATE TABLE educations (
  resume_id   uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  id          varchar(40) NOT NULL,
  position    smallint NOT NULL,
  degree      varchar(160) NOT NULL DEFAULT '',
  field       varchar(160) NOT NULL DEFAULT '',
  institution varchar(160) NOT NULL DEFAULT '',
  location    varchar(120) NOT NULL DEFAULT '',
  start_date  varchar(7)   NOT NULL DEFAULT '' CHECK (start_date ~ '^$|^\d{4}(-(0[1-9]|1[0-2]))?$'),
  end_date    varchar(7)   NOT NULL DEFAULT '' CHECK (end_date   ~ '^$|^\d{4}(-(0[1-9]|1[0-2]))?$'),
  grade       varchar(60)  NOT NULL DEFAULT '',
  PRIMARY KEY (resume_id, id)
);

CREATE TABLE projects (
  resume_id  uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  id         varchar(40) NOT NULL,
  position   smallint NOT NULL,
  name       varchar(160) NOT NULL DEFAULT '',
  role       varchar(120) NOT NULL DEFAULT '',
  url        varchar(300) NOT NULL DEFAULT '',
  start_date varchar(7)   NOT NULL DEFAULT '' CHECK (start_date ~ '^$|^\d{4}(-(0[1-9]|1[0-2]))?$'),
  end_date   varchar(7)   NOT NULL DEFAULT '' CHECK (end_date   ~ '^$|^\d{4}(-(0[1-9]|1[0-2]))?$'),
  PRIMARY KEY (resume_id, id)
);

CREATE TABLE project_technologies (
  resume_id  uuid NOT NULL,
  project_id varchar(40) NOT NULL,
  position   smallint NOT NULL,
  name       varchar(60) NOT NULL,
  PRIMARY KEY (resume_id, project_id, position),
  FOREIGN KEY (resume_id, project_id) REFERENCES projects (resume_id, id) ON DELETE CASCADE
);

CREATE TABLE skill_groups (
  resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  id        varchar(40) NOT NULL,
  position  smallint NOT NULL,
  category  varchar(80) NOT NULL DEFAULT '',
  PRIMARY KEY (resume_id, id)
);

CREATE TABLE skill_items (
  resume_id uuid NOT NULL,
  group_id  varchar(40) NOT NULL,
  position  smallint NOT NULL,
  name      varchar(80) NOT NULL,
  PRIMARY KEY (resume_id, group_id, position),
  FOREIGN KEY (resume_id, group_id) REFERENCES skill_groups (resume_id, id) ON DELETE CASCADE
);
CREATE INDEX skill_items_name_idx ON skill_items (lower(name));

CREATE TABLE certifications (
  resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  id        varchar(40) NOT NULL,
  position  smallint NOT NULL,
  name      varchar(200) NOT NULL DEFAULT '',
  issuer    varchar(120) NOT NULL DEFAULT '',
  issued_on varchar(7)   NOT NULL DEFAULT '' CHECK (issued_on ~ '^$|^\d{4}(-(0[1-9]|1[0-2]))?$'),
  url       varchar(300) NOT NULL DEFAULT '',
  PRIMARY KEY (resume_id, id)
);

-- Free-form sections: Awards, Publications, Languages, Volunteering...
CREATE TABLE additional_sections (
  resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  id        varchar(40) NOT NULL,
  position  smallint NOT NULL,
  title     varchar(60) NOT NULL DEFAULT '',
  PRIMARY KEY (resume_id, id)
);

-- Bullet points. Each belongs to exactly one parent entry (enforced by CHECK);
-- real foreign keys keep them consistent and cascade on delete.
CREATE TABLE bullets (
  resume_id     uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  id            varchar(40) NOT NULL,
  experience_id varchar(40),
  education_id  varchar(40),
  project_id    varchar(40),
  additional_id varchar(40),
  position      smallint NOT NULL,
  text          varchar(600) NOT NULL DEFAULT '',
  origin        varchar(8) NOT NULL DEFAULT 'user' CHECK (origin IN ('user','imported','ai')),
  source_text   varchar(600),
  PRIMARY KEY (resume_id, id),
  CONSTRAINT bullets_one_parent CHECK (num_nonnulls(experience_id, education_id, project_id, additional_id) = 1),
  FOREIGN KEY (resume_id, experience_id) REFERENCES experiences (resume_id, id) ON DELETE CASCADE,
  FOREIGN KEY (resume_id, education_id)  REFERENCES educations (resume_id, id) ON DELETE CASCADE,
  FOREIGN KEY (resume_id, project_id)    REFERENCES projects (resume_id, id) ON DELETE CASCADE,
  FOREIGN KEY (resume_id, additional_id) REFERENCES additional_sections (resume_id, id) ON DELETE CASCADE
);
CREATE INDEX bullets_experience_idx ON bullets (resume_id, experience_id) WHERE experience_id IS NOT NULL;
CREATE INDEX bullets_origin_idx ON bullets (resume_id, origin);

-- ---------- version history ----------
-- Immutable point-in-time copies of a resume (content + settings) as JSONB.
-- A snapshot is history, not live data, so it is stored whole rather than normalized.

CREATE TABLE resume_versions (
  id         uuid PRIMARY KEY,
  resume_id  uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision   integer NOT NULL,
  data       jsonb NOT NULL,
  settings   jsonb NOT NULL,
  note       varchar(200) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX resume_versions_resume_idx ON resume_versions (resume_id, created_at DESC);

INSERT INTO schema_migrations (version) VALUES ('001_init.sql') ON CONFLICT (version) DO NOTHING;

-- ============================================================ 002_premium_templates.sql

-- Migration 002: premium templates and embedded fonts.

ALTER TABLE resume_settings DROP CONSTRAINT resume_settings_template_check;
ALTER TABLE resume_settings ADD CONSTRAINT resume_settings_template_check
  CHECK (template IN ('classic','modern','compact','technical','executive','elegant','bold','minimal'));

ALTER TABLE resume_settings DROP CONSTRAINT resume_settings_font_family_check;
ALTER TABLE resume_settings ADD CONSTRAINT resume_settings_font_family_check
  CHECK (font_family IN ('Inter','Source Sans 3','IBM Plex Sans','Merriweather','Source Serif 4','EB Garamond','Helvetica','Times-Roman'));

-- Font for the name and section headings; NULL means "same as body".
ALTER TABLE resume_settings ADD COLUMN heading_font varchar(20)
  CHECK (heading_font IS NULL OR heading_font IN ('Inter','Source Sans 3','IBM Plex Sans','Merriweather','Source Serif 4','EB Garamond','Helvetica','Times-Roman'));

INSERT INTO schema_migrations (version) VALUES ('002_premium_templates.sql') ON CONFLICT (version) DO NOTHING;

-- ============================================================ 003_documents.sql

-- Migration 003: application documents (cover letters, messages, LinkedIn text).

CREATE TABLE documents (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_id  uuid REFERENCES resumes(id) ON DELETE SET NULL,   -- resume it was written from
  job_id     uuid REFERENCES jobs(id) ON DELETE SET NULL,      -- job it was written for
  kind       varchar(24) NOT NULL
             CHECK (kind IN ('cover_letter','recruiter_message','application_email','linkedin_headline','linkedin_about')),
  title      varchar(160) NOT NULL DEFAULT '',
  body       text NOT NULL DEFAULT '' CHECK (length(body) <= 12000),
  -- 'template' = composed from the user's own resume text; 'ai' = AI-drafted; 'user' = written or edited by the user.
  origin     varchar(10) NOT NULL DEFAULT 'user' CHECK (origin IN ('user','template','ai')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_user_idx ON documents (user_id, updated_at DESC);
CREATE INDEX documents_resume_idx ON documents (resume_id);
CREATE INDEX documents_job_idx ON documents (job_id);

INSERT INTO schema_migrations (version) VALUES ('003_documents.sql') ON CONFLICT (version) DO NOTHING;

-- ============================================================ 004_pipeline_interviews_sharing.sql

-- Migration 004: application pipeline details, interview prep story bank, share links.

-- Pipeline extras on each job.
ALTER TABLE jobs ADD COLUMN location varchar(120) NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN follow_up_on date;               -- next follow-up reminder
ALTER TABLE jobs ADD COLUMN board_position integer NOT NULL DEFAULT 0;  -- order within its Kanban column
CREATE INDEX jobs_follow_up_idx ON jobs (user_id, follow_up_on) WHERE follow_up_on IS NOT NULL;

-- People connected to an application (recruiter, hiring manager, referrer).
CREATE TABLE job_contacts (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id     uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name       varchar(120) NOT NULL,
  role       varchar(120) NOT NULL DEFAULT '',
  email      varchar(200) NOT NULL DEFAULT '',
  link       varchar(300) NOT NULL DEFAULT '',
  notes      text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_contacts_job_idx ON job_contacts (job_id);

-- Timeline per application: notes, interviews, follow-ups.
CREATE TABLE job_events (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id      uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind        varchar(12) NOT NULL CHECK (kind IN ('note','interview','follow_up','offer','rejection')),
  title       varchar(160) NOT NULL DEFAULT '',
  body        text NOT NULL DEFAULT '' CHECK (length(body) <= 8000),
  happens_on  date,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_events_job_idx ON job_events (job_id, happens_on);

-- Interview story bank: STAR stories grounded in the user's own resume bullets.
CREATE TABLE stories (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_id   uuid REFERENCES resumes(id) ON DELETE SET NULL,
  source_text varchar(600) NOT NULL DEFAULT '',   -- the resume bullet this story expands on
  title       varchar(160) NOT NULL DEFAULT '',
  situation   text NOT NULL DEFAULT '' CHECK (length(situation) <= 2000),
  task        text NOT NULL DEFAULT '' CHECK (length(task) <= 2000),
  action      text NOT NULL DEFAULT '' CHECK (length(action) <= 3000),
  result      text NOT NULL DEFAULT '' CHECK (length(result) <= 2000),
  tags        text[] NOT NULL DEFAULT '{}',        -- competencies, e.g. {leadership, conflict}
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stories_user_idx ON stories (user_id, updated_at DESC);

-- Public share links for a resume. Only a hash of the token (and of the optional password) is stored.
CREATE TABLE share_links (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_id     uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  password_hash text,
  expires_at    timestamptz,
  revoked       boolean NOT NULL DEFAULT false,
  views         integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX share_links_resume_idx ON share_links (resume_id);

INSERT INTO schema_migrations (version) VALUES ('004_pipeline_interviews_sharing.sql') ON CONFLICT (version) DO NOTHING;

-- ============================================================ 005_lock_down_data_api.sql

-- Supabase (and other PostgREST-style hosts) expose the public schema over an HTTP "Data API"
-- to the anon and authenticated roles, whose keys are public. This app reads and writes the
-- database only through its own backend, so:
--   1. row level security is enabled on every table (with no policies, those roles see nothing);
--   2. their privileges on the app's tables, sequences and functions are revoked, now and for
--      tables created later by the same role.
-- The backend connects as the tables' owner, which isn't subject to RLS, so it is unaffected.
-- On plain PostgreSQL (no anon/authenticated roles) only step 1 runs, which changes nothing.
-- Every later migration that creates a table must also run:
--   ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    BEGIN
      EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
      EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Could not change default privileges; enable RLS on new tables explicitly.';
    END;
  END IF;
END
$$;

INSERT INTO schema_migrations (version) VALUES ('005_lock_down_data_api.sql') ON CONFLICT (version) DO NOTHING;

-- ============================================================ 006_professional_template.sql

-- Migration 006: "professional" template (stacked "Title — Company" entries, pipe-separated contact).

ALTER TABLE resume_settings DROP CONSTRAINT resume_settings_template_check;
ALTER TABLE resume_settings ADD CONSTRAINT resume_settings_template_check
  CHECK (template IN ('classic','modern','compact','technical','executive','elegant','bold','minimal','professional'));

INSERT INTO schema_migrations (version) VALUES ('006_professional_template.sql') ON CONFLICT (version) DO NOTHING;

-- ============================================================ 007_summary_title.sql

-- Migration 007: choice of printed heading for the summary section.

ALTER TABLE resume_settings ADD COLUMN summary_title varchar(30) NOT NULL DEFAULT 'Summary'
  CHECK (summary_title IN ('Summary','Professional Summary'));

INSERT INTO schema_migrations (version) VALUES ('007_summary_title.sql') ON CONFLICT (version) DO NOTHING;

-- ============================================================ 008_page_fit.sql

-- Migration 008: what to do when a resume runs past one page.

ALTER TABLE resume_settings ADD COLUMN page_fit varchar(10) NOT NULL DEFAULT 'continue'
  CHECK (page_fit IN ('continue','fit'));

INSERT INTO schema_migrations (version) VALUES ('008_page_fit.sql') ON CONFLICT (version) DO NOTHING;

-- ============================================================ 009_page_breaks.sql

-- Migration 009: user-chosen page breaks ("start on a new page") for sections and entries.

ALTER TABLE resume_sections ADD COLUMN page_break boolean NOT NULL DEFAULT false;
ALTER TABLE experiences ADD COLUMN page_break_before boolean NOT NULL DEFAULT false;
ALTER TABLE educations ADD COLUMN page_break_before boolean NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN page_break_before boolean NOT NULL DEFAULT false;

INSERT INTO schema_migrations (version) VALUES ('009_page_breaks.sql') ON CONFLICT (version) DO NOTHING;

-- ============================================================ 010_skills_title.sql

-- Migration 010: choice of printed heading for the skills section.

ALTER TABLE resume_settings ADD COLUMN skills_title varchar(30) NOT NULL DEFAULT 'Skills'
  CHECK (skills_title IN ('Skills','Technical Skills'));

INSERT INTO schema_migrations (version) VALUES ('010_skills_title.sql') ON CONFLICT (version) DO NOTHING;

-- ============================================================ 011_user_profile.sql

-- Migration 011: name and mobile number, asked for when an account is created.
-- Accounts created before this keep working with both left empty.

ALTER TABLE users ADD COLUMN full_name varchar(120) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN phone varchar(30) NOT NULL DEFAULT '';

INSERT INTO schema_migrations (version) VALUES ('011_user_profile.sql') ON CONFLICT (version) DO NOTHING;

-- ============================================================ 012_admin_email_analytics.sql

-- Migration 012: verified email addresses (password reset, admin access) and private usage statistics.

ALTER TABLE users ADD COLUMN email_verified_at timestamptz;

-- One-time links sent by email. Only the SHA-256 of the token is stored.
CREATE TABLE email_tokens (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    varchar(10) NOT NULL CHECK (purpose IN ('verify', 'reset')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX email_tokens_user_idx ON email_tokens (user_id, purpose);

-- Page views without cookies or IP addresses: "visitor" is a hash of IP + browser + day + a secret,
-- so it counts unique visitors per day but can't be linked across days or back to a person.
CREATE TABLE page_views (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  day        date NOT NULL DEFAULT current_date,
  path       varchar(200) NOT NULL,
  visitor    varchar(16) NOT NULL,
  referrer   varchar(120) NOT NULL DEFAULT '',
  device     varchar(10) NOT NULL DEFAULT 'desktop' CHECK (device IN ('mobile', 'tablet', 'desktop')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX page_views_day_idx ON page_views (day);

-- Daily counters for actions: sign-ups, resumes created, downloads, AI requests.
CREATE TABLE usage_events (
  day   date NOT NULL DEFAULT current_date,
  name  varchar(40) NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (day, name)
);

-- Money received. Empty until a payment method is connected.
CREATE TABLE payments (
  id           uuid PRIMARY KEY,
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  amount_paise integer NOT NULL CHECK (amount_paise >= 0),
  currency     char(3) NOT NULL DEFAULT 'INR',
  source       varchar(40) NOT NULL DEFAULT '',
  reference    varchar(120) NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_created_idx ON payments (created_at);

ALTER TABLE email_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON email_tokens, page_views, usage_events, payments FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
  END IF;
END
$$;

INSERT INTO schema_migrations (version) VALUES ('012_admin_email_analytics.sql') ON CONFLICT (version) DO NOTHING;

-- ============================================================ 013_recovery_codes.sql

-- Migration 013: a recovery code per account (shown once at sign-up) so a forgotten password can be
-- reset without any email service. Only its SHA-256 is stored.

ALTER TABLE users ADD COLUMN recovery_hash text;

INSERT INTO schema_migrations (version) VALUES ('013_recovery_codes.sql') ON CONFLICT (version) DO NOTHING;

-- ============================================================ 014_reviews.sql

-- Migration 014: one review per user (stars + comment). Only reviews the owner picks ("featured")
-- appear on the public homepage.

CREATE TABLE reviews (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  rating     smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    varchar(600) NOT NULL DEFAULT '',
  featured   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reviews_featured_idx ON reviews (featured, updated_at);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON reviews FROM anon, authenticated';
  END IF;
END
$$;

INSERT INTO schema_migrations (version) VALUES ('014_reviews.sql') ON CONFLICT (version) DO NOTHING;

-- ============================================================ end

COMMIT;

-- Optional security check for Supabase (not run by the file above; copy a query into the SQL Editor).
-- Both should return no rows.
--
-- Tables without row level security:
--   SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
--
-- Access still held by Supabase's public API roles:
--   SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
--    WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
