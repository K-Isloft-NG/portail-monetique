import { csvText } from "@/lib/csv";
import { decimalFromCents, formatTreasuryDate } from "@/lib/tresorerie";
import type { ReportTable } from "@/lib/export/table";

export function renderCsv(report: ReportTable) {
  const lines = [report.columns.map(c => csvText(c.header)).join(";")];
  for (const row of report.rows) {
    lines.push(row.map((value, index) => {
      const type = report.columns[index].type;
      if (type === "amount") return decimalFromCents(value as number).replace(".", ",");
      if (type === "integer") return String(value);
      return csvText(type === "date" ? formatTreasuryDate(String(value)) : String(value));
    }).join(";"));
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
