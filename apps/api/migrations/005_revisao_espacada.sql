-- Revisão espaçada: o aluno diz quanta certeza tem ao responder. Acerto no chute não conta como aprendido.
ALTER TABLE attempts ADD COLUMN confidence text CHECK (confidence IN ('sure', 'think', 'guess'));
