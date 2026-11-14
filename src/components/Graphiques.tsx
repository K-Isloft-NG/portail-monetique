import BandeauSynthese from "@/components/BandeauSynthese";
import GraphiqueEvolution from "@/components/GraphiqueEvolution";
import GraphiqueMotifs from "@/components/GraphiqueMotifs";
import ImprimerBouton from "@/components/ImprimerBouton";
import { extractionText } from "@/lib/export/table";
import { chartPeriod, EMPTY_CHARTS, type ChartsResult } from "@/lib/graphiques";

export default function Graphiques({ result, basePath, companyName }: { result: ChartsResult; basePath: string; companyName?: string }) {
  const { criteria, evolution, motifs, companyCount } = result;
  const isClient = companyName !== undefined;
  const hasUnpaid = evolution.some(point => point.count > 0) || companyCount > 0;
  return <div className="charts-page">
    <BandeauSynthese title="Graphiques des impayés">
      {companyName ?? "Toutes les entreprises"}
      {!criteria.error && <> · {chartPeriod(criteria)}{!isClient && <> · {companyCount} {companyCount === 1 ? "entreprise concernée" : "entreprises concernées"}</>}</>}
    </BandeauSynthese>
    {!criteria.error && <p className="charts-print-heading">{extractionText(result.extractedAt)}</p>}
    <form action={basePath} method="get" className="charts-criteria" aria-label="Critères des graphiques">
      <fieldset><legend>Période</legend>
        <label><input type="radio" name="mode" value="12m" defaultChecked={criteria.mode === "12m"} /> 12 mois glissants</label>
        <label><input type="radio" name="mode" value="4m" defaultChecked={criteria.mode === "4m"} /> 4 mois glissants</label>
        {isClient && <label><input type="radio" name="mode" value="plage" defaultChecked={criteria.mode === "plage"} /> Plage de dates</label>}
      </fieldset>
      {isClient && <>
        <fieldset className="charts-dates" aria-describedby="charts-date-help"><legend>Dates de la plage</legend>
          <label htmlFor="charts-start">Date de début<input id="charts-start" name="debut" inputMode="numeric" placeholder="jj/mm/aaaa" defaultValue={criteria.startText} /></label>
          <label htmlFor="charts-end">Date de fin<input id="charts-end" name="fin" inputMode="numeric" placeholder="jj/mm/aaaa" defaultValue={criteria.endText} /></label>
          <p id="charts-date-help" className="muted">jj/mm/aaaa, pour la plage de dates</p>
        </fieldset>
        <fieldset><legend>Type de graphique</legend>
          <label><input type="radio" name="type" value="histogramme" defaultChecked={criteria.type === "histogramme"} /> Histogramme</label>
          <label><input type="radio" name="type" value="courbe" defaultChecked={criteria.type === "courbe"} /> Courbe</label>
        </fieldset>
      </>}
      <button type="submit" className="button-primary">Rechercher</button>
    </form>
    {criteria.error ? <p className="login-error" role="alert">{criteria.error}</p> : <>
      <div className="charts-actions">
        <ImprimerBouton />
        <form action="/export/graphiques" method="get">
          <input type="hidden" name="mode" value={criteria.mode} />
          {isClient && <input type="hidden" name="type" value={criteria.type} />}
          {criteria.mode === "plage" && <>
            <input type="hidden" name="debut" value={criteria.startText} />
            <input type="hidden" name="fin" value={criteria.endText} />
          </>}
          <button type="submit" className="button-secondary">Exporter en PDF</button>
        </form>
      </div>
      {hasUnpaid ? <>
        {isClient && <GraphiqueEvolution result={result} />}
        {motifs.length > 0 ? <GraphiqueMotifs result={result} /> : <p>Aucun motif avec un montant non nul pour cette période.</p>}
      </> : <p>{EMPTY_CHARTS}</p>}
    </>}
  </div>;
}
