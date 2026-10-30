import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRemittanceNumber, parseRemittanceCriteria, readRemittances, remittanceQuery, signedRemittanceCents, type RemittanceRow } from "@/lib/remises";

const mocks = vi.hoisted(() => ({ query: vi.fn(), readSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/session", async original => ({ ...await original<typeof import("@/lib/session")>(), readSession: mocks.readSession }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
const CLIENT = { sessionId: "12345678-1234-4123-8123-123456789abc", id: 1, login: "compte-test", profile: "client", siren: "100000001" };
const ROW: RemittanceRow = { id: 1, numero_siren: CLIENT.siren, raison_sociale: "Entreprise fictive", numero_remise: "R-100000001-202511-1", date_remise: "2025-11-12", nb_transactions: 3, montant_total: "182.23", sens: "-", devise: "EUR" };
const dataCalls = () => mocks.query.mock.calls.filter(([sql]) => sql.includes("FROM remises") || sql.includes("FROM transactions"));

describe("recherche de remises", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.readSession.mockResolvedValue(CLIENT);
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM utilisateurs")) return [{ ...CLIENT, est_actif: true }];
      if (sql.includes("FROM entreprises")) return [{ numero_siren: "100000002" }];
      if (sql.includes("COUNT(*)")) return [{ count: "23", total: "-182.23" }];
      if (sql.includes("FROM transactions")) return [];
      return [ROW];
    });
  });
  it.each([{}, { debut: "29/02/2024" }, { fin: "31/12/2100" }, { debut: "01/01/1900", fin: "29/02/2024" }])("accepte les bornes facultatives incluses %j", async params => {
    const result = await readRemittances(params);
    expect(result.criteria.error).toBeUndefined();
    expect(dataCalls()[0][0]).toContain("r.date_remise >= $2::date");
    expect(dataCalls()[0][0]).toContain("r.date_remise <= $3::date");
  });
  it.each([
    { debut: "29/02/2025" }, { debut: "31/02/2024" }, { fin: "abc" }, { fin: "29/02/1900" },
    { debut: ["01/01/2025", "02/01/2025"] }, { fin: ["01/01/2025", "01/01/2025"] },
    { debut: "02/01/2025", fin: "01/01/2025" },
    { numero: "%" }, { numero: "_" }, { numero: " " }, { numero: "a".repeat(21) }, { numero: ["R-1", "R-2"] },
    { lignes: "0" }, { lignes: "101" }, { lignes: "abc" }, { lignes: "5.5" }, { lignes: ["5", "5"] }, { lignes: "" },
  ])("refuse %j avant toute lecture de données", async params => {
    const result = await readRemittances(params);
    expect(result.criteria.error).toBeTruthy();
    expect(result.rows).toEqual([]);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("distingue l'ordre des bornes du format des dates", () => expect(parseRemittanceCriteria({ debut: "02/01/2025", fin: "01/01/2025" }).error).toBe("La date de début doit précéder la date de fin."));
  it.each(["R", "202511", "r-100000001-202511-1", "A".repeat(20)])("accepte le fragment %s et utilise ILIKE lié", async numero => {
    await readRemittances({});
    const referenceSql = dataCalls().map(([sql]) => sql);
    mocks.query.mockClear();
    await readRemittances({ numero });
    for (const [index, [sql, params]] of dataCalls().entries()) {
      expect(sql).toContain("ILIKE '%' || $4 || '%'");
      expect(params[3]).toBe(numero);
      expect(sql).toBe(referenceSql[index]);
    }
  });
  it("refuse un fragment vide isolé mais traite le champ facultatif vide comme absent", () => {
    expect(isRemittanceNumber("")).toBe(false);
    expect(parseRemittanceCriteria({ numero: "" }).error).toBeUndefined();
  });
  it.each([1, 100])("lie une taille de page de %s", async size => {
    await readRemittances({ lignes: String(size) });
    expect(dataCalls()[1][1].slice(-2)).toEqual([size, 0]);
  });
  it.each(["0", "-3", "abc", ["2", "3"]].map(page => [page]))("ramène ou ignore la page %j", async page => expect((await readRemittances({ page })).page).toBe(1));
  it("ramène la page excessive à la dernière et lie LIMIT/OFFSET", async () => {
    const result = await readRemittances({ page: "999", lignes: "5", debut: "01/11/2025", fin: "30/11/2025", numero: "202511" });
    expect(result.page).toBe(5);
    expect(result.pageCount).toBe(5);
    expect(dataCalls()[1][1]).toEqual([CLIENT.siren, "2025-11-01", "2025-11-30", "202511", 5, 20]);
    expect(dataCalls()[1][0]).toContain("ORDER BY r.date_remise DESC, r.numero_remise ASC LIMIT $5 OFFSET $6");
    for (const [sql] of dataCalls()) for (const value of [CLIENT.siren, "2025-11-01", "2025-11-30", "202511", "999"]) expect(sql).not.toContain(value);
  });
  it.each(["100000002", ["100000002", "100000003"], "invalide"].map(siren => [siren]))("ignore le SIREN du commerçant %j", async siren => {
    const result = await readRemittances({ siren });
    expect(result.siren).toBe(CLIENT.siren);
    expect(dataCalls().every(([, params]) => params[0] === CLIENT.siren)).toBe(true);
  });
  it("réserve le périmètre global et le filtre d'entreprise au PO", async () => {
    const po = { ...CLIENT, profile: "po", siren: null };
    mocks.readSession.mockResolvedValue(po);
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...po, est_actif: true }] : sql.includes("FROM entreprises") ? [{ numero_siren: "100000002" }] : sql.includes("COUNT(*)") ? [{ count: "0", total: "0" }] : []);
    expect((await readRemittances({})).siren).toBeUndefined();
    expect((await readRemittances({ siren: "100000002" })).siren).toBe("100000002");
    expect((await readRemittances({ siren: "incorrect" })).siren).toBeUndefined();
  });
  it("convertit le solde signé exact renvoyé en texte par SQL", async () => {
    const result = await readRemittances({});
    expect(result.totalCents).toBe(-18223);
    expect(result.count).toBe(23);
    expect(dataCalls()[0][0]).toContain("SUM(CASE WHEN r.sens = '-' THEN -r.montant_total ELSE r.montant_total END)");
    expect(signedRemittanceCents("0.10", "+") + signedRemittanceCents("0.20", "+") + signedRemittanceCents("0.30", "-")).toBe(0);
    expect(Object.is(signedRemittanceCents("0.00", "-"), -0)).toBe(false);
  });
  it("garde une première page vide et un solde nul sans résultat", async () => {
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...CLIENT, est_actif: true }] : sql.includes("COUNT(*)") ? [{ count: "0", total: "0" }] : []);
    const result = await readRemittances({ page: "999" });
    expect([result.count, result.totalCents, result.page, result.pageCount]).toEqual([0, 0, 1, 1]);
  });
  it.each(["2", "999", ["1", "1"], "abc"].map(remise => [remise]))("ne lit aucun détail hors page, hors périmètre ou répété (%j)", async remise => {
    expect((await readRemittances({ remise })).openedId).toBeUndefined();
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("FROM transactions"))).toBe(false);
  });
  it("lit le détail seulement après la page autorisée, en liant aussi le SIREN", async () => {
    expect((await readRemittances({ remise: "1" })).openedId).toBe(1);
    const call = dataCalls()[2];
    expect(call[1]).toEqual([1, CLIENT.siren]);
    expect(call[0]).toContain("r.numero_siren = $2");
    expect(call[0]).toContain("ORDER BY t.date_vente ASC, t.numero_autorisation ASC");
  });
  it("conserve les critères dans les liens mais retire le détail par défaut", async () => {
    const result = await readRemittances({ debut: "01/11/2025", fin: "30/11/2025", numero: "202511", lignes: "5", page: "2", remise: "1" });
    expect(Object.fromEntries(new URLSearchParams(remittanceQuery(result, 3, 1)))).toEqual({ siren: CLIENT.siren, debut: "01/11/2025", fin: "30/11/2025", numero: "202511", lignes: "5", page: "3", remise: "1" });
    expect(new URLSearchParams(remittanceQuery(result)).has("remise")).toBe(false);
  });
  it("masque les erreurs du pilote", async () => {
    mocks.query.mockImplementation(async (sql: string) => { if (sql.includes("FROM utilisateurs")) return [{ ...CLIENT, est_actif: true }]; throw new Error("Détail interne"); });
    await expect(readRemittances({})).rejects.toThrow("Lecture des remises indisponible.");
  });
});
