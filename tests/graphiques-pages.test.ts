import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ClientChartsPage from "@/app/client/graphiques/page";
import PoChartsPage from "@/app/po/graphiques/page";

const mocks = vi.hoisted(() => ({ query: vi.fn(), readSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/session", async original => ({ ...await original<typeof import("@/lib/session")>(), readSession: mocks.readSession }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/components/LogoutButton", () => ({ default: () => null }));

const CLIENT = { sessionId: "12345678-1234-4123-8123-123456789abc", id: 1, login: "compte-test", profile: "client", siren: "100000001" };
const COMPANY = { numero_siren: CLIENT.siren, raison_sociale: "Boulangerie fictive" };
const period = { mode: "plage", debut: "01/11/2025", fin: "30/11/2025" };
const clientPage = (params = {}) => ClientChartsPage({ searchParams: Promise.resolve(params) });
const poPage = (params = {}) => PoChartsPage({ searchParams: Promise.resolve(params) });

describe("graphiques du commerçant", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.readSession.mockResolvedValue(CLIENT);
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM utilisateurs")) return [{ ...CLIENT, est_actif: true }];
      if (sql.includes("FROM entreprises")) return [COMPANY];
      if (sql.includes("GROUP BY m.code")) return [{ code: "01", label: "Opposition pour perte ou vol de la carte bancaire", count: "1", total: "-182.23" }];
      if (sql.includes("AS bucket")) return [{ bucket: "2025-11-12", count: "1", total: "-182.23" }];
      return [];
    });
  });

  it("affiche l'histogramme, le disque entier et leurs équivalents textuels", async () => {
    const html = renderToStaticMarkup(await clientPage(period));
    expect(html).toContain('aria-current="page" href="/client/graphiques"');
    expect(html).toContain('tabular-nums">SIREN 100');
    expect(html.match(/<rect\b/g)).toHaveLength(30);
    expect(html).toContain('<circle cx="120" cy="120" r="108" class="charts-tone-01"');
    expect(html).toContain("Opposition pour perte ou vol de la carte bancaire");
    expect(html).toContain("100,0 %");
    expect(html).toContain("−182,23");
    expect(html.match(/Afficher les valeurs/g)).toHaveLength(2);
    expect(html).toContain('role="img"');
    expect(html).toContain("<title>Évolution des impayés en histogramme</title>");
  });

  it("conserve la courbe et les critères dans le formulaire d'export", async () => {
    const html = renderToStaticMarkup(await clientPage({ ...period, type: "courbe", siren: "100000002" }));
    expect(html).toContain('<polyline class="charts-line"');
    expect(html).not.toContain("<rect");
    expect(html).toContain("Imprimer");
    expect(html).toContain('action="/export/graphiques"');
    expect(html).toContain('name="type" value="courbe"');
    expect(html).toContain('name="debut" value="01/11/2025"');
    expect(html).not.toContain("100000002");
  });

  it("affiche une erreur de période sans lecture d'impayés ni graphique", async () => {
    const html = renderToStaticMarkup(await clientPage({ mode: "plage" }));
    expect(html).toContain("Renseignez la date de début et la date de fin.");
    expect(html).not.toContain('role="img"');
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("FROM transactions"))).toBe(false);
  });

  it("affiche l'état vide et laisse le téléchargement disponible", async () => {
    mocks.query.mockImplementation(async (sql: string) => sql.includes("FROM utilisateurs") ? [{ ...CLIENT, est_actif: true }]
      : sql.includes("FROM entreprises") ? [COMPANY] : []);
    const html = renderToStaticMarkup(await clientPage(period));
    expect(html).toContain("Aucun impayé pour cette période.");
    expect(html).toContain("Exporter en PDF");
    expect(html).not.toContain('role="img"');
  });
});

describe("graphiques du Product Owner", () => {
  const PO = { ...CLIENT, profile: "po", siren: null };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.readSession.mockResolvedValue(PO);
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM utilisateurs")) return [{ ...PO, est_actif: true }];
      if (sql.includes("GROUP BY m.code")) return [{ code: "01", label: "Opposition", count: "2", total: "-241.23" }];
      if (sql.includes("COUNT(DISTINCT")) return [{ count: "2" }];
      return [];
    });
  });

  it("affiche seulement la répartition globale, même si l'adresse fournit un SIREN", async () => {
    const html = renderToStaticMarkup(await poPage({ mode: "4m", siren: "100000002" }));
    expect(html).toContain('aria-current="page" href="/po/graphiques"');
    expect(html).toContain("Toutes les entreprises");
    expect(html).toContain("2 entreprises concernées");
    expect(html).toContain("Répartition des impayés par motif");
    expect(html).toContain("−241,23");
    expect(html).not.toContain("100000002");
    expect(html).not.toContain("Évolution des impayés");
    expect(html).not.toContain("Plage de dates");
    expect(html).not.toContain('name="type"');
  });

  it("refuse la plage libre sans lecture métier", async () => {
    expect(renderToStaticMarkup(await poPage(period))).toContain("Choisissez un mode de période valide.");
    expect(mocks.query.mock.calls.every(([sql]) => sql.includes("FROM utilisateurs"))).toBe(true);
  });

  it.each(["admin", "client"])("redirige le profil %s avant la lecture des impayés", async profile => {
    const session = { ...CLIENT, profile, siren: profile === "client" ? CLIENT.siren : null };
    mocks.readSession.mockResolvedValue(session);
    mocks.query.mockResolvedValue([{ ...session, est_actif: true }]);
    await expect(poPage()).rejects.toThrow(`REDIRECT:/${profile}`);
    expect(mocks.query.mock.calls.every(([sql]) => sql.includes("FROM utilisateurs"))).toBe(true);
  });

  it("redirige le visiteur des deux pages vers la connexion", async () => {
    mocks.readSession.mockResolvedValue(null);
    await expect(poPage()).rejects.toThrow("REDIRECT:/login");
    await expect(clientPage()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
