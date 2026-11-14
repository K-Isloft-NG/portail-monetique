import { query } from "@/lib/db";
import { getTreasuryScope } from "@/lib/access";

export type TreasuryParams = Record<string, string | string[] | undefined>;
export type TreasurySort = { key: "date" | "siren" | "montant"; order: "asc" | "desc" };
export type TreasuryRow = {
  id: number; numero_siren: string; raison_sociale: string; date_valeur: string;
  nb_transactions: number; montant_total: string; devise: string;
};
export type TreasuryResult = {
  rows: TreasuryRow[]; totalCents?: number; siren?: string; dateText: string;
  sort: TreasurySort; negativeOnly?: boolean; error?: string;
};

const DEFAULT_SORT: TreasurySort = { key: "date", order: "desc" };
// Seuls ces fragments constants peuvent entrer dans ORDER BY ; aucun texte d'URL.
const SORT_SQL = {
  date: { asc: "a.date_valeur ASC, a.numero_siren ASC", desc: "a.date_valeur DESC, a.numero_siren ASC" },
  siren: { asc: "a.numero_siren ASC, a.date_valeur DESC", desc: "a.numero_siren DESC, a.date_valeur DESC" },
  montant: { asc: "a.montant_total ASC, a.date_valeur DESC, a.numero_siren ASC", desc: "a.montant_total DESC, a.date_valeur DESC, a.numero_siren ASC" },
};

export function parseTreasuryDate(value?: string | string[]) {
  const text = typeof value === "string" ? value : "";
  if (!text) return { text, iso: undefined };
  const match = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4})$/.exec(text);
  if (match) {
    const [, day, month, year] = match;
    const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (Number(year) >= 1900 && Number(year) <= 2100 && d.getUTCFullYear() === Number(year) && d.getUTCMonth() + 1 === Number(month) && d.getUTCDate() === Number(day)) {
      return { text, iso: `${year}-${month}-${day}` };
    }
  }
  return { text, iso: undefined, error: "Saisissez une date valide au format jj/mm/aaaa, entre 1900 et 2100." };
}

export function parseTreasurySort(params: TreasuryParams): TreasurySort {
  if (typeof params.sort !== "string" || !["date", "siren", "montant"].includes(params.sort) || !["asc", "desc"].includes(params.order as string)) return { ...DEFAULT_SORT };
  if (typeof params.order !== "string") return { ...DEFAULT_SORT };
  return { key: params.sort as TreasurySort["key"], order: params.order as TreasurySort["order"] };
}

export function amountToCents(value: string): number {
  const match = /^(-?)([0-9]+)(?:\.([0-9]{1,2}))?$/.exec(value);
  if (!match) throw new Error("Montant de trésorerie invalide.");
  // Convertir séparément les euros entiers et les décimales évite 0,1 + 0,2.
  const cents = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("Montant de trésorerie trop élevé.");
  return match[1] && cents !== 0 ? -cents : cents;
}

export function decimalFromCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error("Solde de trésorerie invalide.");
  const absolute = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

export function treasuryTotal(rows: TreasuryRow[]): number {
  let total = 0;
  for (const row of rows) {
    total += amountToCents(row.montant_total);
    if (!Number.isSafeInteger(total)) throw new Error("Solde de trésorerie trop élevé.");
  }
  return total;
}

export function formatTreasuryDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export async function readTreasury(params: TreasuryParams): Promise<TreasuryResult> {
  const date = parseTreasuryDate(params.date);
  let sort = parseTreasurySort(params);
  // Une date invalide ne doit déclencher aucune lecture de données de trésorerie.
  if (date.error) return { rows: [], dateText: date.text, sort, error: date.error };
  const { session, siren } = await getTreasuryScope(params.siren);
  const negativeOnly = session.profile === "po" && params.negatifs === "1";
  if (session.profile === "client" && sort.key === "siren") sort = { ...DEFAULT_SORT };
  let rows: TreasuryRow[];
  try {
    // Le périmètre vient de la garde serveur ; les valeurs restent paramétrées.
    // Les deux requêtes sont fixes hors tri autorisé et partagent les mêmes paramètres.
    const statement = negativeOnly
      ? `SELECT a.id, a.numero_siren, e.raison_sociale, a.date_valeur::text AS date_valeur,
              a.nb_transactions, a.montant_total::text AS montant_total, a.devise
         FROM annonces_tresorerie a JOIN entreprises e ON e.numero_siren = a.numero_siren
         WHERE ($1::text IS NULL OR a.numero_siren = $1)
           AND ($2::date IS NULL OR a.date_valeur = $2::date)
           AND a.montant_total < 0
         ORDER BY ${SORT_SQL[sort.key][sort.order]}`
      : `SELECT a.id, a.numero_siren, e.raison_sociale, a.date_valeur::text AS date_valeur,
              a.nb_transactions, a.montant_total::text AS montant_total, a.devise
       FROM annonces_tresorerie a JOIN entreprises e ON e.numero_siren = a.numero_siren
       WHERE ($1::text IS NULL OR a.numero_siren = $1)
         AND ($2::date IS NULL OR a.date_valeur = $2::date)
       ORDER BY ${SORT_SQL[sort.key][sort.order]}`;
    rows = await query(statement, [siren ?? null, date.iso ?? null]) as TreasuryRow[];
  } catch {
    throw new Error("Lecture de la trésorerie indisponible.");
  }
  // Le solde cumulé est calculé uniquement pour le commerçant.
  const totalCents = session.profile === "client" ? treasuryTotal(rows) : undefined;
  return { rows, totalCents, siren, dateText: date.text, sort, negativeOnly };
}

export function treasuryQuery(result: TreasuryResult, sort = result.sort): string {
  const params = new URLSearchParams();
  if (result.dateText) params.set("date", result.dateText);
  if (result.siren) params.set("siren", result.siren);
  if (result.negativeOnly) params.set("negatifs", "1");
  params.set("sort", sort.key);
  params.set("order", sort.order);
  return params.toString();
}
