import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PoUnpaidPage from "@/app/po/impayes/page";
import PoCompanyUnpaidPage from "@/app/po/entreprise/[siren]/impayes/page";
import PoCompanyPage from "@/app/po/entreprise/[siren]/page";
import PoCompanyRemittancesPage from "@/app/po/entreprise/[siren]/remises/page";

const mocks = vi.hoisted(() => ({ query: vi.fn(), readSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/session", async original => ({ ...await original<typeof import("@/lib/session")>(), readSession: mocks.readSession }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/LogoutButton", () => ({ default: () => null }));
const PO = { sessionId: "12345678-1234-4123-8123-123456789abc", id: 2, login: "compte-test", profile: "po", siren: null };
const COMPANY = { numero_siren: "100000002", raison_sociale: "Entreprise fictive", est_active: true };
const ROW = { id: 1, numero_siren: COMPANY.numero_siren, date_vente: "2025-11-11", date_remise: "2025-11-12", numero_carte: "12345*******5896", reseau: "CB", numero_dossier_impaye: "D0001", devise: "EUR", montant: "-182.23", libelle: "Opposition pour perte ou vol de la carte bancaire" };
const page = (params = {}) => PoUnpaidPage({ searchParams: Promise.resolve(params) });
const companyPage = (siren: string, extra = {}) => PoCompanyUnpaidPage({ params: Promise.resolve({ siren }), searchParams: Promise.resolve(extra) });

describe("pages des impayés du Product Owner", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.readSession.mockResolvedValue(PO);
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...PO, est_actif: true }] : sql.includes("FROM entreprises") ? [COMPANY] : sql.includes("GROUP BY") ? [{ ...COMPANY, count: "1", total: "-182.23" }] : sql.includes("COUNT(*)") ? [{ count: "1", total: "-182.23" }] : sql.includes("FROM transactions") ? [ROW] : []);
  });
  it.each(["client", "admin"])("refuse le profil %s avant les données métier", async profile => {
    const session = { ...PO, profile, siren: profile === "client" ? "100000001" : null }; mocks.readSession.mockResolvedValue(session); mocks.query.mockResolvedValue([{ ...session, est_actif: true }]);
    await expect(page()).rejects.toThrow(`REDIRECT:/${profile}`); await expect(companyPage(COMPANY.numero_siren)).rejects.toThrow(`REDIRECT:/${profile}`);
    expect(mocks.query.mock.calls.every(([sql]) => sql.includes("FROM utilisateurs"))).toBe(true);
  });
  it("refuse le visiteur sans SQL", async () => {
    mocks.readSession.mockResolvedValue(null); await expect(page()).rejects.toThrow("REDIRECT:/login"); await expect(companyPage(COMPANY.numero_siren)).rejects.toThrow("REDIRECT:/login"); expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each(["123", "abcdefghi", "1000000020"])("renvoie 404 pour le SIREN mal formé %s", async siren => {
    await expect(companyPage(siren)).rejects.toThrow("NOT_FOUND"); expect(mocks.query).toHaveBeenCalledOnce();
  });
  it("renvoie 404 pour une entreprise inconnue", async () => {
    mocks.query.mockResolvedValueOnce([{ ...PO, est_actif: true }]).mockResolvedValueOnce([]); await expect(companyPage("999999999")).rejects.toThrow("NOT_FOUND");
  });
  it("affiche la synthèse, un total cohérent et le nombre d'entreprises", async () => {
    const html = renderToStaticMarkup(await page()); expect(html).toContain("Somme des impayés par entreprise"); expect(html).toContain("1 entreprise concernée"); expect(html).toContain("Entreprise fictive");
    expect(html.match(/−182,23/g)).toHaveLength(5);
    expect(html).toContain("tri_siren=desc"); expect(html).toContain('href="/po/impayes"');
  });
  it("conserve la sélection en cas d'erreur sans table ni lecture des impayés", async () => {
    const html = renderToStaticMarkup(await page({ siren: COMPANY.numero_siren, dossier: "%" })); expect(html).toMatch(/<option(?=[^>]*value="100000002")(?=[^>]*selected="")[^>]*>/);
    expect(html).not.toContain("<table"); expect(mocks.query.mock.calls.every(([sql]) => !sql.includes("FROM transactions"))).toBe(true);
  });
  it("fait primer le chemin, garde le compte désactivé consultable et omet la synthèse", async () => {
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...PO, est_actif: true }] : sql.includes("FROM entreprises") ? [{ ...COMPANY, est_active: false }] : sql.includes("COUNT(*)") ? [{ count: "1", total: "-182.23" }] : [ROW]);
    const html = renderToStaticMarkup(await companyPage(COMPANY.numero_siren, { siren: "100000001", sort: "montant", order: "asc" }));
    expect(html).toContain("Compte désactivé"); expect(html).not.toContain("Somme des impayés par entreprise");
    expect(html).toContain("Trésorerie de cette entreprise"); expect(html).toContain("Remises de cette entreprise");
    expect(mocks.query.mock.calls.filter(([sql]) => sql.includes("FROM transactions")).every(([, params]) => params[0] === COMPANY.numero_siren)).toBe(true);
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("GROUP BY"))).toBe(false);
  });
  it("ouvre la vue complète d'entreprise sans reprendre dates ni dossier, en gardant le tri", async () => {
    const html = renderToStaticMarkup(await page({ debut: "01/11/2025", fin: "30/11/2025", dossier: "D0001", sort: "montant", order: "asc" }));
    const href = html.match(/href="(\/po\/entreprise\/100000002\/impayes[^\"]*)"/)?.[1];
    expect(href).toContain("sort=montant"); expect(href).toContain("order=asc"); expect(href).not.toContain("debut"); expect(href).not.toContain("fin"); expect(href).not.toContain("dossier");
  });
  it("ajoute les liens croisés sur la trésorerie et les remises", async () => {
    const args = { params: Promise.resolve({ siren: COMPANY.numero_siren }), searchParams: Promise.resolve({}) };
    expect(renderToStaticMarkup(await PoCompanyPage(args))).toContain("Impayés de cette entreprise");
    expect(renderToStaticMarkup(await PoCompanyRemittancesPage(args))).toContain("Impayés de cette entreprise");
  });
});
