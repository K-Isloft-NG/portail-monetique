import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { displayCell, extractionText, totalCells, type ReportTable } from "@/lib/export/table";

export function pdfText(value: string) {
  // Helvetica standard ne couvre pas Unicode : conserver accents et euro en WinAnsi.
  return value.replace(/[\u00a0\u202f]/g, " ").replace(/\u2212/g, "-").replace(/[^\x20-\x7e\xa0-\xff\u20ac\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u2018\u2019\u201a\u201c\u201d\u201e\u2020\u2021\u2022\u2026\u2030\u2039\u203a]/gu, "?");
}

export function renderPdf(report: ReportTable): Uint8Array<ArrayBuffer> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
  const titleLines = doc.setFont("helvetica", "bold").setFontSize(13).splitTextToSize(pdfText(report.title), width - 24);
  doc.text(titleLines, 12, 16);
  let y = 16 + titleLines.length * 5;
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(73, 88, 86);
  const subtitleLines = doc.splitTextToSize(pdfText(report.subtitle), width - 24);
  doc.text(subtitleLines, 12, y); y += subtitleLines.length * 4 + 2;
  const extracted = pdfText(extractionText(report.extractedAt));
  doc.text(extracted, 12, y);
  const body = report.rows.map(row => row.map((v, i) => pdfText(displayCell(v, report.columns[i]))));
  const foot = report.total ? [totalCells(report).map((v, i) => v === "" ? "" : pdfText(i === 0 ? String(v) : displayCell(v, report.columns[i])))] : [];
  autoTable(doc, {
    startY: y + 5, margin: { top: 12, right: 12, bottom: 17, left: 12 }, theme: "plain",
    head: [report.columns.map(c => pdfText(c.header))], body, foot, showFoot: "lastPage", showHead: "everyPage",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2, textColor: [23, 43, 42], lineColor: [205, 213, 210], lineWidth: { bottom: 0.15 }, overflow: "linebreak" },
    headStyles: { fontStyle: "bold", textColor: [73, 88, 86] }, footStyles: { fontStyle: "bold" },
    columnStyles: Object.fromEntries(report.columns.map((c, i) => [i, { halign: c.align }])),
    didParseCell(data) {
      if (data.section === "head") return;
      const value = data.section === "foot" ? totalCells(report)[data.column.index] : report.rows[data.row.index]?.[data.column.index];
      if (report.columns[data.column.index].type === "amount" && typeof value === "number" && value < 0) data.cell.styles.textColor = [180, 35, 24];
    },
    didDrawCell(data) {
      if (data.section === "foot") {
        doc.setDrawColor(23, 43, 42).setLineWidth(0.2);
        doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
        doc.line(data.cell.x, data.cell.y - 0.6, data.cell.x + data.cell.width, data.cell.y - 0.6);
      }
    },
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page).setFont("helvetica", "normal").setFontSize(8).setTextColor(73, 88, 86);
    doc.text(extracted, 12, height - 8);
    doc.text(`Page ${page} sur ${pages}`, width - 12, height - 8, { align: "right" });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
