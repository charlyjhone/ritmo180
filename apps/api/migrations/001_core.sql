-- Papel sem privilégio usado em toda requisição: as políticas de RLS valem para ele.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END $$;

CREATE FUNCTION current_school() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.school_id', true), '')::uuid $$;
CREATE FUNCTION network_scope() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.network', true), '') = 'on' $$;

-- Escolas ------------------------------------------------------------------
CREATE TABLE schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text NOT NULL,
  grades text NOT NULL,
  slug text NOT NULL UNIQUE,
  brand_color text NOT NULL DEFAULT '#2447D6',
  logo_png bytea,
  is_demo boolean NOT NULL DEFAULT false,
  dpa_signed boolean NOT NULL DEFAULT false,
  dpo_contact text NOT NULL DEFAULT '',
  diagnostic_date date,
  diagnostic_scope text NOT NULL DEFAULT 'Todas as contratadas',
  last_roster_file text,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  email text UNIQUE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('student','teacher','coordinator','guardian','network_admin')),
  pass_hash text,
  pass_salt text,
  grade text,
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'network_admin') = (school_id IS NULL))
);
CREATE INDEX users_school_role ON users (school_id, role);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  grade text NOT NULL,
  UNIQUE (school_id, name)
);

CREATE TABLE class_students (
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  PRIMARY KEY (class_id, student_id)
);
CREATE INDEX class_students_student ON class_students (student_id);

CREATE TABLE class_teachers (
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject text,
  PRIMARY KEY (class_id, teacher_id)
);

CREATE TABLE guardian_links (
  guardian_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  PRIMARY KEY (guardian_id, student_id)
);

CREATE TABLE guardian_contacts (
  student_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  guardian_email text,
  consent_at timestamptz
);

CREATE TABLE accommodations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  extra_minutes int NOT NULL DEFAULT 0,
  resources text NOT NULL DEFAULT ''
);

CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  target text,
  at timestamptz NOT NULL DEFAULT now()
);

-- Conteúdo: compartilhado entre as escolas, sem dado pessoal -------------------
CREATE TABLE ingest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter text NOT NULL,
  origin text NOT NULL,
  created int NOT NULL DEFAULT 0,
  updated int NOT NULL DEFAULT 0,
  rejected int NOT NULL DEFAULT 0,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  source text NOT NULL CHECK (source IN ('inep_official','authored','ai_generated','third_party')),
  area text NOT NULL CHECK (area IN ('LC','CH','CN','MT')),
  discipline text NOT NULL,
  topic text NOT NULL,
  skill text,
  competency text,
  year int,
  application text,
  context_html text NOT NULL DEFAULT '',
  stem_html text,
  alternatives jsonb,
  answer text CHECK (answer IN ('A','B','C','D','E')),
  solution_html text NOT NULL DEFAULT '',
  hint text,
  prerequisites text[] NOT NULL DEFAULT '{}',
  word_count int NOT NULL DEFAULT 0,
  -- catalog: só metadados; review: aguardando revisão; published: pode ir ao aluno; retired: saiu de uso
  status text NOT NULL DEFAULT 'catalog' CHECK (status IN ('catalog','review','published','retired')),
  rights_cleared boolean NOT NULL DEFAULT false,
  rights_note text,
  -- official: Inep; calibrated: estimado nos dados; provisional: ainda sem peso na nota
  calibration text NOT NULL DEFAULT 'provisional' CHECK (calibration IN ('official','calibrated','provisional','discarded')),
  irt_a double precision,
  irt_b double precision,
  irt_c double precision,
  content_hash text,
  ingest_run_id uuid REFERENCES ingest_runs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'published' OR (rights_cleared AND stem_html IS NOT NULL AND alternatives IS NOT NULL AND answer IS NOT NULL))
);
CREATE INDEX items_serving ON items (status, area, discipline, topic);

