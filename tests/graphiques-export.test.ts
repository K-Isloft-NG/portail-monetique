import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/export/graphiques/route";
import { renderChartsPdf } from "@/lib/export/graphiques-pdf";
import { chartTitles } from "@/lib/export/table";
import { fillEvolution, parseChartCriteria } from "@/lib/graphiques";

const mocks = vi.hoisted(() => ({ query: vi.fn(), readSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/session", async original => ({ ...await original<typeof import("@/lib/session")>(), readSession: mocks.readSession }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));

const NOW = new Date("2026-11-14T12:00:00Z");
const CLIENT = { sessionId: "12345678-1234-4123-8123-123456789abc", id: 1, login: "compte-test", profile: "client", siren: "001234567" };
const COMPANY = { numero_siren: CLIENT.siren, raison_sociale: "Épicerie à côté" };
const MOTIF = { code: "01", label: "Opposition pour perte ou vol de la carte bancaire", count: "1", total: "-182.23" };
const request = (query = "") => new Request(`http://localhost/export/graphiques?${query}`);
const period = "mode=plage&debut=01%2F11%2F2025&fin=30%2F11%2F2025";
const toText = (bytes: ArrayBuffer | Uint8Array<ArrayBuffer>) => Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes).toString("latin1");
const pageCount = (pdf: string) => (pdf.match(/\/Type \/Page\b/g) ?? []).length;

function setup(profile = "client", empty = false) {
  const session = { ...CLIENT, profile, siren: profile === "client" ? CLIENT.siren : null };
  mocks.readSession.mockResolvedValue(session);
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM utilisateurs")) return [{ ...session, est_actif: true }];
    if (sql.includes("FROM entreprises")) return [COMPANY];
    if (empty) return [];
    if (sql.includes("GROUP BY m.code")) return [MOTIF];
    if (sql.includes("AS bucket")) return [{ bucket: "2025-11-12", count: "1", total: "-182.23" }];
    if (sql.includes("COUNT(DISTINCT")) return [{ count: "1" }];
    return [];
  });
}

describe("route d'export des graphiques", () => {
  beforeEach(() => { vi.resetAllMocks(); setup(); });

  it.each(["histogramme", "courbe"])("livre le PDF commerçant en %s et utilise le SIREN autorisé", async type => {
    const response = await GET(request(`${period}&type=${type}&siren=100000002`));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="graphiques_001234567_\d{4}-\d{2}-\d{2}\.pdf"$/);
    const pdf = toText(await response.arrayBuffer());
    expect(pageCount(pdf)).toBe(2);
    const box = pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    expect(Number(box?.[1])).toBeCloseTo(841.89);
    expect(Number(box?.[2])).toBeCloseTo(595.28);
    expect(pdf).toContain(chartTitles(COMPANY).evolution);
    expect(pdf).toContain(chartTitles(COMPANY).motifs);
    expect(pdf).toContain(type === "courbe" ? "· Courbe" : "· Histogramme");
    expect(pdf).toMatch(/EXTRAIT DU \d{2}\/\d{2}\/\d{4}/);
    expect(pdf).toContain("-182,23");
    expect(pdf).toContain("Page 2 sur 2");
    expect(pdf).not.toContain("/Subtype /Image");
    expect(pdf).not.toContain("100000002");
    expect(mocks.query.mock.calls.filter(([sql]) => sql.includes("FROM transactions")).every(([, filters]) => filters[0] === CLIENT.siren)).toBe(true);
  });

  it("livre une seule page globale pour le Product Owner", async () => {
    setup("po");
    const response = await GET(request("mode=4m&siren=100000002"));
    expect(response.headers.get("Content-Disposition")).toMatch(/filename="graphiques_tous_\d{4}-\d{2}-\d{2}\.pdf"/);
    const pdf = toText(await response.arrayBuffer());
    expect(pageCount(pdf)).toBe(1);
    expect(pdf).toContain("RÉPARTITION DES IMPAYÉS PAR MOTIF DE TOUTES LES ENTREPRISES");
    expect(pdf).toContain("1 entreprise concernée");
    expect(pdf).not.toContain("100000002");
  });

  it("livre un PDF avec le message prévu si la période est vide", async () => {
    setup("client", true);
    const pdf = toText(await (await GET(request(period))).arrayBuffer());
    expect(pageCount(pdf)).toBe(2);
    expect(pdf.match(/Aucun impayé pour cette période\./g)).toHaveLength(2);
  });

  it.each(["mode=plage", "mode=semaine", "type=barres", "type=courbe&type=histogramme"])("répond 400 sans lecture métier pour %s", async query => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/Choisissez|Renseignez/);
    expect(mocks.query.mock.calls.every(([sql]) => sql.includes("FROM utilisateurs"))).toBe(true);
  });

  it("refuse la plage libre du Product Owner sans lecture métier", async () => {
    setup("po");
    const response = await GET(request(period));
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Choisissez un mode de période valide.");
    expect(mocks.query.mock.calls.every(([sql]) => sql.includes("FROM utilisateurs"))).toBe(true);
  });

  it("redirige l'administrateur avant la lecture métier", async () => {
    setup("admin");
    await expect(GET(request())).rejects.toThrow("REDIRECT:/admin");
    expect(mocks.query.mock.calls.every(([sql]) => sql.includes("FROM utilisateurs"))).toBe(true);
  });

  it("redirige le visiteur sans lecture", async () => {
    mocks.readSession.mockResolvedValue(null);
    await expect(GET(request())).rejects.toThrow("REDIRECT:/login");
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

it("place les 62 valeurs journalières sur la seule page d'évolution", () => {
  const criteria = parseChartCriteria({ mode: "plage", debut: "01/01/2026", fin: "03/03/2026" }, "client", NOW);
  const evolution = fillEvolution(criteria, [{ bucket: "2026-01-01", count: "1", total: "-182.23" }]);
  const motifs = [{ ...MOTIF, count: 1, totalCents: -18223 }];
  const result = { criteria, evolution, motifs, totalCents: -18223, companyCount: 0, extractedAt: NOW };
  const pdf = toText(renderChartsPdf(result, COMPANY));
  expect(pageCount(pdf)).toBe(2);
  expect(pdf).toContain("03/03");
  expect(pdf).toContain("EXTRAIT DU 14/11/2026");
  expect(pdf.match(/\(0,00\)/g)).toHaveLength(61);
});
