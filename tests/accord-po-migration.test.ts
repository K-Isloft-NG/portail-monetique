import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const forward = readFileSync(new URL("../database/migrations/2026-10-29_04_accord_po.sql", import.meta.url), "utf8");
const back = readFileSync(new URL("../database/migrations/2026-10-29_04_accord_po_retour.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../database/schema.sql", import.meta.url), "utf8");
describe("structure de la migration d'accord du PO", () => {
  it.each([forward, back])("encadre les opérations et leurs gardes", sql => {
    expect(sql).toMatch(/\nBEGIN;/);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
    expect(sql).toContain("SET LOCAL statement_timeout = '30s'");
    expect(sql).toContain("DO $$");
    expect(sql).toContain("to_regclass('public.utilisateurs') IS NULL");
    expect(sql).toContain("LOCK TABLE public.utilisateurs IN ACCESS EXCLUSIVE MODE");
    expect(sql).toMatch(/COMMIT;\s*$/);
  });
  it("ajoute les colonnes facultatives et leur référence sans inventer d'accord", () => {
    expect(forward).toContain("ADD COLUMN accord_po_le TIMESTAMPTZ DEFAULT NULL");
    expect(forward).toContain("ADD COLUMN cree_par INTEGER DEFAULT NULL");
    expect(forward).toContain("REFERENCES public.utilisateurs (id)");
    expect(forward).toContain("column_name IN ('accord_po_le', 'cree_par')");
    expect(forward).not.toMatch(/DEFAULT NOW\(\)|UPDATE public.utilisateurs/);
  });
  it("refuse une perte de trace et retire les deux colonnes sans cascade", () => {
    expect(back).toContain("accord_po_le IS NOT NULL OR cree_par IS NOT NULL");
    expect(back).toContain("RAISE EXCEPTION 'Retour refusé");
    expect(back).toContain("DROP COLUMN cree_par");
    expect(back).toContain("DROP COLUMN accord_po_le");
    expect(back).not.toContain("CASCADE");
  });
  it("garde les mêmes types et valeurs par défaut dans le schéma neuf", () => {
    expect(schema).toMatch(/accord_po_le\s+TIMESTAMPTZ DEFAULT NULL/);
    expect(schema).toMatch(/cree_par\s+INTEGER DEFAULT NULL REFERENCES utilisateurs \(id\)/);
  });
});
