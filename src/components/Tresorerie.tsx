import Link from "next/link";
import BandeauSynthese from "@/components/BandeauSynthese";
import Tableau from "@/components/Tableau";
import ExportFormulaire from "@/components/ExportFormulaire";
import { formatMontant, formatSiren } from "@/lib/format";
import { amountToCents, decimalFromCents, formatTreasuryDate, treasuryQuery, type TreasuryResult, type TreasurySort } from "@/lib/tresorerie";
import type { Merchant } from "@/lib/access";

type Props = { result: TreasuryResult; basePath: string; companyName?: string; merchants?: Merchant[]; inactive?: boolean };

export default function Tresorerie({ result, basePath, companyName, merchants, inactive }: Props) {
  const selected = companyName ?? merchants?.find(merchant => merchant.numero_siren === result.siren)?.raison_sociale ?? "Tous les commerçants";
  function amount(cents: number) {
    return <span className={cents < 0 ? "negative-amount" : undefined}>{formatMontant(decimalFromCents(cents))}</span>;
  }
  function sortable(key: "siren" | "montant", label: string, numeric = false) {
    const active = result.sort.key === key;
    const order = active && result.sort.order === "asc" ? "desc" : "asc";
    const sort: "ascending" | "descending" | "none" = active ? result.sort.order === "asc" ? "ascending" : "descending" : "none";
    return { key, label, numeric, sort, href: `${basePath}?${treasuryQuery(result, { key, order } as TreasurySort)}` };
  }
  return (<>
    <BandeauSynthese title="Annonces de trésorerie">
      {selected}{result.siren && <>, SIREN <span className="tabular-nums">{formatSiren(result.siren)}</span></>}
      {inactive && <span className="block">Compte désactivé</span>}
      {merchants && <span className="block muted">{merchants.length} commerçants enregistrés</span>}
      {!result.error && <span className="block">{result.dateText || "Toutes les dates"}, {result.rows.length} {result.rows.length === 1 ? "annonce" : "annonces"}, solde <strong className="tabular-nums">{amount(result.totalCents)} EUR</strong></span>}
    </BandeauSynthese>
    <form action={basePath} method="get" className="treasury-criteria" aria-label="Critères de trésorerie">
      {merchants && <div className="criterion company-criterion"><label htmlFor="treasury-company">Entreprise</label><select id="treasury-company" name="siren" defaultValue={result.siren ?? ""}><option value="">Toutes</option>{merchants.map(merchant => <option key={merchant.numero_siren} value={merchant.numero_siren}>{formatSiren(merchant.numero_siren)} : {merchant.raison_sociale}</option>)}</select></div>}
      <div className="criterion"><label htmlFor="treasury-date">Date de valeur</label><input id="treasury-date" name="date" type="text" inputMode="numeric" placeholder="jj/mm/aaaa" defaultValue={result.dateText} aria-describedby="treasury-date-help" aria-invalid={Boolean(result.error)} /><span id="treasury-date-help" className="muted">jj/mm/aaaa, facultatif</span></div>
      <input type="hidden" name="sort" value={result.sort.key} /><input type="hidden" name="order" value={result.sort.order} />
      <button className="button-primary" type="submit">Rechercher</button><Link className="text-link" href={basePath}>Réinitialiser</Link>
    </form>
    {result.error ? <div className="login-error treasury-error" role="alert">{result.error}</div> : <>
      <div className="treasury-toolbar"><h2>{result.rows.length} {result.rows.length === 1 ? "annonce de trésorerie" : "annonces de trésorerie"}</h2>
        <ExportFormulaire action="/export/tresorerie" query={treasuryQuery(result)} label="Exporter les annonces" />
      </div>
      <Tableau caption="Annonces de trésorerie" columns={[
        { key: "date", label: "Date de valeur" },
        merchants || basePath.startsWith("/po") ? sortable("siren", "N° de SIREN") : { key: "siren", label: "N° de SIREN" },
        { key: "name", label: "Raison sociale" }, { key: "count", label: "Nombre de transactions", numeric: true },
        { key: "currency", label: "Devise" }, sortable("montant", "Montant total", true),
      ]} rows={result.rows.map(row => ({ key: String(row.id), cells: {
        date: <span className="tabular-nums">{formatTreasuryDate(row.date_valeur)}</span>,
        siren: basePath.startsWith("/po") ? <Link className="text-link tabular-nums" href={`/po/entreprise/${row.numero_siren}`}>{formatSiren(row.numero_siren)}</Link> : <span className="tabular-nums">{formatSiren(row.numero_siren)}</span>,
        name: row.raison_sociale, count: row.nb_transactions, currency: row.devise, montant: amount(amountToCents(row.montant_total)),
      } }))} total={{ date: "Solde global", montant: <>{amount(result.totalCents)} EUR</> }} emptyMessage="Aucune annonce pour cette date." />
    </>}
  </>);
}
