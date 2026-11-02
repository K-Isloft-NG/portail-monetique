import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GET } from "@/app/export/tresorerie/route";
import Tresorerie from "@/components/Tresorerie";
import { COMPANY, TREASURY } from "./export-fixtures";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), read: vi.fn(), clientCompany: vi.fn(), poCompany: vi.fn() }));
vi.mock("@/lib/access", () => ({ requireTreasuryProfile: mocks.profile, getClientCompany: mocks.clientCompany, getPoCompany: mocks.poCompany }));
vi.mock("@/lib/tresorerie", async original => ({ ...await original<typeof import("@/lib/tresorerie")>(), readTreasury: mocks.read }));
describe("export des annonces aux trois formats", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.profile.mockResolvedValue({ profile: 'client' }); mocks.read.mockResolvedValue(TREASURY); mocks.clientCompany.mockResolvedValue({ company: COMPANY }); mocks.poCompany.mockResolvedValue({ company: COMPANY }); });
  it.each([['xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'PK'], ['pdf', 'application/pdf', '%PDF'], ['csv', 'text/csv; charset=utf-8', '\uFEFF']])("renvoie le fichier %s", async (format, mime, magic) => {
    const r = await GET(new Request('http://localhost/export/tresorerie?format=' + format)); expect(r.status).toBe(200); expect(r.headers.get('Content-Type')).toBe(mime); const b = Buffer.from(await r.arrayBuffer()); expect(b.subarray(0, Buffer.byteLength(magic)).toString()).toBe(magic);
  });
  it.each(['format=inconnu', 'format=', 'format=csv&format=csv', 'format='+'x'.repeat(5000), 'format=%3Cscript%3E'])("refuse un format invalide avant la lecture", async query => {
    const r = await GET(new Request('http://localhost/export/tresorerie?' + query)); expect(r.status).toBe(400); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("relit le nom de l'entreprise sélectionnée du PO", async () => {
    mocks.profile.mockResolvedValue({ profile: 'po' }); await GET(new Request('http://localhost/export/tresorerie?format=xls')); expect(mocks.poCompany).toHaveBeenCalledWith(COMPANY.numero_siren); expect(mocks.clientCompany).not.toHaveBeenCalled();
  });
  it("exporte un résultat vide en gardant le vrai nom de l'entreprise", async () => {
    mocks.read.mockResolvedValue({ ...TREASURY, rows: [], totalCents: 0 }); const r = await GET(new Request('http://localhost/export/tresorerie?format=pdf')); expect(Buffer.from(await r.arrayBuffer()).toString('latin1')).toContain('ÉPICERIE À CÔTÉ');
  });
  it("affiche les radios et conserve date et tri dans un formulaire GET", () => {
    const html = renderToStaticMarkup(createElement(Tresorerie, { result: TREASURY, basePath: '/client' })); expect(html.match(/type="radio"/g)).toHaveLength(3); expect(html).toContain('checked="" value="csv"'); expect(html).toContain('name="date" value="12/11/2025"'); expect(html).toContain('name="order" value="asc"');
  });
  it("ne propose aucun export si les critères sont invalides", () => {
    const html = renderToStaticMarkup(createElement(Tresorerie, { result: { ...TREASURY, error: 'Date invalide' }, basePath: '/client' })); expect(html).not.toContain('/export/tresorerie');
  });
});