-- Agregados entre escolas, sem dado pessoal: alimentam o tempo-alvo empírico
CREATE TABLE item_stats (
  item_id uuid PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  median_correct_ms double precision,
  correct_samples int NOT NULL DEFAULT 0,
  responses int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE topics (
  area text NOT NULL,
  discipline text NOT NULL,
  topic text NOT NULL,
  weight double precision NOT NULL DEFAULT 0,
  PRIMARY KEY (area, discipline, topic)
);

CREATE TABLE prerequisites (
  key text PRIMARY KEY,
  name text NOT NULL,
  grade text NOT NULL,
  areas text NOT NULL
);

CREATE TABLE item_pipeline (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  stage text NOT NULL,
  passed boolean NOT NULL,
  note text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX item_pipeline_stage ON item_pipeline (stage, passed);

CREATE TABLE calibration_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  examined int NOT NULL,
  calibrated int NOT NULL,
  discarded int NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reading_texts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  title text NOT NULL,
  body text NOT NULL,
  words int NOT NULL,
  grade text NOT NULL,
  questions jsonb NOT NULL,
  rights_cleared boolean NOT NULL DEFAULT false
);

-- Prática: registro imutável de tudo o que o aluno faz ---------------------------
CREATE TABLE practice_sessions (
  id uuid PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode text NOT NULL,
  plan jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE attempts (
  id uuid PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id),
  area text NOT NULL,
  discipline text NOT NULL,
  topic text NOT NULL,
  mode text NOT NULL,
  choice text NOT NULL,
  correct boolean NOT NULL,
  total_ms int NOT NULL,
  target_ms int NOT NULL,
  read_ms int,
  path_ms int,
  calc_ms int,
  check_ms int,
  used_hint boolean NOT NULL DEFAULT false,
  hidden_ms int NOT NULL DEFAULT 0,
  position int NOT NULL DEFAULT 0,
  valid boolean NOT NULL,
  flags text[] NOT NULL DEFAULT '{}',
  answered_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attempts_student_time ON attempts (student_id, answered_at DESC);
CREATE INDEX attempts_item ON attempts (item_id);
CREATE INDEX attempts_school_time ON attempts (school_id, answered_at DESC);

CREATE TABLE reading_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text_id uuid NOT NULL REFERENCES reading_texts(id),
  ppm int NOT NULL,
  score int NOT NULL,
  verdict text NOT NULL,
  answers jsonb NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reading_attempts_student ON reading_attempts (student_id, at DESC);

-- Projeção recalculável a partir de attempts: mantém os painéis de turma rápidos
CREATE TABLE learner_snapshots (
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  ritmo int,
  ritmo_week_ago int,
  avg_ms double precision,
  samples int NOT NULL DEFAULT 0,
  thetas jsonb NOT NULL DEFAULT '{}',
  mastery jsonb NOT NULL DEFAULT '{}',
  phases jsonb,
  last_active timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id)
);
CREATE INDEX learner_snapshots_school ON learner_snapshots (school_id);

CREATE TABLE exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title text NOT NULL,
  item_ids uuid[] NOT NULL,
  duration_seconds int NOT NULL,
  seconds_per_question int NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE exam_sittings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (exam_id, student_id)
);

CREATE TABLE exam_responses (
  sitting_id uuid NOT NULL REFERENCES exam_sittings(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  position int NOT NULL,
  item_id uuid NOT NULL REFERENCES items(id),
  choice text,
  triage text NOT NULL,
  time_ms int NOT NULL DEFAULT 0,
  PRIMARY KEY (sitting_id, position)
);

CREATE TABLE assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id uuid REFERENCES users(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  topic text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE item_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','kept','retired')),
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, reason)
);

CREATE TABLE family_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  guardian_id uuid REFERENCES users(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('to_school','to_family')),
  author text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Isolamento por escola ---------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','classes','class_students','class_teachers','guardian_links','guardian_contacts',
    'accommodations','audit_log','practice_sessions','attempts','reading_attempts','learner_snapshots','exams',
    'exam_sittings','exam_responses','assignments','family_messages']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant ON %I TO app_user USING (school_id = current_school()) WITH CHECK (school_id = current_school())', t);
    EXECUTE format('CREATE POLICY network_read ON %I FOR SELECT TO app_user USING (network_scope())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
  END LOOP;
END $$;

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON schools TO app_user USING (id = current_school()) WITH CHECK (id = current_school());
CREATE POLICY network ON schools TO app_user USING (network_scope()) WITH CHECK (network_scope());
GRANT SELECT, INSERT, UPDATE ON schools TO app_user;

-- As tentativas são imutáveis: correção se faz com nova linha, nunca reescrevendo o passado
REVOKE UPDATE, DELETE ON attempts FROM app_user;

GRANT SELECT ON items, item_stats, topics, prerequisites, item_pipeline, calibration_runs, reading_texts, ingest_runs TO app_user;
GRANT SELECT, UPDATE ON item_flags TO app_user;
GRANT INSERT ON item_flags TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO app_user;
GRANT EXECUTE ON FUNCTION current_school(), network_scope() TO app_user;
