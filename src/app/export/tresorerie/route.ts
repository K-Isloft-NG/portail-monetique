import { getClientCompany, getPoCompany, requireTreasuryProfile } from "@/lib/access";
import { readTreasury } from "@/lib/tresorerie";
import { treasuryReport } from "@/lib/export/table";
import { exportError, exportParams, exportResponse, parseExportFormat } from "@/lib/export/reponse";

export async function GET(request: Request) {
  // La route de téléchargement vérifie les mêmes droits que les pages, sans proxy.
  const session = await requireTreasuryProfile();
  const params = exportParams(request);
  const format = parseExportFormat(params.format);
  if (!format) return exportError("Choisissez un format XLS, CSV ou PDF.");
  const result = await readTreasury(params);
  if (result.error) return exportError(result.error);
  // Le titre utilise une entreprise relue dans le périmètre autorisé, même sans résultat.
  const company = result.siren ? session.profile === "client" ? (await getClientCompany()).company : (await getPoCompany(result.siren)).company : undefined;
  return exportResponse(treasuryReport(result, company), format);
}
