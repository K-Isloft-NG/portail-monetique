import { amountToCents, decimalFromCents, formatTreasuryDate, type TreasuryRow } from "@/lib/tresorerie";

function csvText(value: string): string {
  // Une cellule de texte ne doit pas devenir une formule dans un tableur.
  const protectedValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(protectedValue) ? `"${protectedValue.replace(/"/g, '""')}"` : protectedValue;
}

export function buildTreasuryCsv(rows: TreasuryRow[]): string {
  const lines = [["Date de valeur", "N° de SIREN", "Raison sociale", "Nombre de transactions", "Devise", "Montant total"].join(";")];
  for (const row of rows) {
    // Les montants restent numériques : un débit garde son tiret ASCII sans préfixe.
    lines.push([
      csvText(formatTreasuryDate(row.date_valeur)), csvText(row.numero_siren), csvText(row.raison_sociale),
      String(row.nb_transactions), csvText(row.devise), decimalFromCents(amountToCents(row.montant_total)).replace(".", ","),
    ].join(";"));
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

export function treasuryCsvFilename(siren?: string, date = new Date()): string {
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(date);
  return `tresorerie_${siren && /^[0-9]{9}$/.test(siren) ? siren : "tous"}_${day}.csv`;
}
