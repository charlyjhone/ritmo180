-- Quem montou o simulado não pode impedir que a própria conta seja apagada. Sem isso, o visitante que
-- montou um simulado não conseguia sair, e a limpeza dos visitantes vencidos parava no primeiro deles.
-- O simulado do aluno já some com ele por owner_student_id; o da turma fica, sem autor.
ALTER TABLE exams DROP CONSTRAINT exams_created_by_fkey;
ALTER TABLE exams ADD CONSTRAINT exams_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
