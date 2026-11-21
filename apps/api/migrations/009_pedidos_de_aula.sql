-- O aluno pede para ver uma questão resolvida em sala. O professor vê quantos pediram cada questão, nunca quem.
CREATE TABLE class_requests (
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  -- Preenchido quando o professor marca a questão como corrigida em sala.
  done_at timestamptz,
  PRIMARY KEY (student_id, item_id)
);
CREATE INDEX class_requests_item ON class_requests (school_id, item_id);

ALTER TABLE class_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON class_requests TO app_user USING (school_id = current_school()) WITH CHECK (school_id = current_school());
GRANT SELECT, INSERT, UPDATE, DELETE ON class_requests TO app_user;
