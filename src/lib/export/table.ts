import { formatCard, formatMontant } from "@/lib/format";
import { amountToCents, decimalFromCents, formatTreasuryDate, type TreasuryResult } from "@/lib/tresorerie";
import { signedRemittanceCents, type RemittanceResult, type RemittanceRow } from "@/lib/remises";
import type { UnpaidResult } from "@/lib/impayes";
import type { Merchant } from "@/lib/access";

export type ReportColumn = { header: string; type: "text" | "integer" | "amount" | "date"; align: "left" | "right" };
export type ReportCell = string | number;
export type ReportTable = {
  title: string; subtitle: string; extractedAt: Date; columns: ReportColumn[]; rows: ReportCell[][];
  total?: { label: string; cents: number; count?: number }; kind: "tresorerie" | "remises" | "remise" | "impayes" | "impayes-synthese";
  siren?: string; remittanceNumber?: string;
};

function column(header: string, type: ReportColumn["type"] = "text"): ReportColumn {
  return { header, type, align: type === "amount" || type === "integer" ? "right" : "left" };
}

function title(label: string, company?: Merchant) {
  const scope = company
    ? `DE L'ENTREPRISE ${company.raison_sociale} N° SIREN ${company.numero_siren}`
    : "DE TOUTES LES ENTREPRISES";
  return `${label} ${scope}`.toLocaleUpperCase("fr-FR");
}

export function chartTitles(company?: Merchant) {
  return {
    evolution: title("Évolution des impayés", company),
    motifs: title("Répartition des impayés par motif", company),
  };
}

function period(criteria: { startText: string; endText: string }) {
  if (criteria.startText && criteria.endText) return `Du ${criteria.startText} au ${criteria.endText}`;
  if (criteria.startText) return `À partir du ${criteria.startText}`;
  return criteria.endText ? `Jusqu'au ${criteria.endText}` : "Toutes les dates";
}

function remittanceFilterText(criteria: RemittanceResult["criteria"], includeAllDates = true) {
  const parts: string[] = [];
  // Le détail rappelle seulement les filtres actifs, avec les mêmes mots que la liste.
  if (includeAllDates || criteria.startText || criteria.endText) parts.push(period(criteria));
  if (criteria.numberText) parts.push(`N° de remise : ${criteria.numberText}`);
  return parts.join(" ; ");
}

function sortText(sort: { key: string; order: string }) {
  const labels: Record<string, string> = { date: "date", siren: "SIREN", montant: "montant" };
  return `Tri : ${labels[sort.key]}, ${sort.order === "asc" ? "croissant" : "décroissant"}`;
}

// Le même modèle fixe colonnes et calculs pour les trois formats, sans relire les données.
// Les montants restent en centimes : aucun rendu ne refait une addition de décimaux.
export function treasuryReport(result: TreasuryResult, company?: Merchant, now = new Date()): ReportTable {
  return {
    kind: "tresorerie", siren: result.siren, title: title("Liste des annonces de trésorerie", company), extractedAt: now,
    subtitle: `${result.dateText ? `Date de valeur : ${result.dateText}` : "Toutes les dates"}${result.negativeOnly ? " ; Soldes négatifs uniquement" : ""} ; ${sortText(result.sort)}`,
    columns: [column("Date de valeur", "date"), column("N° de SIREN"), column("Raison sociale"), column("Nombre de transactions", "integer"), column("Devise"), column("Montant total", "amount")],
    rows: result.rows.map(r => [r.date_valeur, r.numero_siren, r.raison_sociale, r.nb_transactions, r.devise, amountToCents(r.montant_total)]),
    ...(result.totalCents === undefined ? {} : { total: { label: "Solde global", cents: result.totalCents } }),
  };
}

