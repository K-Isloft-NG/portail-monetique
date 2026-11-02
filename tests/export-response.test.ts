import { describe, expect, it } from "vitest";
import { exportFilename, exportParams, exportResponse, parseExportFormat, EXPORT_LIMIT } from "@/lib/export/reponse";
import { treasuryReport } from "@/lib/export/table";
import { COMPANY, NOW, TREASURY } from "./export-fixtures";

describe("paramètres et réponses d'export", () => {
  it.each([undefined, 'csv', 'xls', 'pdf'])("accepte le format %j", value => expect(parseExportFormat(value)).toBe(value ?? 'csv'));
  it.each(['', 'PDF', 'xlsx', 'inconnu', 'a'.repeat(5000), '<script>', ['csv', 'pdf']])("refuse le format invalide ou répété", value => expect(parseExportFormat(value)).toBeUndefined());
  it("conserve les paramètres répétés sans en choisir un", () => expect(exportParams(new Request('http://localhost/export?format=csv&format=pdf'))).toEqual({ format: ['csv', 'pdf'] }));
  it.each(['xls', 'csv', 'pdf'] as const)("produit un fichier %s privé au nom sûr", async format => {
    const response = await exportResponse(treasuryReport(TREASURY, COMPANY, NOW), format); expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store'); expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff'); expect(response.headers.get('Content-Disposition')).toContain(`tresorerie_001234567_2026-11-03.${format === 'xls' ? 'xlsx' : format}`);
  });
  it("assainit le numéro de remise et ne reprend aucun chemin", () => {
    const report = { ...treasuryReport(TREASURY, COMPANY, NOW), kind: 'remise' as const, remittanceNumber: '../R-é;42\r\n' }; expect(exportFilename(report, 'pdf')).toBe('remise_R-42_2026-11-03.pdf');
  });
  it.each(['csv', 'pdf', 'xls'] as const)("refuse au-delà de 10 000 lignes avant le rendu %s", async format => {
    const report = treasuryReport(TREASURY); report.rows = Array.from({ length: EXPORT_LIMIT + 1 }, () => report.rows[0]); const response = await exportResponse(report, format); expect(response.status).toBe(400); expect(await response.text()).toBe('Trop de lignes pour un export : affinez les critères.'); expect(response.headers.has('Content-Disposition')).toBe(false);
  });
});
