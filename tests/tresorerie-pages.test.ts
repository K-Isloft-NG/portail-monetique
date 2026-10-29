import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PoPage from "@/app/po/page";
import PoCompanyPage from "@/app/po/entreprise/[siren]/page";
import { getPoCompany } from "@/lib/access";

const mocks = vi.hoisted(() => ({ query: vi.fn(), readSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/session", async (original) => ({ ...await original<typeof import("@/lib/session")>(), readSession: mocks.readSession }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("@/components/LogoutButton", () => ({ default: () => null }));
const PO = { sessionId: "12345678-1234-4123-8123-123456789abc", id: 2, login: "compte-test", profile: "po", siren: null };
const COMPANY = { numero_siren: "100000002", raison_sociale: "Entreprise fictive", est_active: true };
const companyPage = (siren: string, extra = {}) => PoCompanyPage({ params: Promise.resolve({ siren }), searchParams: Promise.resolve(extra) });

describe("pages de trésorerie du Product Owner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.readSession.mockResolvedValue(PO);
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...PO, est_actif: true }] : sql.includes("FROM entreprises") ? [COMPANY] : []);
  });
  it.each(["client", "admin"])("refuse le profil %s avant les données métier", async (profile) => {
    const session = { ...PO, profile, siren: profile === "client" ? "100000001" : null };
    mocks.readSession.mockResolvedValue(session);
    mocks.query.mockResolvedValue([{ ...session, est_actif: true }]);
    await expect(PoPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(`REDIRECT:/${profile}`);
    await expect(companyPage(COMPANY.numero_siren)).rejects.toThrow(`REDIRECT:/${profile}`);
    expect(mocks.query.mock.calls.every(([sql]) => !sql.includes("FROM entreprises") && !sql.includes("FROM annonces_tresorerie"))).toBe(true);
  });
  it("refuse le visiteur sans SQL", async () => {
    mocks.readSession.mockResolvedValue(null);
    await expect(companyPage(COMPANY.numero_siren)).rejects.toThrow("REDIRECT:/login");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each(["123", "abcdefghi", "1000000020"])("renvoie 404 pour le SIREN mal formé %s", async (siren) => {
    await expect(companyPage(siren)).rejects.toThrow("NOT_FOUND");
    expect(mocks.query).toHaveBeenCalledOnce();
  });
  it("renvoie 404 pour une entreprise inconnue", async () => {
    mocks.query.mockResolvedValueOnce([{ ...PO, est_actif: true }]).mockResolvedValueOnce([]);
    await expect(companyPage("999999999")).rejects.toThrow("NOT_FOUND");
    expect(mocks.query.mock.calls[1][1]).toEqual(["999999999"]);
  });
  it("conserve la lecture d'une entreprise désactivée et annonce son état", async () => {
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...PO, est_actif: true }] : sql.includes("FROM entreprises") ? [{ ...COMPANY, est_active: false }] : []);
    expect((await getPoCompany(COMPANY.numero_siren)).company.est_active).toBe(false);
    const html = renderToStaticMarkup(await companyPage(COMPANY.numero_siren));
    expect(html).toContain("Compte désactivé");
    expect(html).toContain("Entreprise fictive");
  });
  it("fait primer le chemin du compte sur un paramètre SIREN adverse", async () => {
    await companyPage(COMPANY.numero_siren, { siren: "100000001" });
    expect(mocks.query.mock.calls.find(([sql]) => sql.includes("FROM annonces_tresorerie"))?.[1]).toEqual([COMPANY.numero_siren, null]);
  });
  it("conserve les commerçants pour le filtre et le bandeau de synthèse", async () => {
    const html = renderToStaticMarkup(await PoPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('name="siren"');
    expect(html).toContain("commerçants enregistrés");
    expect(html).toContain("Entreprise fictive");
  });
});
