import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ExportFormulaire from "@/components/ExportFormulaire";
import { readRemittances, readRemittanceForExport } from "@/lib/remises";
import { REMITTANCES } from "./export-fixtures";

const mocks = vi.hoisted(() => ({ query: vi.fn(), scope: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/access", () => ({ getRemittanceScope: mocks.scope }));
describe("lecture complète et formulaire d'export", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.scope.mockResolvedValue({ siren: "001234567", session: { profile: "client" } });
    mocks.query.mockImplementation(async (sql: string) => sql.includes('COUNT(*)') ? [{ count: '23', total: '-182.23' }] : sql.includes('FROM transactions') ? REMITTANCES.details : REMITTANCES.rows);
  });
  it("garde exactement les mêmes filtres et l'ordre mais retire la pagination pour l'export", async () => {
    const params = { page: '2', lignes: '10', debut: '01/11/2025', numero: 'R' };
    await readRemittances(params); const pageCall = mocks.query.mock.calls.find(([sql]) => sql.includes('SELECT r.id'))!;
    mocks.query.mockClear(); await readRemittances(params, true); const exportCall = mocks.query.mock.calls.find(([sql]) => sql.includes('SELECT r.id'))!;
    expect(exportCall[0]).toBe(pageCall[0]); expect(exportCall[1].slice(0, 4)).toEqual(pageCall[1].slice(0, 4)); expect(pageCall[1].slice(4)).toEqual([10, 10]); expect(exportCall[1].slice(4)).toEqual([23, 0]);
  });
  it("borne la lecture complète à une ligne de plus que le plafond", async () => {
    mocks.query.mockImplementation(async (sql: string) => sql.includes('COUNT(*)') ? [{ count: '50000', total: '0' }] : []);
    await readRemittances({}, true); expect(mocks.query.mock.calls.find(([sql]) => sql.includes('SELECT r.id'))?.[1].slice(4)).toEqual([10001, 0]);
  });
  it("contrôle la remise autorisée avant de lire ses transactions", async () => {
    const data = await readRemittanceForExport({ remise: '1' }); expect(data.remittance?.id).toBe(1);
    expect(mocks.query.mock.calls[0][1]).toEqual([1, '001234567']); expect(mocks.query.mock.calls[1][1]).toEqual([1, '001234567']); expect(mocks.query.mock.calls[0][0]).toContain('r.id = $1');
  });
  it("ne lit aucune transaction quand la remise ne fait pas partie du périmètre", async () => {
    mocks.query.mockResolvedValue([]); const data = await readRemittanceForExport({ remise: '999' }); expect(data.remittance).toBeUndefined(); expect(mocks.query).toHaveBeenCalledTimes(1);
  });
  it.each([{ remise: ['1', '2'] }, { remise: '-1' }, { remise: '1', debut: '31/02/2026' }, { remise: '1', lignes: '101' }])("ne lit rien pour des critères invalides", async params => {
    await readRemittanceForExport(params); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("produit trois radios avec CSV présélectionné et retire page et remise ouverte", () => {
    const html = renderToStaticMarkup(createElement(ExportFormulaire, { action: '/export/remises', query: 'debut=01%2F11%2F2025&sort=montant&order=asc&page=2&remise=1&lignes=10', label: 'Exporter les remises' }));
    expect(html.match(/type="radio"/g)).toHaveLength(3); expect(html).toContain('checked="" value="csv"'); expect(html).not.toContain('name="page"'); expect(html).not.toContain('name="remise"'); expect(html).toContain('name="debut" value="01/11/2025"'); expect(html).toContain('name="sort" value="montant"'); expect(html).toContain('method="get"');
  });
  it("transmet uniquement la remise demandée dans le formulaire de détail", () => {
    const html = renderToStaticMarkup(createElement(ExportFormulaire, { action: '/export/remises', query: 'page=2&remise=4&debut=01%2F11%2F2025&fin=30%2F11%2F2025&numero=R-00', label: 'Exporter le détail', detailId: 1 }));
    expect(html).toContain('name="remise" value="1"'); expect(html).not.toContain('name="remise" value="4"'); expect(html).not.toContain('name="page"');
    expect(html).toContain('name="debut" value="01/11/2025"'); expect(html).toContain('name="fin" value="30/11/2025"'); expect(html).toContain('name="numero" value="R-00"');
  });
});
