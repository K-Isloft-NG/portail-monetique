import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { unzipSync, strFromU8 } from "fflate";
import { GET as remittances } from "@/app/export/remises/route";
import { GET as unpaid } from "@/app/export/impayes/route";
import Remises from "@/components/Remises";
import Impayes from "@/components/Impayes";
import { COMPANY, REMITTANCES, UNPAID } from "./export-fixtures";

const mocks = vi.hoisted(() => ({ query: vi.fn(), readSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/session", async original => ({ ...await original<typeof import("@/lib/session")>(), readSession: mocks.readSession }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Error('REDIRECT:' + path); }, notFound: () => { throw Error('NOT_FOUND'); } }));
const CLIENT = { sessionId: "12345678-1234-4123-8123-123456789abc", id: 1, login: "compte-test", profile: "client", siren: COMPANY.numero_siren };
const cases = [
  { label: 'remises', route: remittances, path: '/export/remises' },
  { label: 'détail', route: remittances, path: '/export/remises?remise=1' },
  { label: 'impayés', route: unpaid, path: '/export/impayes' },
];
const request = (path: string, query = '') => new Request('http://localhost' + path + (query ? (path.includes('?') ? '&' : '?') + query : ''));
function setup(profile = 'client') {
  const session = { ...CLIENT, profile, siren: profile === 'client' ? CLIENT.siren : null };
  mocks.readSession.mockResolvedValue(session);
  mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM utilisateurs')) return [{ ...session, est_actif: true }];
    if (sql.includes('FROM entreprises')) return [COMPANY];
    if (sql.includes('COUNT(*)') && !sql.includes('GROUP BY')) return [{ count: '23', total: '-182.23' }];
    if (sql.includes('GROUP BY')) return [{ ...COMPANY, count: '1', total: '-182.23' }];
    if (sql.includes('SELECT t.id') && sql.includes('motifs_impayes')) return UNPAID.rows;
    if (sql.includes('FROM transactions')) return REMITTANCES.details;
    if (sql.includes('WHERE r.id = $1')) return params[0] === 1 ? REMITTANCES.rows : [];
    return Array.from({ length: Number(params[4]) }, (_, i) => ({ ...REMITTANCES.rows[0], id: i + 1 }));
  });
}

describe("routes et écrans d'export des remises et impayés", () => {
  beforeEach(() => { vi.resetAllMocks(); setup(); });
  for (const entry of cases) {
    it.each(['csv', 'xls', 'pdf'])(`livre ${entry.label} en %s avec le périmètre imposé`, async format => {
      const r = await entry.route(request(entry.path, 'format=' + format + '&siren=100000002'));
      expect(r.status).toBe(200); expect(r.headers.get('Cache-Control')).toBe('no-store'); expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
      const b = Buffer.from(await r.arrayBuffer()); const text = b.toString(format === 'pdf' ? 'latin1' : 'utf8'); expect(text).not.toContain('100000002'); expect(text).not.toContain('1234567890125896');
      if (entry.label === 'détail') expect(mocks.query.mock.calls.find(([sql]) => sql.includes('WHERE r.id = $1'))?.[1]).toEqual([1, CLIENT.siren]);
      else expect(mocks.query.mock.calls.find(([sql]) => sql.includes('COUNT(*)'))?.[1][0]).toBe(CLIENT.siren);
    });
    it(`renvoie le visiteur vers login pour ${entry.label}`, async () => { mocks.readSession.mockResolvedValue(null); await expect(entry.route(request(entry.path))).rejects.toThrow('REDIRECT:/login'); expect(mocks.query).not.toHaveBeenCalled(); });
    it(`renvoie l'administrateur vers admin pour ${entry.label}`, async () => { setup('admin'); await expect(entry.route(request(entry.path))).rejects.toThrow('REDIRECT:/admin'); expect(mocks.query.mock.calls.every(([sql]) => sql.includes('FROM utilisateurs'))).toBe(true); });
    it(`refuse le format invalide avant toute lecture métier pour ${entry.label}`, async () => { const r = await entry.route(request(entry.path, 'format=csv&format=pdf')); expect(r.status).toBe(400); expect(mocks.query.mock.calls.every(([sql]) => sql.includes('FROM utilisateurs'))).toBe(true); });
    it.each(['debut=31%2F02%2F2026', 'debut=02%2F01%2F2026&fin=01%2F01%2F2026'])(`refuse les dates invalides pour ${entry.label}`, async query => { const r = await entry.route(request(entry.path, query)); expect(r.status).toBe(400); expect(mocks.query.mock.calls.every(([sql]) => sql.includes('FROM utilisateurs'))).toBe(true); });
  }
  it("exporte toutes les pages des remises", async () => { const r = await remittances(request('/export/remises?lignes=10&page=2')); expect((await r.text()).split('\r\n')).toHaveLength(25); expect(mocks.query.mock.calls.find(([sql]) => sql.includes('SELECT r.id'))?.[1].slice(4)).toEqual([23, 0]); });
  it("répond 404 pour une remise étrangère avant toute transaction", async () => { await expect(remittances(request('/export/remises?remise=99'))).rejects.toThrow('NOT_FOUND'); expect(mocks.query.mock.calls.every(([sql]) => !sql.includes('FROM transactions'))).toBe(true); });
  for (const format of ['xls', 'pdf']) {
    it.each([
      { query: '', filters: '' },
      { query: 'debut=01%2F11%2F2025&fin=30%2F11%2F2025', filters: 'Du 01/11/2025 au 30/11/2025' },
      { query: 'numero=R-00', filters: 'N° de remise : R-00' },
      { query: 'debut=01%2F11%2F2025&fin=30%2F11%2F2025&numero=R-00', filters: 'Du 01/11/2025 au 30/11/2025 ; N° de remise : R-00' },
    ])(`reprend les critères validés dans le détail ${format} ($filters)`, async ({ query, filters }) => {
      const r = await remittances(request('/export/remises?remise=1', `format=${format}${query ? '&' + query : ''}`)); expect(r.status).toBe(200);
      const bytes = new Uint8Array(await r.arrayBuffer()); const text = format === 'pdf' ? Buffer.from(bytes).toString('latin1') : Object.values(unzipSync(bytes)).map(value => strFromU8(value)).join('\n');
      expect(text).toContain(`Date de traitement : 12/11/2025${filters ? ' ; ' + filters : ''} ; Tri : date de vente, autorisation croissantes`);
      expect(mocks.query.mock.calls.find(([sql]) => sql.includes('WHERE r.id = $1'))?.[1]).toEqual([1, CLIENT.siren]);
    });
  }
  it.each(['numero=%25', 'numero=R&numero=R-00', 'fin=31%2F02%2F2026', 'debut=01%2F11%2F2025&debut=02%2F11%2F2025'])("refuse les critères hérités invalides avant la lecture du détail", async query => {
    const r = await remittances(request('/export/remises?remise=1', query)); expect(r.status).toBe(400); expect(r.headers.has('Content-Disposition')).toBe(false); expect(mocks.query.mock.calls.every(([sql]) => sql.includes('FROM utilisateurs'))).toBe(true);
  });
  it.each(['remise=0', 'remise=abc', 'remise=1&remise=2'])("répond 404 pour un identifiant de détail invalide", async query => { await expect(remittances(request('/export/remises?' + query))).rejects.toThrow('NOT_FOUND'); });
  it.each(['numero=%25', 'lignes=101'])("refuse les critères de remise avant leur lecture", async query => { const r = await remittances(request('/export/remises?' + query)); expect(r.status).toBe(400); expect(mocks.query.mock.calls.every(([sql]) => sql.includes('FROM utilisateurs'))).toBe(true); });
  it("refuse un dossier avec joker sans lecture de transactions", async () => { const r = await unpaid(request('/export/impayes?dossier=%25')); expect(r.status).toBe(400); expect(mocks.query.mock.calls.every(([sql]) => sql.includes('FROM utilisateurs'))).toBe(true); });
  it("garde le tri des impayés et le total signé dans le PDF", async () => { const r = await unpaid(request('/export/impayes?format=pdf&sort=montant&order=asc')); expect(Buffer.from(await r.arrayBuffer()).toString('latin1')).toContain('-182,23'); expect(mocks.query.mock.calls.find(([sql]) => sql.includes('SELECT t.id'))?.[0]).toContain('ORDER BY -t.montant ASC'); });
  it("refuse la synthèse au commerçant avant de lire des impayés", async () => { const r = await unpaid(request('/export/impayes?vue=synthese')); expect(r.status).toBe(403); expect(mocks.query.mock.calls.every(([sql]) => sql.includes('FROM utilisateurs'))).toBe(true); });
  it.each(['csv', 'xls', 'pdf'])("autorise la synthèse du PO en %s", async format => { setup('po'); const r = await unpaid(request('/export/impayes?vue=synthese&format=' + format)); expect(r.status).toBe(200); expect(mocks.query.mock.calls.some(([sql]) => sql.includes('GROUP BY'))).toBe(true); });
  it.each(['vue=autre', 'vue=synthese&vue=synthese'])("refuse une vue inconnue ou répétée", async query => { const r = await unpaid(request('/export/impayes?' + query)); expect(r.status).toBe(400); });
  it("ajoute un export propre au détail ouvert, sans page courante", () => {
    const html = renderToStaticMarkup(createElement(Remises, { result: { ...REMITTANCES, openedId: 1 }, basePath: '/client/remises' })); expect(html.match(/class="treasury-export"/g)).toHaveLength(2); expect(html.match(/type="radio"/g)).toHaveLength(6); expect(html.match(/checked="" value="csv"/g)).toHaveLength(2);
    const forms = html.match(/<form[^>]*class="treasury-export"[^>]*>.*?<\/form>/g)!; expect(forms[0]).not.toContain('name="remise"'); expect(forms[1]).toContain('name="remise" value="1"'); expect(forms.every(f => !f.includes('name="page"'))).toBe(true);
    expect(forms[1]).toContain('name="debut" value="01/11/2025"'); expect(forms[1]).toContain('name="fin" value="30/11/2025"'); expect(forms[1]).toContain('name="numero" value="R-00"');
  });
  it("n'affiche la synthèse exportable que sur l'écran global du PO", () => {
    const client = renderToStaticMarkup(createElement(Impayes, { result: UNPAID, basePath: '/client/impayes' })); const po = renderToStaticMarkup(createElement(Impayes, { result: UNPAID, basePath: '/po/impayes', merchants: [COMPANY] })); expect(client.match(/type="radio"/g)).toHaveLength(3); expect(client).not.toContain('value="synthese"'); expect(po.match(/type="radio"/g)).toHaveLength(6); expect(po).toContain('name="vue" value="synthese"');
  });
  it("retire tous les boutons d'export quand les critères sont invalides", () => {
    const rem = renderToStaticMarkup(createElement(Remises, { result: { ...REMITTANCES, criteria: { ...REMITTANCES.criteria, error: 'Erreur' } }, basePath: '/client/remises' }));
    const imp = renderToStaticMarkup(createElement(Impayes, { result: { ...UNPAID, criteria: { ...UNPAID.criteria, error: 'Erreur' } }, basePath: '/po/impayes', merchants: [COMPANY] })); expect(rem).not.toContain('class="treasury-export"'); expect(imp).not.toContain('class="treasury-export"');
  });
});
