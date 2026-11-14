import { circlePoint, formatShare, pieSlices } from "@/lib/graphiques-geometrie";
import { formatMontant } from "@/lib/format";
import { decimalFromCents } from "@/lib/tresorerie";
import { chartPeriod, type ChartsResult } from "@/lib/graphiques";

export default function GraphiqueMotifs({ result }: { result: ChartsResult }) {
  const parts = pieSlices(result.motifs.map(motif => motif.totalCents));
  const maximum = Math.max(...result.motifs.map(motif => Math.abs(motif.totalCents)));
  const center = 120, radius = 108;
  return <section className="charts-panel" aria-labelledby="motifs-heading">
    <h2 id="motifs-heading">Répartition des impayés par motif</h2>
    <div className="charts-breakdown">
      <svg className="charts-pie" viewBox="0 0 240 240" role="img" aria-label={`${chartPeriod(result.criteria)}, total ${formatMontant(decimalFromCents(result.totalCents))} EUR, motif maximal ${formatMontant(decimalFromCents(maximum))} EUR.`}>
        <title>Répartition des impayés par motif</title>
        {parts.map(part => {
          const code = result.motifs[part.index].code;
          const colorClass = `charts-tone-${code}`;
          if (part.full) return <circle key={code} cx={center} cy={center} r={radius} className={colorClass} />;
          const start = circlePoint(center, center, radius, part.start);
          const end = circlePoint(center, center, radius, part.end);
          return <path key={code} className={colorClass} d={`M ${center} ${center} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${part.ratio > 0.5 ? 1 : 0} 1 ${end.x} ${end.y} Z`} />;
        })}
      </svg>
      <ul className="charts-legend" aria-label="Légende des motifs">
        {parts.map(part => {
          const motif = result.motifs[part.index];
          return <li key={motif.code}>
            <span className={`charts-key charts-tone-${motif.code}`} aria-hidden="true" />
            <div><strong>{motif.code} · {motif.label}</strong><br />
              {motif.count} {motif.count === 1 ? "impayé" : "impayés"} · <span className="negative-amount">{formatMontant(decimalFromCents(motif.totalCents))} EUR</span> · {formatShare(part.ratio)}
            </div>
          </li>;
        })}
      </ul>
    </div>
    <details className="charts-values"><summary>Afficher les valeurs</summary>
      <table className="charts-data" aria-label="Valeurs par motif">
        <thead><tr><th scope="col">Motif</th><th scope="col">Nombre</th><th scope="col">Montant (EUR)</th><th scope="col">Part</th></tr></thead>
        <tbody>{parts.map(part => {
          const motif = result.motifs[part.index];
          return <tr key={motif.code}><td>{motif.code} · {motif.label}</td><td>{motif.count}</td><td className="negative-amount">{formatMontant(decimalFromCents(motif.totalCents))}</td><td>{formatShare(part.ratio)}</td></tr>;
        })}</tbody>
      </table>
    </details>
  </section>;
}
