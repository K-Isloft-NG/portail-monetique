import { query } from "@/lib/db";

// Chaque contrôle doit refléter la disponibilité actuelle de la base.
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };

  try {
    await query("SELECT 1");
    return Response.json({ status: "ok" }, { headers });
  } catch {
    // Le détail d'une erreur peut contenir des informations de connexion.
    return Response.json({ status: "erreur" }, { status: 503, headers });
  }
}
