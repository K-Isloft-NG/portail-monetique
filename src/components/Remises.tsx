import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import BandeauSynthese from "@/components/BandeauSynthese";
import Tableau from "@/components/Tableau";
import { formatCard, formatMontant, formatSiren } from "@/lib/format";
import { decimalFromCents, formatTreasuryDate } from "@/lib/tresorerie";
import { remittanceQuery, signedRemittanceCents, type RemittanceResult } from "@/lib/remises";
import type { Merchant } from "@/lib/access";

type Props = { result: RemittanceResult; basePath: string; companyName?: string; merchants?: Merchant[]; inactive?: boolean };

function Amount({ cents }: { cents: number }) {
  return <span className={`tabular-nums${cents < 0 ? " negative-amount" : ""}`}>{formatMontant(decimalFromCents(cents))}</span>;
}

function Cell({ label, numeric, children }: { label: string; numeric?: boolean; children: ReactNode }) {
  return <td className={numeric ? "numeric tabular-nums" : undefined}><span className="cell-label">{label}</span><span>{children}</span></td>;
}

export default function Remises({ result, basePath, companyName, merchants, inactive }: Props) {
  const { criteria, count } = result;
  const selected = companyName ?? merchants?.find(merchant => merchant.numero_siren === result.siren)?.raison_sociale ?? "Toutes les entreprises";
  const period = criteria.startText && criteria.endText ? `Du ${criteria.startText} au ${criteria.endText}` : criteria.startText ? `À partir du ${criteria.startText}` : criteria.endText ? `Jusqu'au ${criteria.endText}` : "Toutes les dates";
  const first = count ? (result.page - 1) * criteria.pageSize + 1 : 0;
  const last = Math.min(result.page * criteria.pageSize, count);
  const emptyMessage = criteria.numberText ? "Aucune remise ne correspond à votre recherche." : "Aucune remise pour cette période.";
  return (<>
    <BandeauSynthese title="Remises">
      {selected}{result.siren && <>, SIREN <span className="tabular-nums">{formatSiren(result.siren)}</span></>}
      {inactive && <span className="block">Compte désactivé</span>}
      {!criteria.error && <span className="block">{period}, {count} {count === 1 ? "remise" : "remises"}, solde <strong><Amount cents={result.totalCents} /> EUR</strong></span>}
      {criteria.numberText && <span className="block">N° de remise : {criteria.numberText}</span>}
    </BandeauSynthese>
    {/* L'absence de page et de remise dans ce formulaire redémarre chaque recherche. */}
    <form action={basePath} method="get" className="treasury-criteria" aria-label="Critères de remises">
      {merchants && <div className="criterion company-criterion"><label htmlFor="remittance-company">Entreprise</label><select id="remittance-company" name="siren" defaultValue={result.siren ?? ""}><option value="">Toutes</option>{merchants.map(merchant => <option key={merchant.numero_siren} value={merchant.numero_siren}>{formatSiren(merchant.numero_siren)} : {merchant.raison_sociale}</option>)}</select></div>}
      <div className="criterion"><label htmlFor="remittance-start">Date de début</label><input id="remittance-start" name="debut" type="text" inputMode="numeric" placeholder="jj/mm/aaaa" defaultValue={criteria.startText} aria-describedby="remittance-start-help" /><span id="remittance-start-help" className="muted">jj/mm/aaaa, facultatif</span></div>
      <div className="criterion"><label htmlFor="remittance-end">Date de fin</label><input id="remittance-end" name="fin" type="text" inputMode="numeric" placeholder="jj/mm/aaaa" defaultValue={criteria.endText} aria-describedby="remittance-end-help" /><span id="remittance-end-help" className="muted">jj/mm/aaaa, facultatif</span></div>
      <div className="criterion"><label htmlFor="remittance-number">N° de remise</label><input id="remittance-number" name="numero" type="text" maxLength={20} defaultValue={criteria.numberText} aria-describedby="remittance-number-help" /><span id="remittance-number-help" className="muted">Lettres, chiffres et tirets</span></div>
      <div className="criterion"><label htmlFor="remittance-size">Lignes par page</label><input id="remittance-size" name="lignes" type="text" inputMode="numeric" defaultValue={criteria.pageSize} aria-describedby="remittance-size-help" /><span id="remittance-size-help" className="muted">De 1 à 100</span></div>
      <button className="button-primary" type="submit">Rechercher</button><Link className="text-link" href={basePath}>Réinitialiser</Link>
    </form>
    {criteria.error ? <div className="login-error treasury-error" role="alert">{criteria.error}</div> : <>
      <div className="treasury-toolbar"><h2>{count ? `${count} ${count === 1 ? "remise" : "remises"}` : emptyMessage}</h2>{count > 0 && <p className="tabular-nums">{count === 1 ? "Affichée" : "Affichées"} de {first} à {last}</p>}</div>
      <table className="register remittances-register">
        <caption className="sr-only">Remises de paiements par carte</caption>
        <thead><tr>{["N° SIREN", "Raison sociale", "N° Remise", "Date traitement", "Nbre transactions", "Devise (EUR)", "Montant total", "Sens + ou -"].map((label, index) => <th key={label} scope="col" className={index === 4 || index === 6 ? "numeric" : undefined}>{label}</th>)}</tr></thead>
        <tbody>{result.rows.length ? result.rows.map(row => <Fragment key={row.id}><tr id={`remise-${row.id}`}>
          <Cell label="N° SIREN"><span className="tabular-nums">{formatSiren(row.numero_siren)}</span></Cell>
          <Cell label="Raison sociale">{row.raison_sociale}</Cell>
          <Cell label="N° Remise"><a className="text-link tabular-nums" href={`${basePath}?${remittanceQuery(result, result.page, result.openedId === row.id ? undefined : row.id)}#remise-${row.id}`} aria-expanded={result.openedId === row.id} aria-controls={`detail-${row.id}`}><span aria-hidden="true">{result.openedId === row.id ? "▾ " : "▸ "}</span>{row.numero_remise}</a></Cell>
          <Cell label="Date traitement"><span className="tabular-nums">{formatTreasuryDate(row.date_remise)}</span></Cell>
          <Cell label="Nbre transactions" numeric>{row.nb_transactions}</Cell>
          <Cell label="Devise (EUR)">{row.devise}</Cell>
          <Cell label="Montant total" numeric><Amount cents={signedRemittanceCents(row.montant_total, row.sens)} /></Cell>
          <Cell label="Sens + ou -">{row.sens}</Cell>
        </tr>
          <tr id={`detail-${row.id}`} className="remittance-detail" hidden={result.openedId !== row.id}><td colSpan={8}>
            {result.openedId === row.id && <section aria-labelledby={`detail-title-${row.id}`}>
              <h2 id={`detail-title-${row.id}`}>Détail de la remise {row.numero_remise}</h2>
              <Tableau caption={`Transactions de la remise ${row.numero_remise}`} columns={[
                { key: "siren", label: "N° SIREN" }, { key: "date", label: "Date vente" },
                { key: "card", label: "N° Carte" }, { key: "network", label: "Réseau" },
                { key: "authorization", label: "N° autorisation" }, { key: "currency", label: "Devise (EUR)" },
                { key: "amount", label: "Montant", numeric: true }, { key: "direction", label: "Sens + ou -" },
              ]} rows={result.details.map(detail => ({ key: String(detail.id), cells: {
                siren: <span className="tabular-nums">{formatSiren(detail.numero_siren)}</span>,
                date: <span className="tabular-nums">{formatTreasuryDate(detail.date_vente)}</span>,
                card: <span className="tabular-nums">{formatCard(detail.numero_carte)}</span>, network: detail.reseau,
                authorization: <span className="tabular-nums">{detail.numero_autorisation}</span>, currency: detail.devise,
                amount: <Amount cents={signedRemittanceCents(detail.montant, detail.sens)} />, direction: detail.sens,
              } }))} emptyMessage="Aucune transaction pour cette remise." />
            </section>}
          </td></tr>
        </Fragment>) : <tr><td colSpan={8}>{emptyMessage}</td></tr>}</tbody>
        <tfoot><tr><td colSpan={6}>Solde des remises</td><td className="numeric"><Amount cents={result.totalCents} /> EUR</td><td className="empty-cell" /></tr></tfoot>
      </table>
      <nav className="remittance-pagination" aria-label="Pagination des remises">
        {result.page > 1 ? <Link className="button-secondary" href={`${basePath}?${remittanceQuery(result, result.page - 1)}`}>Précédent</Link> : <span className="muted">Précédent</span>}
        <span className="tabular-nums">Page {result.page} sur {result.pageCount}</span>
        {result.page < result.pageCount ? <Link className="button-secondary" href={`${basePath}?${remittanceQuery(result, result.page + 1)}`}>Suivant</Link> : <span className="muted">Suivant</span>}
      </nav>
    </>}
  </>);
}
