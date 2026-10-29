import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const forward = read("database/migrations/2026-10-29_02_sessions.sql"), back = read("database/migrations/2026-10-29_02_sessions_retour.sql");
describe("migration des sessions", () => {
  it.each([forward, back])("encadre les opérations par transaction et délais", sql => {
    expect(sql).toContain("BEGIN;"); expect(sql).toContain("SET LOCAL lock_timeout = '5s'"); expect(sql).toContain("SET LOCAL statement_timeout = '30s'"); expect(sql).toMatch(/COMMIT;\s*$/);
  });
  it("refuse le rejeu et exige le compte parent", () => { expect(forward).toContain("to_regclass('public.utilisateurs') IS NULL"); expect(forward).toContain("to_regclass('public.sessions') IS NOT NULL"); expect(forward).toContain("RAISE EXCEPTION"); });
  it("crée UUID, dates, cascade et index sans durée imposée par contrainte", () => {
    for (const sql of [forward, read("database/schema.sql")]) {
      for (const clause of ["UUID PRIMARY KEY", "ON DELETE CASCADE", "sessions_revocation_check", "idx_sessions_utilisateur", "idx_sessions_expiration", "DEFAULT (NOW() + INTERVAL '8 hours')"]) expect(sql).toContain(clause);
      expect(sql).not.toContain("sessions_duree_check");
    }
  });
  it("refuse un retour avec structure inconnue ou session encore valable", () => {
    expect(back).toContain(") <> 5 OR ("); expect(back).toContain("date_revocation IS NULL AND date_expiration > NOW()"); expect(back).toContain("Retour refusé"); expect(back).toContain("DROP TABLE public.sessions;"); expect(back).not.toMatch(/DROP TABLE .*CASCADE/);
  });
});
