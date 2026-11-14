import { query } from "@/lib/db";
import { getRemittanceScope } from "@/lib/access";
import { amountToCents, parseTreasuryDate, type TreasuryParams } from "@/lib/tresorerie";

export type RemittanceCriteria = {
  startText: string; endText: string; startIso?: string; endIso?: string;
  numberText: string; pageSize: number; page: number; openedId?: number; error?: string;
};
export type RemittanceRow = {
  id: number; numero_siren: string; raison_sociale: string; numero_remise: string;
  date_remise: string; nb_transactions: number; montant_total: string; sens: "+" | "-"; devise: string;
};
export type RemittanceDetail = {
  id: number; numero_siren: string; date_vente: string; numero_carte: string;
  reseau: string; numero_autorisation: string; devise: string; montant: string; sens: "+" | "-";
};
export type RemittanceResult = {
  criteria: RemittanceCriteria; rows: RemittanceRow[]; count: number; totalCents: number;
  page: number; pageCount: number; siren?: string; openedId?: number; details: RemittanceDetail[];
};

const DATE_ERROR = "Saisissez une date valide au format jj/mm/aaaa, entre 1900 et 2100.";
const NUMBER_ERROR = "Saisissez un numéro de remise de 20 caractères au plus (lettres, chiffres et tirets).";
const SIZE_ERROR = "Saisissez un nombre de lignes par page entre 1 et 100.";

export function isRemittanceNumber(value: string) {
  return /^[a-zA-Z0-9-]{1,20}$/.test(value);
}

