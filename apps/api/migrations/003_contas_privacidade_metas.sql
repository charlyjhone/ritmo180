-- Senha provisória, pedidos de exclusão de dados, metas semanais e sugestões de IA para questões já publicadas.
ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN anonymized_at timestamptz;

CREATE TABLE student_goals (
  student_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  questions_per_week int NOT NULL CHECK (questions_per_week BETWEEN 5 AND 500),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'refused')),
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX privacy_requests_open ON privacy_requests (school_id) WHERE status = 'open';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['student_goals', 'privacy_requests']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant ON %I TO app_user USING (school_id = current_school()) WITH CHECK (school_id = current_school())', t);
    EXECUTE format('CREATE POLICY network_read ON %I FOR SELECT TO app_user USING (network_scope())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
  END LOOP;
END $$;

-- Conteúdo: sem dado pessoal, usado só pela revisão da rede
CREATE TABLE item_suggestions (
  item_id uuid PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  solution_html text NOT NULL,
  traps jsonb NOT NULL,
  hint text NOT NULL,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX item_suggestions_pending ON item_suggestions (created_at) WHERE status = 'pending';
