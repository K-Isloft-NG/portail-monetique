import { beforeEach, describe, expect, it, vi } from "vitest";
import { amountToCents, decimalFromCents, parseTreasuryDate, parseTreasurySort, readTreasury, treasuryQuery, treasuryTotal, type TreasuryRow } from "@/lib/tresorerie";
import { getTreasuryScope } from "@/lib/access";
import type { VerifiedSession } from "@/lib/session";

const mocks = vi.hoisted(() => ({ query: vi.fn(), readSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/session", async (original) => ({ ...await original<typeof import("@/lib/session")>(), readSession: mocks.readSession }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
const CLIENT: VerifiedSession = { sessionId: "12345678-1234-4123-8123-123456789abc", id: 1, login: "compte-test", profile: "client", siren: "100000001" };
const ROW: TreasuryRow = { id: 1, numero_siren: CLIENT.siren, raison_sociale: "Entreprise fictive", date_valeur: "2025-11-12", nb_transactions: 2, montant_total: "-182.23", devise: "EUR" };

describe("trésorerie", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.readSession.mockResolvedValue(CLIENT);
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...CLIENT, est_actif: true }] : sql.includes("FROM entreprises") ? [{ numero_siren: "100000002" }] : [ROW]);
  });
  it.each(["29/02/2024", "28/02/1900", "31/12/2100", "01/01/1900"])("accepte la date %s", (text) => {
    expect(parseTreasuryDate(text).error).toBeUndefined();
    expect(parseTreasuryDate(text).iso).toBe(text.split("/").reverse().join("-"));
  });
  it.each(["29/02/2025", "29/02/1900", "31/02/2024", "31/04/2026", "00/12/2026", "01/13/2026", "1/01/2026", "2026-01-01", "01/01/1899", "01/01/2101", " 01/01/2026", "abc"])("refuse la date %s sans SQL", async (date) => {
    expect(parseTreasuryDate(date).error).toBeTruthy();
    expect((await readTreasury({ date })).error).toBeTruthy();
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each([undefined, "", ["12/11/2025", "13/11/2025"]].map(value => [value]))("ignore une date absente ou répétée", (date) => expect(parseTreasuryDate(date)).toEqual({ text: "", iso: undefined }));
  it.each([{}, { sort: "montant; SELECT 99", order: "asc" }, { sort: "montant", order: ["asc", "desc"] }, { sort: ["siren", "date"], order: "asc" }, { sort: "__proto__", order: "desc" }, { sort: "date", order: "inconnu" }])("revient au tri par défaut pour %j", (params) => expect(parseTreasurySort(params)).toEqual({ key: "date", order: "desc" }));
  it("accepte les six tris autorisés", () => {
    for (const sort of ["date", "siren", "montant"]) for (const order of ["asc", "desc"]) expect(parseTreasurySort({ sort, order })).toEqual({ key: sort, order });
  });
  it.each(["100000002", ["100000002", "100000003"], "invalide"].map(value => [value]))("ignore le SIREN fourni par un commerçant (%j)", async (siren) => {
    expect((await getTreasuryScope(siren)).siren).toBe(CLIENT.siren);
    await readTreasury({ siren, date: "12/11/2025", sort: "montant", order: "asc" });
    const call = mocks.query.mock.calls.find(([sql]) => sql.includes("FROM annonces_tresorerie"));
    expect(call?.[1]).toEqual([CLIENT.siren, "2025-11-12"]);
    expect(call?.[0]).toContain("ORDER BY a.montant_total ASC");
    expect(call?.[0]).not.toContain("100000002");
    expect(call?.[0]).not.toContain("2025-11-12");
  });
  it("réserve le tri SIREN au PO", async () => expect((await readTreasury({ sort: "siren", order: "asc" })).sort).toEqual({ key: "date", order: "desc" }));
  it("laisse le PO consulter tous les comptes ou une entreprise existante", async () => {
    const po = { ...CLIENT, profile: "po", siren: null };
    mocks.readSession.mockResolvedValue(po);
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...po, est_actif: true }] : sql.includes("FROM entreprises") ? [{ numero_siren: "100000002" }] : [ROW]);
    expect((await readTreasury({})).siren).toBeUndefined();
    expect((await readTreasury({ siren: "100000002", sort: "siren", order: "desc" })).siren).toBe("100000002");
    expect(mocks.query.mock.calls.find(([sql, params]) => sql.includes("FROM annonces_tresorerie") && params[0] === null)).toBeTruthy();
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...po, est_actif: true }] : []);
    expect((await readTreasury({ siren: "999999999" })).siren).toBeUndefined();
  });
  it.each(["0", "0.00", "-0.00", "0.1", "-182.23", "99999.99"])("convertit exactement %s en centimes", (value) => expect(amountToCents(decimalFromCents(amountToCents(value)))).toBe(amountToCents(value)));
  it("additionne les centimes, y compris les négatifs et le tableau vide", () => {
    expect(amountToCents("-182.23")).toBe(-18223);
    expect(treasuryTotal(["0.10", "0.20", "-0.30"].map(montant_total => ({ ...ROW, montant_total })))).toBe(0);
    expect(treasuryTotal([])).toBe(0);
    expect(treasuryTotal([ROW])).toBe(-18223);
  });
  it.each(["abc", "1,25", "1.001", "1e4", "9007199254740992"])("refuse le montant %s au lieu d'inventer un zéro", (value) => expect(() => amountToCents(value)).toThrow());
  it("masque les erreurs de lecture", async () => {
    mocks.query.mockImplementation(async (sql: string) => { if (sql.includes("FROM utilisateurs")) return [{ ...CLIENT, est_actif: true }]; throw new Error("Détail interne"); });
    await expect(readTreasury({})).rejects.toThrow("Lecture de la trésorerie indisponible.");
  });
  it("conserve le filtre et le tri dans une URL canonique", async () => {
    const result = await readTreasury({ date: "12/11/2025", siren: "100000002", sort: "montant", order: "desc" });
    const params = new URLSearchParams(treasuryQuery(result));
    expect(Object.fromEntries(params)).toEqual({ date: "12/11/2025", siren: CLIENT.siren, sort: "montant", order: "desc" });
  });
});
