import { getClientCompany, requireTreasuryProfile } from "@/lib/access";
import { renderChartsPdf } from "@/lib/export/graphiques-pdf";
import { EXPORT_HEADERS, exportError, exportParams } from "@/lib/export/reponse";
import { chartDay, readCharts } from "@/lib/graphiques";

export async function GET(request: Request) {
  const session = await requireTreasuryProfile();
  const result = await readCharts(exportParams(request), session.profile === "po" ? "po" : "client");
  if (result.criteria.error) return exportError(result.criteria.error);
  const company = session.profile === "client" ? (await getClientCompany()).company : undefined;
  const filename = `graphiques_${company?.numero_siren ?? "tous"}_${chartDay(result.extractedAt)}.pdf`;
  return new Response(renderChartsPdf(result, company), {
    headers: { ...EXPORT_HEADERS, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
