import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildTreasuryCsv } from "@/lib/csv";
import { renderCsv } from "@/lib/export/csv";
import { renderXlsx, worksheetName } from "@/lib/export/xlsx";
import { renderPdf, pdfText } from "@/lib/export/pdf";
import { treasuryReport, unpaidReport } from "@/lib/export/table";
import { COMPANY, NOW, TREASURY, UNPAID } from "./export-fixtures";

describe("rendus des exports", () => {
  it("conserve le CSV de trésorerie octet par octet, y compris les textes difficiles", () => {
    for (const name of ["Épicerie", '=1+1', '+1+1', 'Nom; "cité"\nSuite', '\tNom']) {
      const result = { ...TREASURY, rows: TREASURY.rows.map(r => ({ ...r, raison_sociale: name })) };
      expect(Buffer.from(renderCsv(treasuryReport(result)))).toEqual(Buffer.from(buildTreasuryCsv(result.rows)));
    }
    expect(renderCsv(treasuryReport({ ...TREASURY, rows: [] }))).toBe(buildTreasuryCsv([]));
  });
  it("étend le CSV aux impayés sans titre ni total, avec carte masquée", () => {
    const text = renderCsv(unpaidReport(UNPAID)); expect(text.startsWith('\uFEFFN° SIREN;')).toBe(true); expect(text).toContain('12345*******5896'); expect(text).toContain(';-182,23;'); expect(text.split('\r\n')).toHaveLength(3); expect(text).not.toContain('Total des impayés');
  });
  it("écrit des nombres et dates réels, des identifiants texte et les volets figés dans le XLSX", async () => {
    const zip = unzipSync(await renderXlsx(treasuryReport(TREASURY, COMPANY, NOW)));
    const sheet = strFromU8(zip['xl/worksheets/sheet1.xml']); const styles = strFromU8(zip['xl/styles.xml']); const strings = Object.values(zip).map(v => strFromU8(v)).join('');
    expect(sheet).toMatch(/<c[^>]*r="F6"[^>]*><v>-182\.23<\/v>/); expect(sheet).toMatch(/<c[^>]*r="A6"[^>]*><v>[0-9]+<\/v>/);
    expect(sheet).toMatch(/<c[^>]*r="B6"[^>]*t="(?:s|inlineStr)"/); expect(strings).toContain('001234567'); expect(strings).toContain('ÉPICERIE À CÔTÉ'); expect(strings).toContain('EXTRAIT DU 03/11/2026');
    expect(sheet).toContain('ySplit="5"'); expect(sheet).toContain('r="F7"'); expect(styles).toContain('dd/mm/yyyy'); expect(styles).toContain('[Red]');
  });
  it.each(['=1+1', '+1+1'])("écrit %s comme texte et jamais comme formule dans le XLSX", async name => {
    const report = treasuryReport({ ...TREASURY, rows: TREASURY.rows.map(r => ({ ...r, raison_sociale: name })) }, COMPANY, NOW);
    const zip = unzipSync(await renderXlsx(report)); const sheet = strFromU8(zip['xl/worksheets/sheet1.xml']); expect(sheet).not.toMatch(/<f[ >]/); expect(Object.values(zip).map(v => strFromU8(v)).join('')).toContain(name);
  });
  it.each(['Trésorerie', '[/?:*nom très long'.repeat(4), "'Feuille'"])("borne le nom de feuille %s", name => { const result = worksheetName(name); expect(result.length).toBeLessThanOrEqual(31); expect(result).not.toMatch(/[\\/?*\[\]:]/); });
  it("génère un PDF paginé, avec accents, en-têtes, montants lisibles et pied de page", () => {
    const report = unpaidReport({ ...UNPAID, rows: Array.from({ length: 120 }, (_, i) => ({ ...UNPAID.rows[0], id: i })) }, COMPANY, NOW);
    const text = Buffer.from(renderPdf(report)).toString('latin1'); const pages = (text.match(/\/Type \/Page\b/g) ?? []).length;
    expect(text.startsWith('%PDF-')).toBe(true); expect(pages).toBeGreaterThan(1); expect(pages).toBeLessThan(10); expect(text.match(/Libellé impayé/g)).toHaveLength(pages);
    expect(text).toContain('ÉPICERIE À CÔTÉ'); expect(text).toContain('Opération contestée par le débiteur'); expect(text).toContain('-182,23'); expect(text).toContain(`Page ${pages} sur ${pages}`); expect(text).toMatch(/0\.70[0-9]* 0\.13[0-9]* 0\.09[0-9]* rg/); expect(text).not.toContain('1234567890125896');
  });
  it("neutralise les caractères hors WinAnsi sans casser le nombre", () => expect(pdfText('−1\u202f234,56\u00a0€ éèàçô 漢🙂')).toBe('-1 234,56 € éèàçô ??'));
});