export function remittancesReport(result: RemittanceResult, company?: Merchant, now = new Date()): ReportTable {
  return {
    kind: "remises", siren: result.siren, title: title("Liste des remises", company), extractedAt: now,
    subtitle: `${remittanceFilterText(result.criteria)} ; Tri : date décroissante, numéro croissant`,
    columns: [column("N° SIREN"), column("Raison sociale"), column("N° Remise"), column("Date traitement", "date"), column("Nbre transactions", "integer"), column("Devise (EUR)"), column("Montant total", "amount"), column("Sens + ou -")],
    rows: result.rows.map(r => [r.numero_siren, r.raison_sociale, r.numero_remise, r.date_remise, r.nb_transactions, r.devise, signedRemittanceCents(r.montant_total, r.sens), r.sens]),
    total: { label: "Solde des remises", cents: result.totalCents },
  };
}

export function remittanceDetailReport(result: RemittanceResult, remittance: RemittanceRow, company: Merchant, now = new Date()): ReportTable {
  return {
    kind: "remise", siren: remittance.numero_siren, remittanceNumber: remittance.numero_remise,
    title: title(`Détail de la remise ${remittance.numero_remise}`, company), extractedAt: now,
    subtitle: [
      `Date de traitement : ${formatTreasuryDate(remittance.date_remise)}`,
      remittanceFilterText(result.criteria, false),
      "Tri : date de vente, autorisation croissantes",
    ].filter(Boolean).join(" ; "),
    columns: [column("N° SIREN"), column("Date vente", "date"), column("N° Carte"), column("Réseau"), column("N° autorisation"), column("Devise (EUR)"), column("Montant", "amount"), column("Sens + ou -")],
    rows: result.details.map(r => [r.numero_siren, r.date_vente, formatCard(r.numero_carte), r.reseau, r.numero_autorisation, r.devise, signedRemittanceCents(r.montant, r.sens), r.sens]),
  };
}

export function unpaidReport(result: UnpaidResult, company?: Merchant, now = new Date()): ReportTable {
  return {
    kind: "impayes", siren: result.siren, title: title("Liste des impayés", company), extractedAt: now,
    subtitle: `${period(result.criteria)}${result.criteria.dossierText ? ` ; N° de dossier impayé : ${result.criteria.dossierText}` : ""} ; ${sortText(result.criteria.sort)}`,
    columns: [column("N° SIREN"), column("Date vente", "date"), column("Date remise", "date"), column("N° Carte"), column("Réseau"), column("N° dossier impayé"), column("Devise (EUR)"), column("Montant", "amount"), column("Libellé impayé")],
    rows: result.rows.map(r => [r.numero_siren, r.date_vente, r.date_remise, formatCard(r.numero_carte), r.reseau, r.numero_dossier_impaye, r.devise, amountToCents(r.montant), r.libelle]),
    total: { label: "Total des impayés", cents: result.totalCents },
  };
}

export function unpaidSummaryReport(result: UnpaidResult, company?: Merchant, now = new Date()): ReportTable {
  const report = unpaidReport(result, company, now);
  return {
    ...report, kind: "impayes-synthese",
    title: company ? title("Somme des impayés par entreprise", company) : "SOMME DES IMPAYÉS PAR ENTREPRISE",
    subtitle: `${period(result.criteria)}${result.criteria.dossierText ? ` ; N° de dossier impayé : ${result.criteria.dossierText}` : ""} ; Tri : SIREN ${result.criteria.companyOrder === "asc" ? "croissant" : "décroissant"}`,
    columns: [column("N° SIREN"), column("Raison sociale"), column("Nombre d'impayés", "integer"), column("Somme des impayés", "amount")],
    rows: result.companies.map(r => [r.numero_siren, r.raison_sociale, r.count, r.totalCents]),
    total: { label: "Total des impayés", cents: result.totalCents, count: result.count },
  };
}

export function extractionText(date: Date) {
  const day = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(date);
  return `EXTRAIT DU ${day}`;
}

export function displayCell(value: ReportCell, column: ReportColumn) {
  if (column.type === "amount") return formatMontant(decimalFromCents(value as number));
  if (column.type === "date") return formatTreasuryDate(String(value));
  return String(value);
}

export function totalCells(report: ReportTable): ReportCell[] {
  return report.columns.map((c, i) => i === 0 ? report.total?.label ?? "" : c.type === "amount" ? report.total?.cents ?? 0 : c.type === "integer" ? report.total?.count ?? "" : "");
}
