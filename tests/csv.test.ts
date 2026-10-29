import { describe, expect, it } from "vitest";
import { buildTreasuryCsv, treasuryCsvFilename } from "@/lib/csv";
import type { TreasuryRow } from "@/lib/tresorerie";

const ROW: TreasuryRow = { id: 1, numero_siren: "001234567", raison_sociale: "Entreprise fictive", date_valeur: "2025-11-12", nb_transactions: 2, montant_total: "-182.23", devise: "EUR" };
describe("export de trésorerie CSV", () => {
  it("produit BOM, en-têtes, point-virgule, date et montant décimal sans total", () => {
    const csv = buildTreasuryCsv([ROW]);
    expect([...new TextEncoder().encode(csv).slice(0, 3)]).toEqual([239, 187, 191]);
    expect(csv).toContain("12/11/2025;001234567;Entreprise fictive;2;EUR;-182,23\r\n");
    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv).not.toContain("Total;");
    expect(csv.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });
  it("double les guillemets et protège les séparateurs et retours à la ligne", () => {
    const csv = buildTreasuryCsv([{ ...ROW, raison_sociale: 'Nom; "cité"\nSuite' }]);
    expect(csv).toContain('"Nom; ""cité""\nSuite"');
  });
  it.each(["=1+1", "+1+1", "-1+1", "@SOMME(A1)", " =1+1", "\u00a0=1+1", "\t=1+1", " \t@SOMME(A1)", "\tNom"])("protège le texte %j, jamais le montant négatif", (raison_sociale) => {
    const csv = buildTreasuryCsv([{ ...ROW, raison_sociale }]);
    expect(csv).toContain(`;'${raison_sociale};2;EUR;-182,23`);
    expect(csv).not.toContain("'-182,23");
  });
  it.each(["\r=1+1", "\rNom", " \r+1"])("protège et encadre un retour chariot (%j)", raison_sociale => {
    const csv = buildTreasuryCsv([{ ...ROW, raison_sociale }]);
    expect(csv).toContain(`;"'${raison_sociale}";2;EUR;-182,23`);
    expect(csv).not.toContain("'-182,23");
  });
  it("conserve un espace initial dans un texte sans formule", () => {
    expect(buildTreasuryCsv([{ ...ROW, raison_sociale: " Nom" }])).toContain("; Nom;2;");
  });
  it("exporte seulement les en-têtes si le résultat est vide", () => expect(buildTreasuryCsv([]).split("\r\n")).toHaveLength(2));
  it("nomme le fichier avec le périmètre et la date de Paris", () => {
    const date = new Date("2026-10-29T23:30:00Z");
    expect(treasuryCsvFilename(ROW.numero_siren, date)).toBe("tresorerie_001234567_2026-10-30.csv");
    expect(treasuryCsvFilename(undefined, date)).toBe("tresorerie_tous_2026-10-30.csv");
    expect(treasuryCsvFilename("../autre", date)).toBe("tresorerie_tous_2026-10-30.csv");
  });
});
