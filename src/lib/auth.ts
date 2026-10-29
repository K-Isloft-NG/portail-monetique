import { randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { query } from "@/lib/db";
import { isSessionData, type SessionData } from "@/lib/session";

export const AUTH_ERROR = "Identifiant ou mot de passe incorrect.";
export type LoginState = { error?: string; warning?: boolean };
type AuthResult =
  | { ok: true; user: SessionData }
  | { ok: false; reason: "invalid" | "warning" }
  | { ok: false; reason: "blocked"; minutes: number };

type LockState = { is_blocked: boolean; wait_minutes: number };
type AccountRow = LockState & {
  id: number;
  login: string;
  profile: string;
  siren: string | null;
  mot_de_passe_hash: string;
  est_actif: boolean;
};

let fallbackHash: Promise<string> | undefined;

function getFallbackHash() {
  // Même coût que le jeu de démonstration, sans mot de passe fixé dans les sources.
  fallbackHash ??= hash(randomBytes(32).toString("hex"), 10);
  return fallbackHash;
}

function blockedResult(state: LockState): AuthResult {
  // Une attente incohérente ne doit pas devenir une autorisation.
  if (!Number.isSafeInteger(state.wait_minutes) || state.wait_minutes < 1) {
    throw new Error("État du blocage indisponible.");
  }
  return { ok: false, reason: "blocked", minutes: state.wait_minutes };
}

async function refusalAfterRace(id: number): Promise<AuthResult> {
  // Une requête concurrente a pu bloquer ou désactiver le compte avant l'écriture.
  const rows = await query(
    `SELECT COALESCE(bloque_jusqua > NOW(), FALSE) AS is_blocked,
            CASE WHEN bloque_jusqua > NOW()
              THEN GREATEST(1, CEIL(EXTRACT(EPOCH FROM (bloque_jusqua - NOW())) / 60)::integer)
              ELSE 0 END AS wait_minutes
     FROM utilisateurs WHERE id = $1 AND est_actif = TRUE`,
    [id],
  );
  const state = rows[0] as LockState | undefined;
  return state?.is_blocked ? blockedResult(state) : { ok: false, reason: "invalid" };
}

export async function authenticate(login: unknown, password: unknown): Promise<AuthResult> {
  const fallback = await getFallbackHash();
  const normalizedLogin = typeof login === "string" ? login.trim() : "";
  const validInput = normalizedLogin.length > 0 && normalizedLogin.length <= 50 &&
    typeof password === "string" && password.length > 0 &&
    Buffer.byteLength(password, "utf8") <= 72;

  let account: AccountRow | undefined;
  if (validInput) {
    // L'horloge SQL fournit l'état public sans interpréter une date dans le navigateur.
    const rows = await query(
      `SELECT u.id, u.login, u.mot_de_passe_hash, u.est_actif,
              p.libelle AS profile, u.numero_siren AS siren,
              COALESCE(u.bloque_jusqua > NOW(), FALSE) AS is_blocked,
              CASE WHEN u.bloque_jusqua > NOW()
                THEN GREATEST(1, CEIL(EXTRACT(EPOCH FROM (u.bloque_jusqua - NOW())) / 60)::integer)
                ELSE 0 END AS wait_minutes
       FROM utilisateurs u JOIN profils p ON p.id = u.profil_id
       WHERE u.login = $1`,
      [normalizedLogin],
    );
    account = rows[0] as AccountRow | undefined;
  }

  const matches = await compare(
    validInput ? password : "",
    account?.mot_de_passe_hash ?? fallback,
  );

  if (!validInput || !account || !account.est_actif || !isSessionData(account)) {
    return { ok: false, reason: "invalid" };
  }
  if (account.is_blocked) return blockedResult(account);

  if (!matches) {
    // Compteur et échéance sont calculés ensemble sur la ligne courante, pas sur le SELECT précédent.
    const rows = await query(
      `UPDATE utilisateurs
       SET tentatives_echouees = CASE
             WHEN bloque_jusqua IS NOT NULL AND bloque_jusqua <= NOW() THEN 1
             ELSE LEAST(tentatives_echouees::integer + 1, 3)
           END,
           bloque_jusqua = CASE
             WHEN bloque_jusqua IS NOT NULL AND bloque_jusqua <= NOW() THEN NULL
             WHEN tentatives_echouees >= 2 THEN NOW() + INTERVAL '15 minutes'
             ELSE NULL
           END
       WHERE id = $1 AND est_actif = TRUE
         AND (bloque_jusqua IS NULL OR bloque_jusqua <= NOW())
       RETURNING tentatives_echouees,
                 COALESCE(bloque_jusqua > NOW(), FALSE) AS is_blocked,
                 CASE WHEN bloque_jusqua > NOW()
                   THEN GREATEST(1, CEIL(EXTRACT(EPOCH FROM (bloque_jusqua - NOW())) / 60)::integer)
                   ELSE 0 END AS wait_minutes`,
      [account.id],
    );
    const state = rows[0] as (LockState & { tentatives_echouees: number }) | undefined;
    if (!state) return refusalAfterRace(account.id);
    if (state.is_blocked) return blockedResult(state);
    return { ok: false, reason: state.tentatives_echouees === 2 ? "warning" : "invalid" };
  }

  // Le blocage et l'empreinte sont revérifiés avant le succès ; l'identité retournée est actuelle.
  const updated = await query(
    `UPDATE utilisateurs AS u
     SET tentatives_echouees = 0, bloque_jusqua = NULL
     FROM profils AS p
     WHERE u.id = $1 AND p.id = u.profil_id AND u.est_actif = TRUE
       AND u.mot_de_passe_hash = $2
       AND (u.bloque_jusqua IS NULL OR u.bloque_jusqua <= NOW())
     RETURNING u.id, u.login, p.libelle AS profile, u.numero_siren AS siren`,
    [account.id, account.mot_de_passe_hash],
  );
  if (!updated[0]) return refusalAfterRace(account.id);
  const current = updated[0];
  if (!isSessionData(current)) return { ok: false, reason: "invalid" };

  return {
    ok: true,
    user: { id: current.id, login: current.login, profile: current.profile, siren: current.siren } as SessionData,
  };
}
