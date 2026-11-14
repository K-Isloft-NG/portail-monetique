import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { pdfText } from "@/lib/export/pdf";
import { chartTitles, extractionText } from "@/lib/export/table";
import { formatMontant } from "@/lib/format";
import { chartPeriod, EMPTY_CHARTS, type ChartsResult } from "@/lib/graphiques";
import { axisLabels, chartScale, circlePoint, formatShare, motifColor, pieSlices, plotPoints } from "@/lib/graphiques-geometrie";
import { decimalFromCents } from "@/lib/tresorerie";
import type { Merchant } from "@/lib/access";

const MARGIN = 12;
const INK = "#172b2a";
const TEAL = "#17605d";
const DEBIT = "#b42318";
const amount = (cents: number) => pdfText(formatMontant(decimalFromCents(cents)));

function heading(doc: jsPDF, title: string, subtitle: string) {
  const lines: string[] = doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(INK)
    .splitTextToSize(pdfText(title), doc.internal.pageSize.getWidth() - 2 * MARGIN);
  doc.text(lines, MARGIN, 15);
  const y = 15 + 5 * lines.length;
  doc.setFont("helvetica", "normal").setFontSize(9).text(pdfText(subtitle), MARGIN, y);
  return y + 7;
}

function drawEvolution(doc: jsPDF, result: ChartsResult, y: number) {
  const values = result.evolution.map(point => point.totalCents);
  const scale = chartScale(values);
  const left = 31, top = y + 8, width = 249, height = 43;
  const points = plotPoints(values, width, height, scale.maximum);
  const baseline = top + height;
  doc.setFontSize(8).setTextColor(INK).text(pdfText("Montant des impayés (EUR)"), MARGIN, y + 2);
  for (const tick of scale.ticks) {
    const tickY = baseline - height * tick / scale.maximum;
    doc.setDrawColor("#cdd5d2").setLineWidth(0.2).line(left, tickY, left + width, tickY);
    doc.text(pdfText(new Intl.NumberFormat("fr-FR").format(tick / 100)), left - 2, tickY + 1, { align: "right" });
  }
  doc.setDrawColor(TEAL).setFillColor(TEAL).setLineWidth(0.55);
  if (result.criteria.type === "courbe") {
    points.forEach(({ x, y: pointY }, index) => {
      const previous = points[index - 1];
      if (previous) doc.line(left + previous.x, top + previous.y, left + x, top + pointY);
      doc.circle(left + x, top + pointY, 0.65, "F");
    });
  } else {
    const barWidth = Math.min(12, width / points.length * 0.72);
    points.forEach(({ x, y: pointY }) => {
      if (pointY < height) doc.rect(left + x - barWidth / 2, top + pointY, barWidth, height - pointY, "F");
    });
  }
  for (const index of axisLabels(points.length)) {
    doc.text(result.evolution[index].label, left + points[index].x, baseline + 5, { align: "center" });
  }

  // Au plus 62 jours : trois colonnes de 21 lignes tiennent sous le tracé sur une page.
  const columnCount = values.length > 42 ? 3 : values.length > 21 ? 2 : 1;
  const tableWidth = (doc.internal.pageSize.getWidth() - 2 * MARGIN - 6 * (columnCount - 1)) / columnCount;
  for (let column = 0; column < columnCount; column++) {
    const rows = result.evolution.slice(column * 21, (column + 1) * 21);
    autoTable(doc, {
      startY: baseline + 9, margin: { left: MARGIN + column * (tableWidth + 6), bottom: 13 }, tableWidth,
      theme: "striped", head: [["Période", "Nombre", "Montant (EUR)"]],
      body: rows.map(row => [row.label, row.count, amount(row.totalCents)]),
      styles: { font: "helvetica", fontSize: 7.5, cellPadding: 0.7, textColor: INK },
      headStyles: { fillColor: TEAL, textColor: "#ffffff" },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
      didParseCell({ section, row, column, cell }) {
        if (section === "body" && column.index === 2 && rows[row.index].totalCents < 0) cell.styles.textColor = DEBIT;
      },
    });
  }
}

