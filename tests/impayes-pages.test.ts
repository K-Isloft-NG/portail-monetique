import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ClientUnpaidPage from "@/app/client/impayes/page";

const mocks = vi.hoisted(() => ({ query: vi.fn(), readSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/session", async original => ({ ...await original<typeof import("@/lib/session")>(), readSession: mocks.readSession }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/LogoutButton", () => ({ default: () => null }));
const CLIENT = { sessionId: "12345678-1234-4123-8123-123456789abc", id: 1, login: "compte-test", profile: "client", siren: "100000001" };
const COMPANY = { numero_siren: CLIENT.siren, raison_sociale: "Entreprise fictive" };
const ROW = { id: 1, numero_siren: CLIENT.siren, date_vente: "2025-11-11", date_remise: "2025-11-12", numero_carte: "12345*******5896", reseau: "CB", numero_dossier_impaye: "D0001", devise: "EUR", montant: "-182.23", libelle: "Opposition pour perte ou vol de la carte bancaire" };
const page = (params = {}) => ClientUnpaidPage({ searchParams: Promise.resolve(params) });

describe("page des impayés du commerçant", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.readSession.mockResolvedValue(CLIENT);
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...CLIENT, est_actif: true }] : sql.includes("FROM entreprises") ? [COMPANY] : sql.includes("COUNT(*)") ? [{ count: "1", total: "-182.23" }] : [ROW]);
  });
  it.each(["po", "admin"])("refuse le profil %s avant les données métier", async profile => {
    const session = { ...CLIENT, profile, siren: null }; mocks.readSession.mockResolvedValue(session); mocks.query.mockResolvedValue([{ ...session, est_actif: true }]);
    await expect(page()).rejects.toThrow(`REDIRECT:/${profile}`); expect(mocks.query).toHaveBeenCalledOnce();
  });
  it("refuse le visiteur sans SQL", async () => {
    mocks.readSession.mockResolvedValue(null); await expect(page()).rejects.toThrow("REDIRECT:/login"); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("rend les neuf colonnes, le motif entier, la carte masquée et le montant signé rouge", async () => {
    const html = renderToStaticMarkup(await page());
    for (const text of ["N° SIREN", "Date vente", "Date de remise", "N° Carte", "Réseau", "N° dossier impayé", "Devise (EUR)", "Montant", "Libellé impayé", ROW.libelle, ROW.numero_carte]) expect(html).toContain(text);
    expect(html).toContain('class="tabular-nums negative-amount">−182,23');
    expect(html).toContain("1 impayé"); expect(html).toContain("Total des impayés");
    expect(html).not.toContain("Somme des impayés par entreprise"); expect(html).not.toContain("Exporter"); expect(html).not.toContain("Pagination");
    expect(html).toMatch(/<a(?=[^>]*href="\/client\/impayes")(?=[^>]*aria-current="page")[^>]*>/);
    expect(html).toContain('href="/client/remises"'); expect(html).toContain('href="/client"');
  });
  it.each([{ debut: "31/02/2025" }, { dossier: "%" }, { dossier: ["D0001", "D0001"] }])("refuse %j sans tableau ni lecture de transactions", async params => {
    const html = renderToStaticMarkup(await page(params)); expect(html).toContain('role="alert"'); expect(html).not.toContain("<table");
    expect(mocks.query.mock.calls.every(([sql]) => !sql.includes("FROM transactions"))).toBe(true);
  });
  it("conserve les filtres et le tri dans les liens et le formulaire sans tri SIREN", async () => {
    const html = renderToStaticMarkup(await page({ debut: "01/11/2025", fin: "30/11/2025", dossier: "D0001", sort: "montant", order: "asc" }));
    expect(html).toContain('method="get"'); expect(html).toMatch(/<input(?=[^>]*name="sort")(?=[^>]*value="montant")[^>]*>/);
    expect(html).toMatch(/<input(?=[^>]*name="order")(?=[^>]*value="asc")[^>]*>/);
    expect(html).toContain('aria-sort="ascending"'); expect(html).toContain("dossier=D0001"); expect(html).toContain("debut=01%2F11%2F2025");
    expect(html).not.toContain("sort=siren"); expect(html).toContain("Tri des impayés");
  });
  it("remasque une source non masquée sans exposer une suite de 16 chiffres", async () => {
    const source = "12345" + "0".repeat(7) + "5896";
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...CLIENT, est_actif: true }] : sql.includes("FROM entreprises") ? [COMPANY] : sql.includes("COUNT(*)") ? [{ count: "1", total: "-182.23" }] : [{ ...ROW, numero_carte: source }]);
    const html = renderToStaticMarkup(await page()); expect(html).toContain(ROW.numero_carte); expect(html).not.toContain(source); expect(html).not.toMatch(/[0-9]{16}/);
  });
  it("affiche les messages vides et un total nul sans rouge", async () => {
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...CLIENT, est_actif: true }] : sql.includes("FROM entreprises") ? [COMPANY] : sql.includes("COUNT(*)") ? [{ count: "0", total: "0" }] : []);
    const html = renderToStaticMarkup(await page()); expect(html).toContain("Aucun impayé pour cette période."); expect(html).toContain("0,00"); expect(html).not.toContain("negative-amount");
    expect(renderToStaticMarkup(await page({ dossier: "ZZZZZ" }))).toContain("Aucun impayé ne correspond à votre recherche.");
  });
});
