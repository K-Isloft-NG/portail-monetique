import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const expectedMotifs = [
  { code: "01", label: "Fraude à la carte" },
  { code: "02", label: "Compte à découvert" },
  { code: "03", label: "Compte clôturé" },
  { code: "04", label: "Compte bloqué" },
  { code: "05", label: "Provision insuffisante" },
  { code: "06", label: "Opération contestée par le débiteur" },
  { code: "07", label: "Titulaire décédé" },
  { code: "08", label: "Raison non communiquée, contactez la banque du client" },
];
const seed = readFileSync(new URL("../database/seed.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../database/migrations/2026-10-29_03_libelles_impayes.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../database/schema.sql", import.meta.url), "utf8");

// Limiter la lecture aux valeurs des motifs pour ne pas confondre les dictionnaires.
const seedValues = seed.match(/INSERT INTO motifs_impayes \(id, code, libelle, description\) VALUES([\s\S]*?);/)?.[1] ?? "";
const migrationValues = migration.match(/FROM \(VALUES([\s\S]*?)\) AS v\(code, libelle\)/)?.[1] ?? "";
const seedMotifs = [...seedValues.matchAll(/\(\d+,\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\)/g)]
  .map((match) => ({ code: match[1], label: match[2], description: match[3] }));
const migrationMotifs = [...migrationValues.matchAll(/\('([^']+)',\s*'([^']+)'\)/g)]
  .map((match) => ({ code: match[1], label: match[2] }));

describe("dictionnaire des motifs d'impayé", () => {
  it("contient exactement les huit codes dans le jeu de démonstration", () => {
    expect(seedMotifs.map((motif) => motif.code).sort()).toEqual(expectedMotifs.map((motif) => motif.code));
  });

  it("contient exactement les huit codes dans la migration", () => {
    expect(migrationMotifs.map((motif) => motif.code).sort()).toEqual(expectedMotifs.map((motif) => motif.code));
  });

  it.each(expectedMotifs)("conserve le texte complet du motif $code dans les deux fichiers", ({ code, label }) => {
    const seeded = seedMotifs.find((motif) => motif.code === code);
    const migrated = migrationMotifs.find((motif) => motif.code === code);
    expect(seeded?.label).toBe(label);
    expect(migrated?.label).toBe(label);
    expect(seeded?.description).toBe(seeded?.label);
    for (const actual of [seeded?.label, migrated?.label]) {
      expect(actual).toMatch(/^\p{Lu}/u);
      expect(Array.from(actual ?? "").length).toBeLessThanOrEqual(80);
    }
  });

  it("conserve contactez et les 53 caractères du motif 08", () => {
    for (const motifs of [seedMotifs, migrationMotifs]) {
      const label = motifs.find((motif) => motif.code === "08")?.label;
      expect(label).toContain("contactez");
      expect(label).toHaveLength(53);
    }
  });

  it("prévoit un libellé obligatoire de 80 caractères dans le schéma", () => {
    const table = schema.match(/CREATE TABLE motifs_impayes \(([\s\S]*?)\);/)?.[1] ?? "";
    expect(table).toMatch(/\blibelle\s+VARCHAR\(80\)\s+NOT NULL/);
  });
});
