import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import PoRemittancesPage from "@/app/po/remises/page";
import PoCompanyRemittancesPage from "@/app/po/entreprise/[siren]/remises/page";
import PoCompanyPage from "@/app/po/entreprise/[siren]/page";
import EspaceConnecte from "@/components/EspaceConnecte";

const mocks = vi.hoisted(() => ({ query: vi.fn(), readSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/session", async original => ({ ...await original<typeof import("@/lib/session")>(), readSession: mocks.readSession }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/LogoutButton", () => ({ default: () => null }));
const PO = { sessionId: "12345678-1234-4123-8123-123456789abc", id: 2, login: "compte-test", profile: "po", siren: null };
const COMPANY = { numero_siren: "100000002", raison_sociale: "Entreprise fictive", est_active: true };
const page = (params = {}) => PoRemittancesPage({ searchParams: Promise.resolve(params) });
const companyPage = (siren: string, extra = {}) => PoCompanyRemittancesPage({ params: Promise.resolve({ siren }), searchParams: Promise.resolve(extra) });

describe("pages des remises du Product Owner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.readSession.mockResolvedValue(PO);
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...PO, est_actif: true }] : sql.includes("FROM entreprises") ? [COMPANY] : sql.includes("COUNT(*)") ? [{ count: "0", total: "0" }] : []);
  });
  it.each(["client", "admin"])("refuse le profil %s sur les deux routes avant les données métier", async profile => {
    const session = { ...PO, profile, siren: profile === "client" ? "100000001" : null };
    mocks.readSession.mockResolvedValue(session);
    mocks.query.mockResolvedValue([{ ...session, est_actif: true }]);
    await expect(page()).rejects.toThrow(`REDIRECT:/${profile}`);
    await expect(companyPage(COMPANY.numero_siren)).rejects.toThrow(`REDIRECT:/${profile}`);
    expect(mocks.query.mock.calls.every(([sql]) => sql.includes("FROM utilisateurs"))).toBe(true);
  });
  it("refuse le visiteur sur les deux routes sans SQL", async () => {
    mocks.readSession.mockResolvedValue(null);
    await expect(page()).rejects.toThrow("REDIRECT:/login");
    await expect(companyPage(COMPANY.numero_siren)).rejects.toThrow("REDIRECT:/login");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each(["123", "abcdefghi", "1000000020"])("renvoie 404 pour le SIREN mal formé %s", async siren => {
    await expect(companyPage(siren)).rejects.toThrow("NOT_FOUND");
    expect(mocks.query).toHaveBeenCalledOnce();
  });
  it("renvoie 404 pour une entreprise inconnue", async () => {
    mocks.query.mockResolvedValueOnce([{ ...PO, est_actif: true }]).mockResolvedValueOnce([]);
    await expect(companyPage("999999999")).rejects.toThrow("NOT_FOUND");
  });
  it("annonce une entreprise désactivée et maintient sa consultation", async () => {
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...PO, est_actif: true }] : sql.includes("FROM entreprises") ? [{ ...COMPANY, est_active: false }] : sql.includes("COUNT(*)") ? [{ count: "0", total: "0" }] : []);
    const html = renderToStaticMarkup(await companyPage(COMPANY.numero_siren));
    expect(html).toContain("Compte désactivé");
    expect(html).toContain("Entreprise fictive");
    expect(html).toContain('href="/po/entreprise/100000002"');
  });
  it("fait primer le chemin validé sur le filtre SIREN de l'URL", async () => {
    await companyPage(COMPANY.numero_siren, { siren: "100000001" });
    const calls = mocks.query.mock.calls.filter(([sql]) => sql.includes("FROM remises"));
    expect(calls).toHaveLength(2);
    expect(calls.every(([, params]) => params[0] === COMPANY.numero_siren)).toBe(true);
  });
  it("propose toutes les entreprises et leur SIREN dans le filtre", async () => {
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('name="siren"');
    expect(html).toContain("Toutes");
    expect(html).toContain("Entreprise fictive");
    expect(html).toContain('aria-current="page" href="/po/remises"');
    expect(html).toContain('href="/po/impayes"');
  });
  it("conserve l'entreprise sélectionnée en cas de critères invalides sans lire les remises", async () => {
    const html = renderToStaticMarkup(await page({ siren: COMPANY.numero_siren, numero: "%" }));
    expect(html).toMatch(/<option(?=[^>]*value="100000002")(?=[^>]*selected="")[^>]*>/);
    expect(html).not.toContain("<table");
    expect(mocks.query.mock.calls.every(([sql]) => !sql.includes("FROM remises"))).toBe(true);
  });
  it("ajoute le lien croisé depuis la trésorerie de l'entreprise", async () => {
    const html = renderToStaticMarkup(await PoCompanyPage({ params: Promise.resolve({ siren: COMPANY.numero_siren }), searchParams: Promise.resolve({}) }));
    expect(html).toContain('href="/po/entreprise/100000002/remises"');
    expect(html).toContain("Remises de cette entreprise");
  });
  it("conserve l'entrée unique de l'administrateur", () => {
    const props = { entry: "Comptes", href: "/admin", identity: "Administrateur", logout: null, children: null };
    const html = renderToStaticMarkup(createElement(EspaceConnecte, props, null));
    expect(html).toContain('aria-current="page" href="/admin"');
    expect(html).not.toContain(">Remises<");
    expect(html).not.toContain(">Trésorerie<");
    expect(html).not.toContain(">Impayés<");
  });
});
