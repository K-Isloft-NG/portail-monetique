import { notFound } from "next/navigation";
import { getClientCompany, getPoCompany, requireTreasuryProfile } from "@/lib/access";
import { readRemittanceForExport, readRemittances } from "@/lib/remises";
import { remittanceDetailReport, remittancesReport } from "@/lib/export/table";
import { exportError, exportParams, exportResponse, parseExportFormat } from "@/lib/export/reponse";

export async function GET(request: Request) {
  // Les mêmes gardes imposent le profil et le SIREN, sans faire confiance au formulaire.
  const session = await requireTreasuryProfile();
  const params = exportParams(request), format = parseExportFormat(params.format);
  if (!format) return exportError("Choisissez un format XLS, CSV ou PDF.");
  if (params.remise !== undefined) {
    const data = await readRemittanceForExport(params);
    if (data.criteria.error) return exportError(data.criteria.error);
    if (!data.remittance || !data.result) notFound();
    const company = { numero_siren: data.remittance.numero_siren, raison_sociale: data.remittance.raison_sociale };
    return exportResponse(remittanceDetailReport(data.result, data.remittance, company), format);
  }
  const result = await readRemittances(params, true);
  if (result.criteria.error) return exportError(result.criteria.error);
  const company = result.siren ? session.profile === "client" ? (await getClientCompany()).company : (await getPoCompany(result.siren)).company : undefined;
  return exportResponse(remittancesReport(result, company), format);
}
