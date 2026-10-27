import { neon } from "@neondatabase/serverless";

export async function query(text: string, params: unknown[] = []) {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl?.trim()) {
    throw new Error("La variable DATABASE_URL est absente ou vide.");
  }

  // La configuration est lue à l'appel pour permettre un build sans connexion.
  const sql = neon(databaseUrl);

  // Les valeurs restent séparées du SQL et correspondent aux paramètres $1, $2.
  return sql.query(text, params);
}
