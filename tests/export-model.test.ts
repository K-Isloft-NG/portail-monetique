import { describe, expect, it } from "vitest";
import { treasuryReport, remittancesReport, remittanceDetailReport, unpaidReport, unpaidSummaryReport, extractionText } from "@/lib/export/table";


import { NOW, COMPANY, TREASURY, REMITTANCES, UNPAID } from "./export-fixtures";
import { parseRemittanceCriteria } from "@/lib/remises";
import { renderCsv } from "@/lib/export/csv";

describe("modèles des tableaux exportés", () => {
  const reports = [treasuryReport(TREASURY, COMPANY, NOW), remittancesReport(REMITTANCES, COMPANY, NOW), remittanceDetailReport(REMITTANCES, REMITTANCES.rows[0], COMPANY, NOW), unpaidReport(UNPAID, COMPANY, NOW)];
  it.each(reports)("donne le titre accentué, le périmètre et l'horloge injectée pour $kind", report => {
    expect(report.title).toBe(report.title.toLocaleUpperCase("fr-FR")); expect(report.title).toContain("ÉPICERIE À CÔTÉ"); expect(report.title).toContain("001\u00a0234\u00a0567"); expect(report.extractedAt).toBe(NOW);
    expect(report.rows[0]).toContain(-18223); expect(report.columns).toHaveLength(report.rows[0].length);
  });
  it.each([treasuryReport({ ...TREASURY, siren: undefined }, undefined, NOW), remittancesReport({ ...REMITTANCES, siren: undefined }, undefined, NOW), unpaidReport({ ...UNPAID, siren: undefined }, undefined, NOW), unpaidSummaryReport(UNPAID, undefined, NOW)])("nomme la vue globale sans inventer un SIREN ($kind)", report => {
    expect(report.title).toContain("TOUTES LES ENTREPRISES"); expect(report.title).not.toContain("SIREN");
  });
  it("décrit les critères et les tris", () => {
    expect(reports[0].subtitle).toContain("Date de valeur : 12/11/2025"); expect(reports[0].subtitle).toContain("montant, croissant");
    expect(reports[1].subtitle).toContain("Du 01/11/2025 au 30/11/2025 ; N° de remise : R-00"); expect(reports[3].subtitle).toContain("À partir du 01/11/2025 ; N° de dossier impayé : D0001");
    expect(unpaidSummaryReport(UNPAID, undefined, NOW).subtitle).toContain("SIREN décroissant");
  });
  it("garde les totaux signés et masque toutes les cartes", () => {
    for (const report of reports) { expect(JSON.stringify(report)).not.toContain("1234567890125896"); if (report.total) expect(report.total.cents).toBe(-18223); }
    expect(reports[2].rows[0]).toContain("12345*******5896"); expect(reports[3].rows[0]).toContain("12345*******5896"); expect(reports[3].rows[0]).toContain("Opération contestée par le débiteur");
  });
  it("conserve les lignes de synthèse et leur ordre", () => expect(unpaidSummaryReport(UNPAID, undefined, NOW).rows).toEqual([[COMPANY.numero_siren, COMPANY.raison_sociale, 1, -18223]]));
  it("accepte un tableau vide, un total nul et toutes les dates", () => {
    const report = treasuryReport({ ...TREASURY, rows: [], totalCents: 0, dateText: "" }); expect(report.rows).toEqual([]); expect(report.total?.cents).toBe(0); expect(report.subtitle).toContain("Toutes les dates");
  });
  it("date l'extraction en heure de Paris", () => expect(extractionText(NOW)).toBe("Extrait le 03/11/2026 à 00:30"));
  it.each([
    { params: {}, filters: "" },
    { params: { debut: "01/11/2025" }, filters: "À partir du 01/11/2025" },
    { params: { fin: "30/11/2025" }, filters: "Jusqu'au 30/11/2025" },
    { params: { debut: "01/11/2025", fin: "30/11/2025" }, filters: "Du 01/11/2025 au 30/11/2025" },
    { params: { numero: "R-00" }, filters: "N° de remise : R-00" },
    { params: { debut: "01/11/2025", numero: "R-00" }, filters: "À partir du 01/11/2025 ; N° de remise : R-00" },
    { params: { fin: "30/11/2025", numero: "R-00" }, filters: "Jusqu'au 30/11/2025 ; N° de remise : R-00" },
    { params: { debut: "01/11/2025", fin: "30/11/2025", numero: "R-00" }, filters: "Du 01/11/2025 au 30/11/2025 ; N° de remise : R-00" },
  ])("rappelle les critères actifs du détail sans changer le titre, les lignes ou le CSV ($filters)", ({ params, filters }) => {
    const baseline = remittanceDetailReport({ ...REMITTANCES, criteria: parseRemittanceCriteria({}) }, REMITTANCES.rows[0], COMPANY, NOW);
    const report = remittanceDetailReport({ ...REMITTANCES, criteria: parseRemittanceCriteria(params) }, REMITTANCES.rows[0], COMPANY, NOW);
    expect(report.subtitle).toBe(`Date de traitement : 12/11/2025${filters ? ` ; ${filters}` : ""} ; Tri : date de vente, autorisation croissantes`);
    expect(report.title).toBe(baseline.title); expect(report.rows).toEqual(baseline.rows); expect(report.siren).toBe(baseline.siren); expect(renderCsv(report)).toBe(renderCsv(baseline));
  });
});
