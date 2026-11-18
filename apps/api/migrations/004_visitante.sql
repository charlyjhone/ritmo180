-- Acesso de visitante: conta sem dado pessoal, que expira e é apagada sozinha.
ALTER TABLE users ADD COLUMN guest_expires_at timestamptz;
CREATE INDEX users_guest_expiry ON users (guest_expires_at) WHERE guest_expires_at IS NOT NULL;
