import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/export/tresorerie/route";
import type { SessionData } from "@/lib/session";

const mocks = vi.hoisted(() => ({ query: vi.fn(), readSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/session", async (original) => ({ ...await original<typeof import("@/lib/session")>(), readSession: mocks.readSession }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
const CLIENT: SessionData = { id: 1, login: "compte-test", profile: "client", siren: "100000001" };
function setup(session: SessionData) {
  mocks.readSession.mockResolvedValue(session);
  mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes("FROM utilisateurs")) return [{ ...session, est_actif: true }];
    if (sql.includes("FROM entreprises")) return [{ numero_siren: params[0] }];
    return [{ id: 1, numero_siren: params[0] ?? "100000001", raison_sociale: "Entreprise fictive", date_valeur: "2025-11-12", nb_transactions: 2, montant_total: "-182.23", devise: "EUR" }];
  });
}
describe("droits et réponse de l'export de trésorerie", () => {
  beforeEach(() => { vi.resetAllMocks(); setup(CLIENT); });
  it("renvoie un visiteur vers la connexion sans SQL", async () => {
    mocks.readSession.mockResolvedValue(null);
    await expect(GET(new Request("http://localhost/export/tresorerie"))).rejects.toThrow("REDIRECT:/login");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("refuse l'administrateur avant toute donnée d'entreprise", async () => {
    setup({ ...CLIENT, profile: "admin", siren: null });
    await expect(GET(new Request("http://localhost/export/tresorerie?siren=100000002"))).rejects.toThrow("REDIRECT:/admin");
    expect(mocks.query.mock.calls.every(([sql]) => !sql.includes("FROM annonces_tresorerie") && !sql.includes("FROM entreprises"))).toBe(true);
  });
  it("ignore le SIREN adverse du commerçant et force un téléchargement privé", async () => {
    const response = await GET(new Request("http://localhost/export/tresorerie?siren=100000002&date=12%2F11%2F2025&sort=montant&order=asc"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="tresorerie_100000001_[0-9-]+\.csv"$/);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([239, 187, 191]);
    const body = new TextDecoder().decode(bytes);
    expect(body).toContain(";100000001;");
    expect(body).not.toContain("100000002");
    expect(mocks.query.mock.calls.find(([sql]) => sql.includes("FROM annonces_tresorerie"))?.[1]).toEqual([CLIENT.siren, "2025-11-12"]);
  });
  it("retourne 400 sur une date invalide sans lire les annonces", async () => {
    const response = await GET(new Request("http://localhost/export/tresorerie?date=31%2F02%2F2026"));
    expect(response.status).toBe(400);
    expect(mocks.query.mock.calls.every(([sql]) => !sql.includes("FROM annonces_tresorerie"))).toBe(true);
  });
  it("refuse un format indisponible sans lire les annonces", async () => {
    const response = await GET(new Request("http://localhost/export/tresorerie?format=pdf"));
    expect(response.status).toBe(400);
    expect(mocks.query.mock.calls.every(([sql]) => !sql.includes("FROM annonces_tresorerie"))).toBe(true);
  });
  it("autorise le PO avec un SIREN sélectionné", async () => {
    setup({ ...CLIENT, profile: "po", siren: null });
    const response = await GET(new Request("http://localhost/export/tresorerie?siren=100000002&sort=siren&order=desc"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(";100000002;");
  });
});
