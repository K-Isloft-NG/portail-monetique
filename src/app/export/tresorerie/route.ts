import { requireTreasuryProfile } from "@/lib/access";
import { readTreasury, type TreasuryParams } from "@/lib/tresorerie";
import { buildTreasuryCsv, treasuryCsvFilename } from "@/lib/csv";

export async function GET(request: Request) {
  // La route de téléchargement vérifie les mêmes droits que les pages, sans proxy.
  await requireTreasuryProfile();
  const url = new URL(request.url);
  const params: TreasuryParams = {};
  for (const key of url.searchParams.keys()) {
    const values = url.searchParams.getAll(key);
    params[key] = values.length === 1 ? values[0] : values;
  }
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (typeof params.format === "string" && params.format !== "csv") return new Response("Seul le format CSV est disponible.", { status: 400, headers });
  const result = await readTreasury(params);
  if (result.error) return new Response(result.error, { status: 400, headers });
  return new Response(buildTreasuryCsv(result.rows), { headers: {
    ...headers, "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${treasuryCsvFilename(result.siren)}"`,
  } });
}
