-- O aluno pode montar o próprio simulado: a prova pertence a uma turma ou a um aluno.
ALTER TABLE exams ALTER COLUMN class_id DROP NOT NULL;
ALTER TABLE exams ADD COLUMN owner_student_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE exams ADD CONSTRAINT exams_have_audience CHECK (class_id IS NOT NULL OR owner_student_id IS NOT NULL);
CREATE INDEX exams_owner_student ON exams (owner_student_id) WHERE owner_student_id IS NOT NULL;
