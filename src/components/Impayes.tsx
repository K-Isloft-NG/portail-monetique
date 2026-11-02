import Link from "next/link";
import BandeauSynthese from "@/components/BandeauSynthese";
import Tableau from "@/components/Tableau";
import ExportFormulaire from "@/components/ExportFormulaire";
import { formatCard, formatMontant, formatSiren } from "@/lib/format";
import { amountToCents, decimalFromCents, formatTreasuryDate, type TreasurySort } from "@/lib/tresorerie";
import { unpaidQuery, type UnpaidResult } from "@/lib/impayes";
import type { Merchant } from "@/lib/access";

type Props = { result: UnpaidResult; basePath: string; companyName?: string; merchants?: Merchant[]; inactive?: boolean };

function Amount({ cents }: { cents: number }) {
  return <span className={`tabular-nums${cents < 0 ? " negative-amount" : ""}`}>{formatMontant(decimalFromCents(cents))}</span>;
}

function CompanySummary({ result, basePath }: { result: UnpaidResult; basePath: string }) {
  const ascending = result.criteria.companyOrder === "asc";
  // Le lien d'entreprise retire les filtres, mais conserve l'ordre de lecture des impayés.
  const sortQuery = new URLSearchParams({ sort: result.criteria.sort.key, order: result.criteria.sort.order });
  return <section className="unpaid-companies" aria-labelledby="unpaid-companies-title">
    <div className="treasury-toolbar"><h2 id="unpaid-companies-title">Somme des impayés par entreprise</h2>
      <ExportFormulaire action="/export/impayes" query={`${unpaidQuery(result)}&vue=synthese`} label="Exporter la synthèse des impayés" />
    </div>
    <Tableau caption="Somme des impayés par entreprise" sortLabel="Tri de la synthèse par entreprise" columns={[
      { key: "siren", label: "N° SIREN", sort: ascending ? "ascending" : "descending", href: `${basePath}?${unpaidQuery(result, result.criteria.sort, ascending ? "desc" : "asc")}` },
      { key: "name", label: "Raison sociale" }, { key: "count", label: "Nombre d'impayés", numeric: true }, { key: "amount", label: "Somme des impayés", numeric: true },
    ]} rows={result.companies.map(company => ({ key: company.numero_siren, cells: {
      siren: <Link className="text-link tabular-nums" href={`/po/entreprise/${company.numero_siren}/impayes?${sortQuery}`}>{formatSiren(company.numero_siren)}</Link>,
      name: company.raison_sociale, count: company.count, amount: <Amount cents={company.totalCents} />,
    } }))} total={{ siren: "Total des impayés", count: result.count, amount: <><Amount cents={result.totalCents} /> EUR</> }} emptyMessage="Aucune entreprise concernée." />
  </section>;
}

