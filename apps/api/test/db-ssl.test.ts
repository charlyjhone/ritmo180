import { X509Certificate } from "node:crypto";
import { describe, expect, it } from "vitest";
import { connectionOptions } from "../src/platform/db-postgres.ts";

const SUPABASE = "postgresql://ritmo.ref:senha@aws-1-us-east-1.pooler.supabase.com:5432/ritmo?sslmode=no-verify";

describe("conexão cifrada com o banco", () => {
  it("no Supabase confere o certificado com a raiz do Supabase e tira o sslmode da URL", () => {
    const options = connectionOptions(SUPABASE, {});
    const ssl = options.ssl as { ca: string; rejectUnauthorized: boolean; servername: string };
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.servername).toBe("aws-1-us-east-1.pooler.supabase.com");
    expect(options.connectionString).not.toContain("sslmode");
    expect(options.connectionString).toContain("/ritmo");
    const root = new X509Certificate(ssl.ca);
    expect(root.subject).toContain("CN=Supabase Root 2021 CA");
    expect(root.fingerprint256).toBe("80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA");
  });

  it("em outro servidor sem raiz configurada deixa a URL como está", () => {
    const local = "postgresql://ritmo@localhost:5432/ritmo";
    expect(connectionOptions(local, {})).toEqual({ connectionString: local });
  });

  it("DATABASE_SSL_VERIFY=off é a saída de emergência", () => {
    expect(connectionOptions(SUPABASE, { DATABASE_SSL_VERIFY: "off" })).toEqual({ connectionString: SUPABASE });
  });
});
