-- O aluno avisa que uma questão parece ter erro. O relato abre um item na fila de revisão do professor.
-- Sem texto livre: só o tipo do problema, para não carregar dado pessoal para a fila, que é vista por outras escolas.
CREATE TABLE item_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  problem text NOT NULL CHECK (problem IN ('answer', 'statement', 'image', 'other')),
  at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, item_id)
);
CREATE INDEX item_reports_item ON item_reports (item_id);

ALTER TABLE item_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON item_reports TO app_user USING (school_id = current_school()) WITH CHECK (school_id = current_school());
CREATE POLICY network_read ON item_reports FOR SELECT TO app_user USING (network_scope());
GRANT SELECT, INSERT, UPDATE, DELETE ON item_reports TO app_user;