export default function Impayes({ result, basePath, companyName, merchants, inactive }: Props) {
  const { criteria, count } = result;
  const selected = companyName ?? merchants?.find(merchant => merchant.numero_siren === result.siren)?.raison_sociale ?? "Toutes les entreprises";
  const period = criteria.startText && criteria.endText ? `Du ${criteria.startText} au ${criteria.endText}` : criteria.startText ? `À partir du ${criteria.startText}` : criteria.endText ? `Jusqu'au ${criteria.endText}` : "Toutes les dates";
  const emptyMessage = criteria.dossierText ? "Aucun impayé ne correspond à votre recherche." : "Aucun impayé pour cette période.";
  function sortable(key: TreasurySort["key"], label: string, numeric = false) {
    const active = criteria.sort.key === key;
    const order = active && criteria.sort.order === "asc" ? "desc" : "asc";
    const sort: "ascending" | "descending" | "none" = active ? criteria.sort.order === "asc" ? "ascending" : "descending" : "none";
    return { key, label, numeric, sort, href: `${basePath}?${unpaidQuery(result, { key, order })}` };
  }
  return (<>
    <BandeauSynthese title="Impayés">
      {selected}{result.siren && <>, SIREN <span className="tabular-nums">{formatSiren(result.siren)}</span></>}
      {inactive && <span className="block">Compte désactivé</span>}
      {!criteria.error && <span className="block">{period}, {count} {count === 1 ? "impayé" : "impayés"}. Total des impayés : <strong><Amount cents={result.totalCents} /> EUR</strong></span>}
      {merchants && !criteria.error && <span className="block">{result.companies.length} {result.companies.length === 1 ? "entreprise concernée" : "entreprises concernées"}</span>}
      {criteria.dossierText && <span className="block">N° de dossier impayé : {criteria.dossierText}</span>}
    </BandeauSynthese>
    <form action={basePath} method="get" className="treasury-criteria" aria-label="Critères des impayés">
      {merchants && <div className="criterion company-criterion"><label htmlFor="unpaid-company">Entreprise</label><select id="unpaid-company" name="siren" defaultValue={result.siren ?? ""}><option value="">Toutes</option>{merchants.map(merchant => <option key={merchant.numero_siren} value={merchant.numero_siren}>{formatSiren(merchant.numero_siren)} : {merchant.raison_sociale}</option>)}</select></div>}
      <div className="criterion"><label htmlFor="unpaid-start">Date de début</label><input id="unpaid-start" name="debut" type="text" inputMode="numeric" placeholder="jj/mm/aaaa" defaultValue={criteria.startText} aria-describedby="unpaid-start-help" /><span id="unpaid-start-help" className="muted">jj/mm/aaaa, facultatif</span></div>
      <div className="criterion"><label htmlFor="unpaid-end">Date de fin</label><input id="unpaid-end" name="fin" type="text" inputMode="numeric" placeholder="jj/mm/aaaa" defaultValue={criteria.endText} aria-describedby="unpaid-end-help" /><span id="unpaid-end-help" className="muted">jj/mm/aaaa, facultatif</span></div>
      <div className="criterion"><label htmlFor="unpaid-dossier">N° de dossier impayé</label><input id="unpaid-dossier" name="dossier" type="text" maxLength={5} defaultValue={criteria.dossierText} aria-describedby="unpaid-dossier-help" /><span id="unpaid-dossier-help" className="muted">Lettres et chiffres, facultatif</span></div>
      <input type="hidden" name="sort" value={criteria.sort.key} /><input type="hidden" name="order" value={criteria.sort.order} /><input type="hidden" name="tri_siren" value={criteria.companyOrder} />
      <button className="button-primary" type="submit">Rechercher</button><Link className="text-link" href={basePath}>Réinitialiser</Link>
    </form>
    {criteria.error ? <div className="login-error treasury-error unpaid-error" role="alert">{criteria.error}</div> : <>
      {merchants && <CompanySummary result={result} basePath={basePath} />}
      <section className="unpaid-list" aria-label="Liste des impayés">
        <div className="treasury-toolbar"><h2>{count} {count === 1 ? "impayé" : "impayés"}</h2>
          <ExportFormulaire action="/export/impayes" query={unpaidQuery(result)} label="Exporter les impayés" />
        </div>
        <Tableau caption="Liste des impayés" sortLabel="Tri des impayés" columns={[
          basePath.startsWith("/po") ? sortable("siren", "N° SIREN") : { key: "siren", label: "N° SIREN" },
          { key: "sale", label: "Date vente" }, sortable("date", "Date de remise"),
          { key: "card", label: "N° Carte" }, { key: "network", label: "Réseau" },
          { key: "dossier", label: "N° dossier impayé" }, { key: "currency", label: "Devise (EUR)" },
          sortable("montant", "Montant", true), { key: "reason", label: "Libellé impayé" },
        ]} rows={result.rows.map(row => ({ key: String(row.id), cells: {
          siren: <span className="tabular-nums">{formatSiren(row.numero_siren)}</span>,
          sale: <span className="tabular-nums">{formatTreasuryDate(row.date_vente)}</span>, date: <span className="tabular-nums">{formatTreasuryDate(row.date_remise)}</span>,
          // Le masquage à l'affichage reste nécessaire même si la base fournit déjà des étoiles.
          card: <span className="tabular-nums">{formatCard(row.numero_carte)}</span>, network: row.reseau,
          dossier: <span className="tabular-nums">{row.numero_dossier_impaye}</span>, currency: row.devise,
          montant: <Amount cents={amountToCents(row.montant)} />, reason: row.libelle,
        } }))} total={{ siren: "Total des impayés", montant: <><Amount cents={result.totalCents} /> EUR</> }} emptyMessage={emptyMessage} />
      </section>
    </>}
  </>);
}