function positiveId(value?: string | string[]) {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export function parseRemittanceDateRange(params: TreasuryParams) {
  const start = parseTreasuryDate(params.debut);
  const end = parseTreasuryDate(params.fin);
  let error: string | undefined;
  if (Array.isArray(params.debut) || Array.isArray(params.fin) || start.error || end.error) error = DATE_ERROR;
  else if (start.iso && end.iso && start.iso > end.iso) error = "La date de début doit précéder la date de fin.";
  return { startText: start.text, endText: end.text, startIso: start.iso, endIso: end.iso, error };
}

export function parseRemittanceCriteria(params: TreasuryParams): RemittanceCriteria {
  const range = parseRemittanceDateRange(params);
  const numberText = typeof params.numero === "string" ? params.numero : "";
  const size = params.lignes === undefined ? 10 : typeof params.lignes === "string" && /^[0-9]+$/.test(params.lignes) ? Number(params.lignes) : 0;
  let error = range.error;
  // Un champ facultatif vide est sans filtre ; un fragment présent exclut les jokers SQL.
  if (!error && (Array.isArray(params.numero) || (numberText !== "" && !isRemittanceNumber(numberText)))) error = NUMBER_ERROR;
  else if (!error && (!Number.isInteger(size) || size < 1 || size > 100)) error = SIZE_ERROR;
  return {
    ...range,
    numberText, pageSize: size >= 1 && size <= 100 ? size : 10,
    // La page sera bornée après le comptage, même si le nombre saisi est très grand.
    page: typeof params.page === "string" && /^[0-9]+$/.test(params.page) ? Math.max(1, Number(params.page)) : 1,
    openedId: positiveId(params.remise), error,
  };
}

export function signedRemittanceCents(amount: string, direction: "+" | "-") {
  const cents = amountToCents(amount);
  return direction === "-" && cents !== 0 ? -cents : cents;
}

export async function readRemittances(params: TreasuryParams, allPages = false): Promise<RemittanceResult> {
  const criteria = parseRemittanceCriteria(params);
  const empty: RemittanceResult = { criteria, rows: [], count: 0, totalCents: 0, page: 1, pageCount: 1, details: [] };
  // La validation précède toute lecture des remises, même le décompte.
  if (criteria.error) return empty;
  const { siren } = await getRemittanceScope(params.siren);
  const filters = [siren ?? null, criteria.startIso ?? null, criteria.endIso ?? null, criteria.numberText || null];
  try {
    // SUM reste en NUMERIC dans PostgreSQL ; seule sa représentation décimale sort en texte.
    const totals = await query(
      `SELECT COUNT(*)::text AS count,
              COALESCE(SUM(CASE WHEN r.sens = '-' THEN -r.montant_total ELSE r.montant_total END), 0)::text AS total
       FROM remises r
       WHERE ($1::text IS NULL OR r.numero_siren = $1)
         AND ($2::date IS NULL OR r.date_remise >= $2::date)
         AND ($3::date IS NULL OR r.date_remise <= $3::date)
         AND ($4::text IS NULL OR r.numero_remise ILIKE '%' || $4 || '%')`, filters,
    );
    const count = Number(totals[0].count);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Nombre de remises invalide.");
    const totalCents = amountToCents(totals[0].total as string);
    const pageCount = Math.max(1, Math.ceil(count / criteria.pageSize));
    const page = Math.min(criteria.page, pageCount);
    // Le serveur borne la page avant de lier LIMIT et OFFSET ; aucune pagination en mémoire.
    const rows = await query(
      `SELECT r.id, r.numero_siren, e.raison_sociale, r.numero_remise, r.date_remise::text AS date_remise,
              r.nb_transactions, r.montant_total::text AS montant_total, r.sens, r.devise
       FROM remises r JOIN entreprises e ON e.numero_siren = r.numero_siren
       WHERE ($1::text IS NULL OR r.numero_siren = $1)
         AND ($2::date IS NULL OR r.date_remise >= $2::date)
         AND ($3::date IS NULL OR r.date_remise <= $3::date)
         AND ($4::text IS NULL OR r.numero_remise ILIKE '%' || $4 || '%')
       ORDER BY r.date_remise DESC, r.numero_remise ASC LIMIT $5 OFFSET $6`,
      // Une ligne de plus que le plafond suffit à refuser un export trop volumineux.
      [...filters, allPages ? Math.min(count, 10_001) : criteria.pageSize, allPages ? 0 : (page - 1) * criteria.pageSize],
    ) as RemittanceRow[];
    const openedId = rows.find(row => row.id === criteria.openedId)?.id;
    let details: RemittanceDetail[] = [];
    if (openedId !== undefined) {
      // L'appartenance à la page autorisée est vérifiée avant la lecture du détail.
      // Le SIREN est aussi lié dans cette requête pour maintenir le cloisonnement.
      details = await readRemittanceTransactions(openedId, siren);
    }
    return { criteria, rows, count, totalCents, page, pageCount, siren, openedId, details };
  } catch {
    throw new Error("Lecture des remises indisponible.");
  }
}

async function readRemittanceTransactions(id: number, siren?: string) {
  // La page et l'export lient le même SIREN, après avoir autorisé la remise.
  return query(
    `SELECT t.id, r.numero_siren, t.date_vente::text AS date_vente, t.numero_carte,
            t.reseau, t.numero_autorisation, r.devise, t.montant::text AS montant, t.sens
     FROM transactions t JOIN remises r ON r.id = t.remise_id
     WHERE r.id = $1 AND ($2::text IS NULL OR r.numero_siren = $2)
     ORDER BY t.date_vente ASC, t.numero_autorisation ASC`, [id, siren ?? null],
  ) as Promise<RemittanceDetail[]>;
}

export async function readRemittanceForExport(params: TreasuryParams) {
  const criteria = parseRemittanceCriteria(params);
  if (criteria.error || criteria.openedId === undefined) return { criteria };
  const { siren } = await getRemittanceScope(params.siren);
  try {
    // Vérifier l'appartenance avant de lire les transactions, indépendamment de la page ouverte.
    const rows = await query(
      `SELECT r.id, r.numero_siren, e.raison_sociale, r.numero_remise, r.date_remise::text AS date_remise,
              r.nb_transactions, r.montant_total::text AS montant_total, r.sens, r.devise
       FROM remises r JOIN entreprises e ON e.numero_siren = r.numero_siren
       WHERE r.id = $1 AND ($2::text IS NULL OR r.numero_siren = $2)`, [criteria.openedId, siren ?? null],
    ) as RemittanceRow[];
    if (!rows[0]) return { criteria };
    const details = await readRemittanceTransactions(rows[0].id, siren);
    const result: RemittanceResult = { criteria, rows, count: 1, totalCents: signedRemittanceCents(rows[0].montant_total, rows[0].sens), page: 1, pageCount: 1, details, siren, openedId: rows[0].id };
    return { criteria, remittance: rows[0], result };
  } catch {
    throw new Error("Lecture des remises indisponible.");
  }
}

export function remittanceQuery(result: RemittanceResult, page = result.page, openedId?: number) {
  const params = new URLSearchParams();
  const { criteria } = result;
  if (result.siren) params.set("siren", result.siren);
  if (criteria.startText) params.set("debut", criteria.startText);
  if (criteria.endText) params.set("fin", criteria.endText);
  if (criteria.numberText) params.set("numero", criteria.numberText);
  params.set("lignes", String(criteria.pageSize));
  params.set("page", String(page));
  if (openedId !== undefined) params.set("remise", String(openedId));
  return params.toString();
}
