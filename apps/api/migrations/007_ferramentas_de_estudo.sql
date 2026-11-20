-- Ferramentas de estudo: motivo do erro, cartões de memorização, meta de curso, calendário do ENEM e tarefas com prazo.

-- O aluno diz por que errou. A tentativa pode chegar depois (fila offline), por isso não há chave estrangeira.
CREATE TABLE miss_reasons (
  attempt_id uuid PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id),
  discipline text NOT NULL,
  topic text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('content', 'calc', 'reading', 'distraction')),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX miss_reasons_student ON miss_reasons (student_id, at DESC);

-- Cada resposta a um cartão. O estado do cartão sai deste histórico, como no caderno de erros.
CREATE TABLE card_reviews (
  id uuid PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_key text NOT NULL,
  remembered boolean NOT NULL,
  at timestamptz NOT NULL
);
CREATE INDEX card_reviews_student ON card_reviews (student_id, card_key, at);

-- O curso que o aluno quer e a nota de corte que ele consultou no SISU.
CREATE TABLE course_goals (
  student_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  course text NOT NULL,
  institution text NOT NULL DEFAULT '',
  cutoff numeric(5,1) NOT NULL CHECK (cutoff BETWEEN 300 AND 1000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['miss_reasons', 'card_reviews', 'course_goals']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant ON %I TO app_user USING (school_id = current_school()) WITH CHECK (school_id = current_school())', t);
    EXECUTE format('CREATE POLICY network_read ON %I FOR SELECT TO app_user USING (network_scope())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
  END LOOP;
END $$;

-- Datas do calendário do ENEM (isenção, inscrição, provas...). A rede cadastra quando o INEP divulga.
CREATE TABLE enem_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
GRANT SELECT ON enem_milestones TO app_user;

-- Tarefas do professor ganham prazo e quantidade de questões.
ALTER TABLE assignments ADD COLUMN due_on date;
ALTER TABLE assignments ADD COLUMN questions int NOT NULL DEFAULT 10 CHECK (questions BETWEEN 1 AND 100);
