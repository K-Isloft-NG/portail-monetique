import { getClientCompany, getPoCompany, requireTreasuryProfile } from "@/lib/access";
import { readUnpaid } from "@/lib/impayes";
import { unpaidReport, unpaidSummaryReport } from "@/lib/export/table";
import { exportError, exportParams, exportResponse, parseExportFormat } from "@/lib/export/reponse";

export async function GET(request: Request) {
  // Le serveur décide aussi du droit à la synthèse, même si le bouton est absent.
  const session = await requireTreasuryProfile();
  const params = exportParams(request), format = parseExportFormat(params.format);
  if (!format) return exportError("Choisissez un format XLS, CSV ou PDF.");
  if (params.vue !== undefined && params.vue !== "synthese") return exportError("Choisissez une vue d'impayés valide.");
  const summary = params.vue === "synthese";
  if (summary && session.profile !== "po") return exportError("La synthèse est réservée au Product Owner.", 403);
  const result = await readUnpaid(params, summary);
  if (result.criteria.error) return exportError(result.criteria.error);
  const company = result.siren ? session.profile === "client" ? (await getClientCompany()).company : (await getPoCompany(result.siren)).company : undefined;
  return exportResponse(summary ? unpaidSummaryReport(result, company) : unpaidReport(result, company), format);
}
