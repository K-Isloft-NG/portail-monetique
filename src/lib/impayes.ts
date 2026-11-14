import { query } from "@/lib/db";
import { getRemittanceScope } from "@/lib/access";
import { parseRemittanceDateRange } from "@/lib/remises";
import { amountToCents, parseTreasurySort, type TreasuryParams, type TreasurySort } from "@/lib/tresorerie";

export type UnpaidCriteria = ReturnType<typeof parseRemittanceDateRange> & {
  dossierText: string; sort: TreasurySort; companyOrder: "asc" | "desc";
};
export type UnpaidRow = {
  id: number; numero_siren: string; date_vente: string; date_remise: string;
  numero_carte: string; reseau: string; numero_dossier_impaye: string;
  devise: string; montant: string; libelle: string;
};
export type UnpaidCompany = { numero_siren: string; raison_sociale: string; count: number; totalCents: number };
export type UnpaidResult = { criteria: UnpaidCriteria; rows: UnpaidRow[]; count: number; totalCents: number; companies: UnpaidCompany[]; siren?: string };

// Seuls ces fragments constants entrent dans ORDER BY ; le montant est déjà signé.
const SORT_SQL = {
  date: { asc: "r.date_remise ASC, t.numero_dossier_impaye ASC", desc: "r.date_remise DESC, t.numero_dossier_impaye ASC" },
  montant: { asc: "-t.montant ASC, r.date_remise DESC, t.numero_dossier_impaye ASC", desc: "-t.montant DESC, r.date_remise DESC, t.numero_dossier_impaye ASC" },
  siren: { asc: "r.numero_siren ASC, r.date_remise DESC, t.numero_dossier_impaye ASC", desc: "r.numero_siren DESC, r.date_remise DESC, t.numero_dossier_impaye ASC" },
};
const COMPANY_ORDER_SQL = { asc: "r.numero_siren ASC", desc: "r.numero_siren DESC" };

// Cette même clause définit l'impayé et les filtres pour la liste, le total et la synthèse.
export const UNPAID_FROM_SQL = `FROM transactions t
  JOIN remises r ON r.id = t.remise_id
  JOIN motifs_impayes m ON m.id = t.motif_impaye_id
  JOIN entreprises e ON e.numero_siren = r.numero_siren
  WHERE t.sens = '-' AND t.motif_impaye_id IS NOT NULL AND t.numero_dossier_impaye IS NOT NULL
    AND ($1::text IS NULL OR r.numero_siren = $1)
    AND ($2::date IS NULL OR r.date_remise >= $2::date)
    AND ($3::date IS NULL OR r.date_remise <= $3::date)
    AND ($4::text IS NULL OR t.numero_dossier_impaye ILIKE '%' || $4 || '%')`;

export function parseUnpaidCriteria(params: TreasuryParams): UnpaidCriteria {
  const range = parseRemittanceDateRange(params);
  const dossierText = typeof params.dossier === "string" ? params.dossier : "";
  const invalidDossier = Array.isArray(params.dossier) || (dossierText !== "" && !/^[a-zA-Z0-9]{1,5}$/.test(dossierText));
  return {
    ...range, dossierText, sort: parseTreasurySort(params),
    companyOrder: params.tri_siren === "desc" ? "desc" : "asc",
    error: range.error ?? (invalidDossier ? "Saisissez un numéro de dossier de 5 caractères au plus (lettres et chiffres)." : undefined),
  };
}

export async function readUnpaid(params: TreasuryParams, withCompanies = false): Promise<UnpaidResult> {
  const criteria = parseUnpaidCriteria(params);
  const empty: UnpaidResult = { criteria, rows: [], count: 0, totalCents: 0, companies: [] };
  // Une erreur de saisie ne déclenche aucune lecture de transactions, même pour un total.
  if (criteria.error) return empty;
  const { session, siren } = await getRemittanceScope(params.siren);
  if (session.profile === "client" && criteria.sort.key === "siren") criteria.sort = { key: "date", order: "desc" };
  const filters = [siren ?? null, criteria.startIso ?? null, criteria.endIso ?? null, criteria.dossierText || null];
  try {
    // Le signe est appliqué dans PostgreSQL et la somme NUMERIC sort en texte, sans flottants.
    const totals = await query(`SELECT COUNT(*)::text AS count, COALESCE(SUM(-t.montant), 0)::text AS total ${UNPAID_FROM_SQL}`, filters);
    const count = Number(totals[0].count);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Nombre d'impayés invalide.");
    const totalCents = amountToCents(totals[0].total as string);
    // La liste reprend exactement les filtres du total et un ordre choisi dans la liste blanche.
    const rows = await query(
      `SELECT t.id, r.numero_siren, t.date_vente::text AS date_vente, r.date_remise::text AS date_remise,
              t.numero_carte, t.reseau, t.numero_dossier_impaye, r.devise, (-t.montant)::text AS montant, m.libelle
       ${UNPAID_FROM_SQL} ORDER BY ${SORT_SQL[criteria.sort.key][criteria.sort.order]}`, filters,
    ) as UnpaidRow[];
    let companies: UnpaidCompany[] = [];
    if (withCompanies && session.profile === "po") {
      // GROUP BY additionne les mêmes NUMERIC filtrés, sans charger toutes les lignes pour les regrouper.
      const groups = await query(
        `SELECT r.numero_siren, e.raison_sociale, COUNT(*)::text AS count, SUM(-t.montant)::text AS total
         ${UNPAID_FROM_SQL} GROUP BY r.numero_siren, e.raison_sociale
         ORDER BY ${COMPANY_ORDER_SQL[criteria.companyOrder]}`, filters,
      );
      companies = groups.map(group => ({ numero_siren: group.numero_siren as string, raison_sociale: group.raison_sociale as string, count: Number(group.count), totalCents: amountToCents(group.total as string) }));
    }
    return { criteria, rows, count, totalCents, companies, siren };
  } catch {
    throw new Error("Lecture des impayés indisponible.");
  }
}

export function unpaidQuery(result: UnpaidResult, sort = result.criteria.sort, companyOrder = result.criteria.companyOrder) {
  const params = new URLSearchParams();
  if (result.siren) params.set("siren", result.siren);
  if (result.criteria.startText) params.set("debut", result.criteria.startText);
  if (result.criteria.endText) params.set("fin", result.criteria.endText);
  if (result.criteria.dossierText) params.set("dossier", result.criteria.dossierText);
  params.set("sort", sort.key); params.set("order", sort.order); params.set("tri_siren", companyOrder);
  return params.toString();
}
