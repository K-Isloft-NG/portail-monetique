import { renderCsv } from "@/lib/export/csv";
import { renderPdf } from "@/lib/export/pdf";
import { renderXlsx } from "@/lib/export/xlsx";
import type { ReportTable } from "@/lib/export/table";
import type { TreasuryParams } from "@/lib/tresorerie";

export type ExportFormat = "xls" | "csv" | "pdf";
export const EXPORT_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export const EXPORT_LIMIT = 10_000;

export function exportParams(request: Request): TreasuryParams {
  const url = new URL(request.url), params: TreasuryParams = {};
  for (const key of url.searchParams.keys()) { const values = url.searchParams.getAll(key); params[key] = values.length === 1 ? values[0] : values; }
  return params;
}

export function parseExportFormat(value?: string | string[]): ExportFormat | undefined {
  if (value === undefined) return "csv";
  return typeof value === "string" && ["xls", "csv", "pdf"].includes(value) ? value as ExportFormat : undefined;
}

export function exportError(message: string, status = 400) {
  return new Response(message, { status, headers: EXPORT_HEADERS });
}

export function exportFilename(report: ReportTable, format: ExportFormat) {
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(report.extractedAt);
  const scope = report.siren && /^[0-9]{9}$/.test(report.siren) ? report.siren : "tous";
  const base = report.kind === "remise" ? `remise_${(report.remittanceNumber ?? "detail").replace(/[^a-zA-Z0-9-]/g, "") || "detail"}` : report.kind === "impayes-synthese" ? report.kind : `${report.kind}_${scope}`;
  return `${base}_${day}.${format === "xls" ? "xlsx" : format}`;
}

export async function exportResponse(report: ReportTable, format: ExportFormat) {
  // Le plafond est commun : aucun format ne peut lancer un rendu trop volumineux.
  if (report.rows.length > EXPORT_LIMIT) return exportError("Trop de lignes pour un export : affinez les critères.");
  const body = format === "csv" ? renderCsv(report) : format === "pdf" ? renderPdf(report) : new Uint8Array(await renderXlsx(report));
  const mime = { csv: "text/csv; charset=utf-8", pdf: "application/pdf", xls: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  return new Response(body, { headers: { ...EXPORT_HEADERS, "Content-Type": mime[format], "Content-Disposition": `attachment; filename="${exportFilename(report, format)}"` } });
}
