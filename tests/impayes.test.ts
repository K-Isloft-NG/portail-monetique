import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseUnpaidCriteria, readUnpaid, unpaidQuery } from "@/lib/impayes";
import type { VerifiedSession } from "@/lib/session";

const mocks = vi.hoisted(() => ({ query: vi.fn(), readSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/session", async original => ({ ...await original<typeof import("@/lib/session")>(), readSession: mocks.readSession }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
const CLIENT: VerifiedSession = { sessionId: "12345678-1234-4123-8123-123456789abc", id: 1, login: "compte-test", profile: "client", siren: "100000001" };
const ROW = { id: 1, numero_siren: CLIENT.siren, date_vente: "2025-11-11", date_remise: "2025-11-12", numero_carte: "12345*******5896", reseau: "CB", numero_dossier_impaye: "D0001", devise: "EUR", montant: "-182.23", libelle: "Opposition pour perte ou vol de la carte bancaire" };
let current: VerifiedSession;
const calls = () => mocks.query.mock.calls.filter(([sql]) => sql.includes("FROM transactions"));

describe("recherche des impayés", () => {
  beforeEach(() => {
    vi.resetAllMocks(); current = CLIENT;
    mocks.readSession.mockImplementation(async () => current);
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM utilisateurs")) return [{ ...current, est_actif: true }];
      if (sql.includes("FROM entreprises")) return [{ numero_siren: "100000002" }];
      if (sql.includes("GROUP BY")) return [{ numero_siren: CLIENT.siren, raison_sociale: "Entreprise fictive", count: "2", total: "-182.53" }];
      if (sql.includes("COUNT(*)")) return [{ count: "2", total: "-182.53" }];
      return [ROW, { ...ROW, id: 2, numero_dossier_impaye: "D0002", montant: "-0.30" }];
    });
  });
  it.each([{}, { debut: "29/02/2024" }, { fin: "30/11/2025" }, { debut: "01/11/2025", fin: "30/11/2025" }])("accepte les bornes indépendantes et incluses %j", async params => {
    const result = await readUnpaid(params);
    expect(result.criteria.error).toBeUndefined();
    expect(calls()[0][0]).toContain("r.date_remise >= $2::date");
    expect(calls()[0][0]).toContain("r.date_remise <= $3::date");
  });
  it.each([
    { debut: "31/02/2025" }, { debut: "29/02/2025" }, { fin: "abc" },
    { debut: "02/11/2025", fin: "01/11/2025" }, { debut: ["01/11/2025", "01/11/2025"] }, { fin: ["30/11/2025", "30/11/2025"] },
    { dossier: "%" }, { dossier: "_" }, { dossier: " " }, { dossier: "-" }, { dossier: "D00001" }, { dossier: ["D0001", "D0001"] },
  ])("refuse %j avant toute lecture métier", async params => {
    const result = await readUnpaid(params, true);
    expect(result.criteria.error).toBeTruthy();
    expect(result.rows).toEqual([]); expect(result.companies).toEqual([]);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("traite le dossier vide comme une absence de filtre", async () => {
    expect((await readUnpaid({ dossier: "" })).criteria.error).toBeUndefined();
    expect(calls().every(([, params]) => params[3] === null)).toBe(true);
  });
  it.each(["D", "0001", "D0001", "d0001"])("lie le fragment %s sans changer le SQL et utilise ILIKE", async dossier => {
    await readUnpaid({}); const reference = calls().map(([sql]) => sql); mocks.query.mockClear();
    await readUnpaid({ dossier });
    for (const [index, [sql, params]] of calls().entries()) {
      expect(sql).toBe(reference[index]); expect(params[3]).toBe(dossier);
      expect(sql).toContain("ILIKE '%' || $4 || '%'");
    }
  });
  it.each([
    { sort: "inconnu", order: "asc" }, { sort: "montant", order: "inconnu" },
    { sort: ["date", "montant"], order: "asc" }, { sort: "montant", order: ["asc", "desc"] },
    { sort: "__proto__", order: "asc" }, { sort: "a".repeat(5000), order: "desc" },
    { sort: "<script>test</script>", order: "desc" }, { sort: "montant; SELECT", order: "desc" },
  ])("ignore les tris inconnus ou répétés %j", params => expect(parseUnpaidCriteria(params).sort).toEqual({ key: "date", order: "desc" }));
  it("autorise les six ordres pour le PO avec départage constant", async () => {
    current = { ...CLIENT, profile: "po", siren: null };
    for (const sort of ["date", "montant", "siren"]) for (const order of ["asc", "desc"]) {
      mocks.query.mockClear(); const result = await readUnpaid({ sort, order });
      expect(result.criteria.sort).toEqual({ key: sort, order });
      expect(calls()[1][0]).toContain("t.numero_dossier_impaye ASC");
      if (sort === "montant") expect(calls()[1][0]).toContain(`ORDER BY -t.montant ${order.toUpperCase()}`);
    }
  });
  it("refuse le tri SIREN au commerçant", async () => expect((await readUnpaid({ sort: "siren", order: "asc" })).criteria.sort).toEqual({ key: "date", order: "desc" }));
  it.each([undefined, "invalide", ["desc", "asc"]].map(tri_siren => [tri_siren]))("revient au tri de synthèse croissant pour %j", tri_siren => expect(parseUnpaidCriteria({ tri_siren }).companyOrder).toBe("asc"));
  it("lie les filtres et applique une clause impayé constante aux trois requêtes", async () => {
    current = { ...CLIENT, profile: "po", siren: null };
    await readUnpaid({ siren: "100000002", debut: "01/11/2025", fin: "30/11/2025", dossier: "D0001", tri_siren: "desc" }, true);
    expect(calls()).toHaveLength(3);
    for (const [sql, params] of calls()) {
      expect(params).toEqual(["100000002", "2025-11-01", "2025-11-30", "D0001"]);
      expect(sql).toContain("t.sens = '-' AND t.motif_impaye_id IS NOT NULL AND t.numero_dossier_impaye IS NOT NULL");
      for (const value of params) expect(sql).not.toContain(value);
    }
    expect(calls()[2][0]).toContain("GROUP BY r.numero_siren, e.raison_sociale");
    expect(calls()[2][0]).toContain("ORDER BY r.numero_siren DESC");
  });
  it.each(["100000002", ["100000002", "100000003"], "invalide"].map(siren => [siren]))("ignore entièrement le SIREN du commerçant %j", async siren => {
    expect((await readUnpaid({ siren })).siren).toBe(CLIENT.siren);
    expect(calls().every(([, params]) => params[0] === CLIENT.siren)).toBe(true);
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("FROM entreprises"))).toBe(false);
  });
  it("donne au PO toutes les entreprises ou une entreprise existante", async () => {
    current = { ...CLIENT, profile: "po", siren: null };
    expect((await readUnpaid({})).siren).toBeUndefined();
    expect((await readUnpaid({ siren: "100000002" })).siren).toBe("100000002");
    expect((await readUnpaid({ siren: "malforme" })).siren).toBeUndefined();
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...current, est_actif: true }] : sql.includes("FROM entreprises") ? [] : sql.includes("COUNT(*)") ? [{ count: "0", total: "0" }] : []);
    expect((await readUnpaid({ siren: "999999999" })).siren).toBeUndefined();
  });
  it("convertit les sommes signées en centimes et limite la synthèse au PO qui la demande", async () => {
    expect((await readUnpaid({}, true)).companies).toEqual([]);
    expect(calls()).toHaveLength(2);
    current = { ...CLIENT, profile: "po", siren: null }; mocks.query.mockClear();
    const result = await readUnpaid({}, true);
    expect(result.totalCents).toBe(-18253); expect(result.count).toBe(2);
    expect(result.companies).toEqual([{ numero_siren: CLIENT.siren, raison_sociale: "Entreprise fictive", count: 2, totalCents: -18253 }]);
    expect(calls()[0][0]).toContain("COALESCE(SUM(-t.montant), 0)::text");
    mocks.query.mockClear(); await readUnpaid({}); expect(calls()).toHaveLength(2);
  });
  it("rend un total nul et aucune entreprise sans résultat", async () => {
    current = { ...CLIENT, profile: "po", siren: null };
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...current, est_actif: true }] : sql.includes("GROUP BY") ? [] : sql.includes("COUNT(*)") ? [{ count: "0", total: "0" }] : []);
    const result = await readUnpaid({}, true);
    expect([result.count, result.totalCents]).toEqual([0, 0]); expect(result.companies).toEqual([]); expect(result.rows).toEqual([]);
  });
  it("conserve les critères et les deux tris dans les liens", async () => {
    const result = await readUnpaid({ debut: "01/11/2025", fin: "30/11/2025", dossier: "D0001", sort: "montant", order: "asc", tri_siren: "desc" });
    expect(Object.fromEntries(new URLSearchParams(unpaidQuery(result)))).toEqual({ siren: CLIENT.siren, debut: "01/11/2025", fin: "30/11/2025", dossier: "D0001", sort: "montant", order: "asc", tri_siren: "desc" });
  });
  it("refuse l'administrateur avant les transactions", async () => {
    current = { ...CLIENT, profile: "admin", siren: null };
    await expect(readUnpaid({})).rejects.toThrow("REDIRECT:/admin"); expect(calls()).toEqual([]);
  });
  it("masque une erreur du pilote", async () => {
    mocks.query.mockImplementation(async (sql: string) => { if (sql.includes("FROM utilisateurs")) return [{ ...CLIENT, est_actif: true }]; throw new Error("Détail interne"); });
    await expect(readUnpaid({})).rejects.toThrow("Lecture des impayés indisponible.");
  });
});
