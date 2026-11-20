-- Aulas rápidas: uma por assunto, igual para toda a rede. A IA propõe; só aparece para o aluno o que a rede aprovar.
CREATE TABLE lessons (
  discipline text NOT NULL,
  topic text NOT NULL,
  area text NOT NULL,
  title text NOT NULL,
  explanation_html text NOT NULL,
  example_html text NOT NULL,
  pitfalls_html text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  model text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (discipline, topic)
);
CREATE INDEX lessons_pending ON lessons (created_at) WHERE status = 'pending';
GRANT SELECT ON lessons TO app_user;
