import writeXlsxFile, { type Cell, type SheetData } from "write-excel-file/node";
import { extractionText, totalCells, type ReportColumn, type ReportCell, type ReportTable } from "@/lib/export/table";

export function worksheetName(title: string) {
  return title.replace(/[\\/?*\[\]:]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 31) || "Rapport";
}

function cell(value: ReportCell, column: ReportColumn): Cell {
  if (value === "") return null;
  if (column.type === "amount") {
    // La division intervient seulement à l'écriture de la cellule numérique Excel.
    return { value: (value as number) / 100, type: Number, format: "#,##0.00;[Red]-#,##0.00", align: "right", textColor: (value as number) < 0 ? "#B42318" : "#172B2A" };
  }
  if (column.type === "integer") return { value: Number(value), type: Number, format: "0", align: "right" };
  if (column.type === "date") return { value: new Date(`${value}T00:00:00Z`), type: Date, format: "dd/mm/yyyy" };
  // Le type texte préserve les zéros et empêche une raison sociale de devenir une formule.
  return { value: String(value), type: String, format: "@", wrap: true };
}

export async function renderXlsx(report: ReportTable): Promise<Buffer> {
  const data: SheetData = [
    [{ value: report.title, type: String, fontWeight: "bold" }],
    [{ value: report.subtitle, type: String }],
    [{ value: extractionText(report.extractedAt), type: String }], [],
    report.columns.map(c => ({ value: c.header, type: String, fontWeight: "bold", wrap: true })),
    ...report.rows.map(row => row.map((v, i) => cell(v, report.columns[i]))),
  ];
  if (report.total) data.push(totalCells(report).map((v, i) => ({ ...cell(v, i === 0 ? { header: "", type: "text", align: "left" } : report.columns[i]) as object, fontWeight: "bold" })));
  return writeXlsxFile(data, {
    sheet: worksheetName(report.title.split(" - ")[0]), stickyRowsCount: 5,
    columns: report.columns.map(c => ({ width: c.header.includes("sociale") || c.header.includes("Libellé") ? 42 : c.type === "amount" ? 19 : 22 })),
  }).toBuffer();
}
