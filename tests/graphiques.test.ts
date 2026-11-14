import { beforeEach, describe, expect, it, vi } from "vitest";
import { fillEvolution, parseChartCriteria, readCharts } from "@/lib/graphiques";
import { readUnpaid, UNPAID_FROM_SQL } from "@/lib/impayes";

const mocks = vi.hoisted(() => ({ query: vi.fn(), readSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/session", async original => ({ ...await original<typeof import("@/lib/session")>(), readSession: mocks.readSession }));

const NOW = new Date("2026-01-31T23:30:00Z");
const CLIENT = { sessionId: "12345678-1234-4123-8123-123456789abc", id: 1, login: "compte-test", profile: "client", siren: "100000001" };
const november = { mode: "plage", debut: "01/11/2025", fin: "30/11/2025" };

describe("périodes des graphiques d'impayés", () => {
  it.each([["4m", "2025-11-01", 4], ["12m", "2025-03-01", 12]])("compte le mois courant dans la fenêtre %s", (mode, startIso, length) => {
    const criteria = parseChartCriteria({ mode }, "client", NOW);
    expect(criteria).toMatchObject({ startIso, endIso: "2026-02-01", granularity: "month" });
    const points = fillEvolution(criteria, []);
    expect(points).toHaveLength(length);
    expect(points.at(-1)).toMatchObject({ label: "02/2026", totalCents: 0 });
  });

  it.each([
    ["12/11/2025", "12/11/2025", "day", 1],
    ["01/01/2026", "03/03/2026", "day", 62],
    ["01/01/2026", "04/03/2026", "month", 3],
    ["30/01/2024", "01/12/2026", "month", 36],
  ])("inclut les deux bornes du %s au %s", (debut, fin, granularity, length) => {
    const criteria = parseChartCriteria({ mode: "plage", debut, fin }, "client", NOW);
    expect(criteria).toMatchObject({ granularity });
    expect(criteria.error).toBeUndefined();
    expect(fillEvolution(criteria, [])).toHaveLength(length);
  });

  it.each([
    [{ mode: "plage", debut: "01/01/2024", fin: "01/01/2027" }, "36 mois au plus"],
    [{ mode: "plage", debut: "01/11/2025" }, "Renseignez la date de début et la date de fin"],
    [{ ...november, fin: "01/10/2025" }, "doit précéder"],
    [{ ...november, fin: "31/11/2025" }, "date valide"],
    [{ mode: "semaine" }, "mode de période valide"],
    [{ mode: ["4m", "12m"] }, "mode de période valide"],
    [{ type: "barres" }, "type de graphique valide"],
  ] as const)("refuse les critères %j", (params, message) => {
    const criteria = parseChartCriteria({ ...params, mode: "mode" in params ? typeof params.mode === "string" ? params.mode : [...params.mode] : undefined }, "client", NOW);
    expect(criteria.error).toContain(message);
  });

  it("laisse uniquement les fenêtres glissantes au Product Owner", () => {
    expect(parseChartCriteria({}, "po", NOW).mode).toBe("12m");
    expect(parseChartCriteria({ mode: "4m" }, "po", NOW).error).toBeUndefined();
    expect(parseChartCriteria(november, "po", NOW).error).toContain("mode de période valide");
  });

  it("insère les jours sans impayé entre les bornes", () => {
    const criteria = parseChartCriteria(november, "client", NOW);
    const points = fillEvolution(criteria, [{ bucket: "2025-11-12", count: "1", total: "-182.23" }]);
    expect(points).toHaveLength(30);
    expect(points[11]).toEqual({ key: "2025-11-12", label: "12/11", count: 1, totalCents: -18223 });
    expect(points.filter(point => point.totalCents === 0)).toHaveLength(29);
  });
});

describe("lecture des graphiques d'impayés", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.readSession.mockResolvedValue(CLIENT);
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM utilisateurs")) return [{ ...CLIENT, est_actif: true }];
      if (sql.includes("GROUP BY m.code")) return [{ code: "01", label: "Opposition", count: "1", total: "-182.23" }];
      if (sql.includes("AS bucket")) return [{ bucket: "2025-11-12", count: "1", total: "-182.23" }];
      if (sql.includes("AS total")) return [{ count: "1", total: "-182.23" }];
      return [];
    });
  });

  it("réutilise la clause inclusive des impayés avec le SIREN de la session", async () => {
    const charts = await readCharts({ ...november, siren: "100000002" }, "client", NOW);
    const unpaid = await readUnpaid(november);
    const selects = mocks.query.mock.calls.filter(([sql]) => sql.includes("FROM transactions"));
    expect(selects).toHaveLength(4);
    for (const [sql, params] of selects) {
      expect(sql).toContain(UNPAID_FROM_SQL);
      expect(params).toEqual([CLIENT.siren, "2025-11-01", "2025-11-30", null]);
    }
    expect(charts.motifs).toEqual([{ code: "01", label: "Opposition", count: 1, totalCents: -18223 }]);
    expect(charts.totalCents).toEqual(unpaid.totalCents);
    expect(charts.evolution.reduce((sum, point) => sum + point.totalCents, 0)).toEqual(unpaid.totalCents);
    expect(selects.find(([sql]) => sql.includes("GROUP BY m.code"))?.[0]).toContain("ORDER BY SUM(t.montant) DESC, m.code ASC");
  });

  it("lit les motifs et compte les entreprises du Product Owner sans filtre de SIREN", async () => {
    const po = { ...CLIENT, profile: "po", siren: null };
    mocks.readSession.mockResolvedValue(po);
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...po, est_actif: true }]
      : sql.includes("COUNT(DISTINCT") ? [{ count: "3" }] : []);
    const charts = await readCharts({ siren: CLIENT.siren }, "po", NOW);
    expect(charts.companyCount).toBe(3);
    expect(charts.evolution).toEqual([]);
    const selects = mocks.query.mock.calls.filter(([sql]) => sql.includes("FROM transactions"));
    expect(selects).toHaveLength(2);
    for (const [sql, params] of selects) {
      expect(sql).toContain(UNPAID_FROM_SQL);
      expect(params).toEqual([null, "2025-03-01", "2026-02-01", null]);
    }
    expect(mocks.query.mock.calls.every(([sql]) => !sql.includes("WHERE numero_siren = $1"))).toBe(true);
  });

  it("ne lit aucune donnée quand les critères sont invalides", async () => {
    expect((await readCharts({ mode: "plage" }, "client", NOW)).criteria.error).toBeTruthy();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.readSession).not.toHaveBeenCalled();
  });
});
