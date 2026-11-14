import { axisLabels, chartScale, plotPoints } from "@/lib/graphiques-geometrie";
import { formatMontant } from "@/lib/format";
import { decimalFromCents } from "@/lib/tresorerie";
import { chartPeriod, type ChartsResult } from "@/lib/graphiques";

export default function GraphiqueEvolution({ result }: { result: ChartsResult }) {
  const values = result.evolution.map(point => point.totalCents);
  const scale = chartScale(values);
  const left = 96, top = 59, width = 463, height = 180;
  const points = plotPoints(values, width, height, scale.maximum);
  const baseline = top + height;
  const barWidth = Math.min(37, width / points.length * 0.72);
  const maximum = Math.max(...values.map(Math.abs));
  return <section aria-labelledby="evolution-heading" className="charts-panel">
    <h2 id="evolution-heading">Évolution des impayés</h2>
    <svg className="charts-evolution" viewBox="0 0 600 359" role="img" aria-label={`${chartPeriod(result.criteria)}, total ${formatMontant(decimalFromCents(result.totalCents))} EUR, maximum ${formatMontant(decimalFromCents(maximum))} EUR.`}>
      <title>{`Évolution des impayés en ${result.criteria.type}`}</title>
      <text x="5" y="29">Montant des impayés (EUR)</text>
      {scale.ticks.map(tick => {
        const y = baseline - height * tick / scale.maximum;
        return <g key={tick}><path className="charts-gridline" d={`M ${left} ${y} h ${width}`} /><text x={left - 9} y={y + 7} textAnchor="end">{new Intl.NumberFormat("fr-FR").format(tick / 100)}</text></g>;
      })}
      {result.criteria.type === "histogramme" ? points.map(({ x, y }, index) =>
        <rect key={result.evolution[index].key} className="charts-mark" x={left + x - barWidth / 2} y={top + y} width={barWidth} height={height - y} />,
      ) : <>
        <polyline className="charts-line" points={points.map(({ x, y }) => `${left + x},${top + y}`).join(" ")} />
        {points.map(({ x, y }, index) => <circle key={result.evolution[index].key} className="charts-mark" cx={left + x} cy={top + y} r="3.4" />)}
      </>}
      {axisLabels(points.length).map(index => {
        const x = left + points[index].x, y = baseline + 12;
        return <text key={result.evolution[index].key} x={x} y={y} transform={`rotate(-63 ${x} ${y})`} textAnchor="end">{result.evolution[index].label}</text>;
      })}
    </svg>
    <details className="charts-values"><summary>Afficher les valeurs</summary>
      <table className="charts-data" aria-label="Valeurs de l'évolution">
        <thead><tr><th scope="col">Période</th><th scope="col">Nombre</th><th scope="col">Montant (EUR)</th></tr></thead>
        <tbody>{result.evolution.map(point => <tr key={point.key}>
          <td>{point.label}</td><td>{point.count}</td><td className={point.totalCents < 0 ? "negative-amount" : undefined}>{formatMontant(decimalFromCents(point.totalCents))}</td>
        </tr>)}</tbody>
      </table>
    </details>
  </section>;
}