function drawMotifs(doc: jsPDF, result: ChartsResult, y: number) {
  const parts = pieSlices(result.motifs.map(row => row.totalCents));
  const centerX = 51, centerY = y + 33, radius = 29;
  let legendY = y + 4;
  for (const part of parts) {
    const row = result.motifs[part.index];
    const color = motifColor(row.code);
    doc.setFillColor(color).setDrawColor("#ffffff").setLineWidth(0.4);
    if (part.full) doc.circle(centerX, centerY, radius, "F");
    else {
      // Un sommet tous les six degrés environ conserve l'arc sous forme vectorielle.
      const segments = Math.ceil((part.end - part.start) / (Math.PI / 30));
      let previous = { x: centerX, y: centerY };
      const edges: [number, number][] = [];
      for (let index = 0; index <= segments; index++) {
        const next = circlePoint(centerX, centerY, radius, part.start + (part.end - part.start) * index / segments);
        edges.push([next.x - previous.x, next.y - previous.y]);
        previous = next;
      }
      doc.lines(edges, centerX, centerY, [1, 1], "FD", true);
    }
    doc.setFillColor(color).rect(92, legendY - 2.3, 3, 3, "F");
    doc.setTextColor(INK).setFontSize(8);
    const lines: string[] = doc.splitTextToSize(pdfText(`${row.code} · ${row.label} · ${row.count} · ${amount(row.totalCents)} EUR · ${formatShare(part.ratio)}`), 184);
    doc.text(lines, 98, legendY);
    legendY += lines.length * 4 + 2;
  }
  autoTable(doc, {
    startY: Math.max(y + 66, legendY + 2), margin: { left: MARGIN, right: MARGIN, bottom: 13 }, theme: "striped",
    head: [["Motif", "Nombre", "Montant (EUR)", "Part"]],
    body: parts.map(part => {
      const row = result.motifs[part.index];
      return [pdfText(`${row.code} · ${row.label}`), row.count, amount(row.totalCents), formatShare(part.ratio)];
    }),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.4, textColor: INK },
    headStyles: { fillColor: TEAL, textColor: "#ffffff" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right", textColor: DEBIT }, 3: { halign: "right" } },
  });
}

export function renderChartsPdf(result: ChartsResult, company?: Merchant): Uint8Array<ArrayBuffer> {
  const doc = new jsPDF({ orientation: "landscape", format: "a4", unit: "mm" });
  const titles = chartTitles(company), period = chartPeriod(result.criteria);
  const hasUnpaid = result.evolution.some(point => point.count > 0) || result.companyCount > 0;
  if (company) {
    const type = result.criteria.type === "courbe" ? "Courbe" : "Histogramme";
    const evolutionY = heading(doc, titles.evolution, `${period} · ${type}`);
    if (hasUnpaid) drawEvolution(doc, result, evolutionY);
    else doc.text(pdfText(EMPTY_CHARTS), MARGIN, evolutionY + 5);
    doc.addPage();
  }
  const summary = company ? period : `${period} · ${result.companyCount} ${result.companyCount === 1 ? "entreprise concernée" : "entreprises concernées"}`;
  const motifsY = heading(doc, titles.motifs, summary);
  if (result.motifs.length > 0) drawMotifs(doc, result, motifsY);
  else doc.text(pdfText(hasUnpaid ? "Aucun motif avec un montant non nul pour cette période." : EMPTY_CHARTS), MARGIN, motifsY + 5);

  const pages = doc.getNumberOfPages(), height = doc.internal.pageSize.getHeight(), width = doc.internal.pageSize.getWidth();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page).setFont("helvetica", "normal").setFontSize(8).setTextColor(INK);
    doc.text(pdfText(extractionText(result.extractedAt)), MARGIN, height - 7);
    doc.text(`Page ${page} sur ${pages}`, width - MARGIN, height - 7, { align: "right" });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
