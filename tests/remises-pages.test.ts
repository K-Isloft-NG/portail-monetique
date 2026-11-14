import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ClientRemittancesPage from "@/app/client/remises/page";

const mocks = vi.hoisted(() => ({ query: vi.fn(), readSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/session", async original => ({ ...await original<typeof import("@/lib/session")>(), readSession: mocks.readSession }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/LogoutButton", () => ({ default: () => null }));
const CLIENT = { sessionId: "12345678-1234-4123-8123-123456789abc", id: 1, login: "compte-test", profile: "client", siren: "100000001" };
const COMPANY = { numero_siren: CLIENT.siren, raison_sociale: "Entreprise fictive", est_active: true };
const ROW = { id: 1, ...COMPANY, numero_remise: "R-100000001-202511-1", date_remise: "2025-11-12", nb_transactions: 3, montant_total: "182.23", sens: "-", devise: "EUR" };
const DETAIL = { id: 1, numero_siren: CLIENT.siren, date_vente: "2025-11-11", numero_carte: "12345*******5896", reseau: "CB", numero_autorisation: "654321", devise: "EUR", montant: "182.23", sens: "-" };
const page = (params = {}) => ClientRemittancesPage({ searchParams: Promise.resolve(params) });

describe("page des remises du commerçant", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.readSession.mockResolvedValue(CLIENT);
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...CLIENT, est_actif: true }] : sql.includes("FROM entreprises") ? [COMPANY] : sql.includes("COUNT(*)") ? [{ count: "23", total: "-182.23" }] : sql.includes("FROM transactions") ? [DETAIL] : [ROW]);
  });
  it.each(["po", "admin"])("refuse le profil %s avant les données métier", async profile => {
    const session = { ...CLIENT, profile, siren: null };
    mocks.readSession.mockResolvedValue(session);
    mocks.query.mockResolvedValue([{ ...session, est_actif: true }]);
    await expect(page()).rejects.toThrow(`REDIRECT:/${profile}`);
    expect(mocks.query).toHaveBeenCalledOnce();
  });
  it("refuse le visiteur sans lecture SQL", async () => {
    mocks.readSession.mockResolvedValue(null);
    await expect(page()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("rend les huit colonnes, le signe, le montant rouge et le nombre global", async () => {
    const html = renderToStaticMarkup(await page());
    for (const label of ["N° SIREN", "Raison sociale", "N° Remise", "Date traitement", "Nbre transactions", "Devise (EUR)", "Montant total", "Sens + ou -"]) expect(html).toContain(label);
    expect(html).toContain('class="tabular-nums negative-amount">−182,23');
    expect(html).toContain("23 remises");
    expect(html).toContain("Solde des remises");
    expect(html).toContain("Page 1 sur 3");
    expect(html).toMatch(/<a(?=[^>]*href="\/client\/remises")(?=[^>]*aria-current="page")[^>]*>/);
    expect(html).toContain('action="/export/remises"');
    expect(html).toContain('href="/client/impayes"');
  });
  it.each([{ debut: "31/02/2025" }, { numero: "%" }, { lignes: "0" }])("rend l'erreur %j sans tableau ni lecture des remises", async params => {
    const html = renderToStaticMarkup(await page(params));
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("<table");
    expect(mocks.query.mock.calls.every(([sql]) => !sql.includes("FROM remises") && !sql.includes("FROM transactions"))).toBe(true);
  });
  it("repart sans page ni détail lors d'une recherche et conserve les critères dans Suivant", async () => {
    const html = renderToStaticMarkup(await page({ numero: "202511", debut: "01/11/2025", lignes: "5" }));
    expect(html).toContain('method="get"');
    const searchForm = html.match(/<form[^>]*aria-label="Critères de remises"[^>]*>[\s\S]*?<\/form>/)?.[0];
    expect(searchForm).toBeDefined();
    expect(searchForm).not.toContain('name="page"');
    expect(html).not.toContain('name="remise"');
    expect(html).toContain("numero=202511");
    expect(html).toContain("lignes=5");
    expect(html).toContain("page=2");
    const paginationForm = html.match(/<form[^>]*novalidate[^>]*>[\s\S]*?<\/form>/i)?.[0];
    expect(paginationForm).toContain('for="remittance-page">Aller à la page');
    expect(paginationForm).toContain('name="numero" value="202511"');
    expect(paginationForm).toContain('name="debut" value="01/11/2025"');
    expect(paginationForm).toContain('name="lignes" value="5"');
    expect(paginationForm).not.toContain('name="remise"');
  });
  it("ouvre le détail autorisé, annonce son état et propose un lien de fermeture", async () => {
    const html = renderToStaticMarkup(await page({ remise: "1", numero: "202511", page: "2", lignes: "5" }));
    expect(html).toContain('aria-expanded="true" aria-controls="detail-1"');
    expect(html).toContain('<span aria-hidden="true">− </span>');
    expect(html).toContain("Détail de la remise R-100000001-202511-1");
    for (const value of ["Date vente", "N° Carte", "Réseau", "N° autorisation", DETAIL.numero_carte, "654321", "CB"]) expect(html).toContain(value);
    const link = html.match(/<a[^>]*aria-controls="detail-1"[^>]*>/)?.[0];
    expect(link).not.toContain("remise=1");
    expect(link).toContain("page=2");
    expect(link).toContain("numero=202511");
    expect(html.match(/negative-amount/g)?.length).toBe(4);
  });
  it("ignore une remise d'une autre entreprise sans lire ni rendre son détail", async () => {
    const html = renderToStaticMarkup(await page({ remise: "999" }));
    expect(html).not.toContain("Détail de la remise");
    expect(html).toContain('aria-expanded="false" aria-controls="detail-1"');
    expect(html).toContain('<span aria-hidden="true">+ </span>');
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("FROM transactions"))).toBe(false);
  });
  it("masque défensivement une source non masquée dans le rendu", async () => {
    const source = "12345" + "0".repeat(7) + "5896";
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...CLIENT, est_actif: true }] : sql.includes("FROM entreprises") ? [COMPANY] : sql.includes("COUNT(*)") ? [{ count: "1", total: "-182.23" }] : sql.includes("FROM transactions") ? [{ ...DETAIL, numero_carte: source }] : [ROW]);
    const html = renderToStaticMarkup(await page({ remise: "1" }));
    expect(html).toContain(DETAIL.numero_carte);
    expect(html).not.toContain(source);
    expect(html).not.toMatch(/[0-9]{16}/);
  });
  it("annonce une remise sans transaction", async () => {
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...CLIENT, est_actif: true }] : sql.includes("FROM entreprises") ? [COMPANY] : sql.includes("COUNT(*)") ? [{ count: "1", total: "-182.23" }] : sql.includes("FROM transactions") ? [] : [ROW]);
    expect(renderToStaticMarkup(await page({ remise: "1" }))).toContain("Aucune transaction pour cette remise.");
  });
});
