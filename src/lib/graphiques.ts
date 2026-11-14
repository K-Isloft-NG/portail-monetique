import { getTreasuryScope } from "@/lib/access";
import { query } from "@/lib/db";
import { UNPAID_FROM_SQL } from "@/lib/impayes";
import { parseRemittanceDateRange } from "@/lib/remises";
import { amountToCents, formatTreasuryDate, type TreasuryParams } from "@/lib/tresorerie";

type PeriodMode = "plage" | "4m" | "12m";
export type ChartType = "histogramme" | "courbe";
type Granularity = "day" | "month";
type ChartsProfile = "client" | "po";

export type ChartCriteria = {
  mode: PeriodMode;
  type: ChartType;
  startText: string;
  endText: string;
  startIso: string;
  endIso: string;
  granularity: Granularity;
  error?: string;
};
export type EvolutionPoint = { key: string; label: string; count: number; totalCents: number };
export type MotifShare = { code: string; label: string; count: number; totalCents: number };
export type ChartsResult = {
  criteria: ChartCriteria;
  evolution: EvolutionPoint[];
  motifs: MotifShare[];
  totalCents: number;
  companyCount: number;
  extractedAt: Date;
};

const DAY_MS = 86_400_000;
const GROUP_DATE = { day: "r.date_remise", month: "date_trunc('month', r.date_remise::timestamp)::date" };
export const EMPTY_CHARTS = "Aucun impayé pour cette période.";
const parisDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

export function chartDay(now: Date) {
  return parisDate.format(now);
}

function moveMonth(iso: string, offset: number) {
  const [year, month] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
}

export function parseChartCriteria(params: TreasuryParams, profile: ChartsProfile, now = new Date()): ChartCriteria {
  const mode = params.mode === "plage" || params.mode === "4m" ? params.mode : "12m";
  const type = params.type === "courbe" ? "courbe" : "histogramme";
  const range = parseRemittanceDateRange(params);
  const endIso = chartDay(now);
  const criteria: ChartCriteria = {
    mode, type, startText: range.startText, endText: range.endText,
    startIso: moveMonth(endIso, mode === "4m" ? -3 : -11), endIso, granularity: "month",
  };
  if (params.mode !== undefined && params.mode !== mode || profile === "po" && mode === "plage") {
    return { ...criteria, error: "Choisissez un mode de période valide." };
  }
  if (params.type !== undefined && params.type !== type) {
    return { ...criteria, error: "Choisissez un type de graphique valide." };
  }
  if (mode !== "plage") return criteria;
  if (range.error) return { ...criteria, error: range.error };
  if (!range.startIso || !range.endIso) return { ...criteria, error: "Renseignez la date de début et la date de fin." };

  // Le premier et le dernier mois partiels comptent chacun dans les 36 mois affichables.
  if (range.endIso >= moveMonth(range.startIso, 36)) {
    return { ...criteria, error: "Choisissez une période de 36 mois au plus." };
  }
  const days = (Date.parse(range.endIso) - Date.parse(range.startIso)) / DAY_MS + 1;
  return { ...criteria, startIso: range.startIso, endIso: range.endIso, granularity: days <= 62 ? "day" : "month" };
}

export function chartPeriod(criteria: ChartCriteria) {
  return `Du ${formatTreasuryDate(criteria.startIso)} au ${formatTreasuryDate(criteria.endIso)}`;
}

export function fillEvolution(criteria: ChartCriteria, rows: { bucket: string; count: string; total: string }[]) {
  const byDate = new Map(rows.map(row => [row.bucket, row]));
  const points: EvolutionPoint[] = [];
  const monthly = criteria.granularity === "month";
  // Manipuler les dates civiles en UTC évite les sauts d'heure lors du remplissage des zéros.
  for (let key = monthly ? moveMonth(criteria.startIso, 0) : criteria.startIso; key <= criteria.endIso; ) {
    const row = byDate.get(key);
    const label = monthly ? `${key.slice(5, 7)}/${key.slice(0, 4)}` : `${key.slice(8, 10)}/${key.slice(5, 7)}`;
    points.push({ key, label, count: row ? Number(row.count) : 0, totalCents: row ? amountToCents(row.total) : 0 });
    key = monthly ? moveMonth(key, 1) : new Date(Date.parse(key) + DAY_MS).toISOString().slice(0, 10);
  }
  return points;
}

export async function readCharts(params: TreasuryParams, profile: ChartsProfile, now = new Date()): Promise<ChartsResult> {
  const criteria = parseChartCriteria(params, profile, now);
  const empty = { criteria, evolution: [], motifs: [], totalCents: 0, companyCount: 0, extractedAt: now };
  if (criteria.error) return empty;
  // La vue des graphiques n'a aucun filtre d'entreprise dans l'adresse.
  const { session, siren } = await getTreasuryScope();
  const filters = [siren ?? null, criteria.startIso, criteria.endIso, null];
  const bucket = GROUP_DATE[criteria.granularity];
  try {
    // Le groupement conserve les bornes des impayés, même pour un mois partiel.
    const [points, groups, companies] = await Promise.all([
      session.profile === "client" ? query(
        `SELECT (${bucket})::text AS bucket, COUNT(*)::text AS count, SUM(-t.montant)::text AS total
         ${UNPAID_FROM_SQL} GROUP BY ${bucket}`, filters,
      ) : [],
      // Les cumuls restent en NUMERIC et le code départage les motifs de même montant.
      query(`SELECT m.code, m.libelle AS label, COUNT(*)::text AS count, SUM(-t.montant)::text AS total
             ${UNPAID_FROM_SQL} GROUP BY m.code, m.libelle HAVING SUM(t.montant) > 0
             ORDER BY SUM(t.montant) DESC, m.code ASC`, filters),
      // Le nombre d'entreprises couvre tous les motifs de la période, même un impayé à zéro.
      session.profile === "po" ? query(`SELECT COUNT(DISTINCT r.numero_siren)::text AS count ${UNPAID_FROM_SQL}`, filters) : [],
    ]);
    const motifs = (groups as { code: string; label: string; count: string; total: string }[])
      .map(row => ({ code: row.code, label: row.label, count: Number(row.count), totalCents: amountToCents(row.total) }));
    return {
      ...empty, motifs, totalCents: motifs.reduce((total, row) => total + row.totalCents, 0),
      evolution: session.profile === "client" ? fillEvolution(criteria, points as { bucket: string; count: string; total: string }[]) : [],
      companyCount: Number(companies[0]?.count ?? 0),
    };
  } catch {
    throw new Error("Lecture des graphiques d'impayés indisponible.");
  }
}
