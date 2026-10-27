import { notFound, redirect } from "next/navigation";
import { query } from "@/lib/db";
import { isSessionData, PROFILE_PATHS, readSession, type Profile, type SessionData } from "@/lib/session";

export type Merchant = { numero_siren: string; raison_sociale: string };

async function readRows(text: string, params: unknown[] = []) {
  try {
    return await query(text, params);
  } catch {
    // Le message du pilote ne doit pas atteindre les erreurs de rendu du serveur.
    throw new Error("Lecture des données indisponible.");
  }
}

export async function requireProfile(expectedProfile: Profile) {
  const session = await readSession();
  if (!session) redirect("/login");

  // Un compte désactivé ou déplacé depuis la connexion perd immédiatement cet accès.
  const rows = await readRows(
    `SELECT u.id, u.login, u.est_actif, p.libelle AS profile, u.numero_siren AS siren
     FROM utilisateurs u JOIN profils p ON p.id = u.profil_id
     WHERE u.id = $1`,
    [session.id],
  );
  const current = rows[0];
  const isActive = current?.est_actif === true;
  if (
    !isSessionData(current) || !isActive ||
    current.profile !== session.profile || current.siren !== session.siren
  ) redirect("/login");

  if (session.profile !== expectedProfile) redirect(PROFILE_PATHS[session.profile]);
  return session;
}

export function getAuthorizedSiren(session: SessionData, requestedSiren?: string) {
  if (session.profile !== "client") redirect(PROFILE_PATHS[session.profile]);
  if (requestedSiren !== undefined && requestedSiren !== session.siren) redirect("/client");
  return session.siren;
}

export async function getClientCompany(requestedSiren?: string) {
  const session = await requireProfile("client");
  const siren = getAuthorizedSiren(session, requestedSiren);

  // Le paramètre de lecture est le SIREN signé, même quand l'URL en contient un.
  const rows = await readRows(
    "SELECT numero_siren, raison_sociale FROM entreprises WHERE numero_siren = $1",
    [siren],
  );
  if (!rows[0]) notFound();
  return { session, company: rows[0] as Merchant };
}

export async function getMerchants() {
  const session = await requireProfile("po");

  // Le PO supervise toutes les entreprises ; aucun filtre par compte ne s'applique ici.
  const rows = await readRows(
    "SELECT numero_siren, raison_sociale FROM entreprises ORDER BY raison_sociale",
  );
  return { session, merchants: rows as Merchant[] };
}
