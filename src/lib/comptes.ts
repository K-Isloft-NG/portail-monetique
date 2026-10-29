import { randomInt } from "node:crypto";
import { hash } from "bcryptjs";
import { query } from "@/lib/db";

export type AccountValues = { siren: string; companyName: string; login: string; agreement: boolean };
export type AccountField = keyof AccountValues;
export type AccountErrors = Partial<Record<AccountField, string>>;
export type CreateAccountState = { values?: AccountValues; errors?: AccountErrors; error?: string; password?: string; createdLogin?: string };
export type ManagedAccount = {
  id: number; login: string; profile: "client" | "po"; numero_siren: string | null;
  raison_sociale: string | null; est_actif: boolean; is_blocked: boolean; state: string;
};
type AccountErrorCode = "siren-exists" | "login-exists" | "unavailable";
const ERROR_TEXT: Record<AccountErrorCode, string> = {
  "siren-exists": "Ce SIREN a déjà un compte.",
  "login-exists": "Cet identifiant est déjà utilisé.",
  unavailable: "Compte introuvable, déjà dans cet état ou action interdite.",
};
export class AccountError extends Error {
  constructor(public code: AccountErrorCode) { super(ERROR_TEXT[code]); }
}
export class AccountTechnicalError extends Error {
  constructor() { super("Gestion des comptes indisponible. Réessayez plus tard."); }
}
const ADMIN_MESSAGES = {
  disabled: { text: "Compte désactivé. Son historique est conservé.", error: false },
  unlocked: { text: "Compte débloqué.", error: false },
  unavailable: { text: ERROR_TEXT.unavailable, error: true },
  technical: { text: "Gestion des comptes indisponible. Réessayez plus tard.", error: true },
};
export function getAdminMessage(value: unknown) {
  return typeof value === "string" && Object.hasOwn(ADMIN_MESSAGES, value) ? ADMIN_MESSAGES[value as keyof typeof ADMIN_MESSAGES] : undefined;
}

export function validateAccount(values: AccountValues): AccountErrors {
  const errors: AccountErrors = {};
  if (!/^[0-9]{9}$/.test(values.siren)) errors.siren = "Saisissez exactement 9 chiffres pour le SIREN.";
  const name = values.companyName.trim();
  if (Array.from(name).length < 1 || Array.from(name).length > 20 || /\p{Cc}/u.test(values.companyName)) errors.companyName = "Saisissez une raison sociale de 1 à 20 caractères, sans caractère de contrôle.";
  if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(values.login)) errors.login = "Utilisez 3 à 50 minuscules, chiffres, points, tirets ou tirets bas, avec une lettre ou un chiffre au début.";
  if (values.agreement !== true) errors.agreement = "Cochez l'accord du Product Owner.";
  return errors;
}
export function parseAccountId(value: unknown): number | null {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}
export function generateInitialPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ", lower = "abcdefghijkmnopqrstuvwxyz", digits = "23456789";
  const alphabet = upper + lower + digits;
  const characters = [upper[randomInt(upper.length)], lower[randomInt(lower.length)], digits[randomInt(digits.length)]];
  while (characters.length < 14) characters.push(alphabet[randomInt(alphabet.length)]);
  // Mélanger les trois classes imposées évite de révéler leur position.
  for (let i = characters.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }
  return characters.join("");
}
async function accountQuery(text: string, params: unknown[]) {
  try { return await query(text, params); }
  catch (error) {
    // Lire le code et la contrainte, jamais le message susceptible de contenir des valeurs.
    const detail = error as { code?: string; constraint?: string };
    if (detail?.code === "23505" && detail.constraint === "entreprises_pkey") throw new AccountError("siren-exists");
    if (detail?.code === "23505" && detail.constraint === "utilisateurs_login_key") throw new AccountError("login-exists");
    throw new AccountTechnicalError();
  }
}
// Revalider et verrouiller l'acteur dans l'écriture couvre une désactivation après la garde.
const ACTOR_SQL = `SELECT u.id FROM utilisateurs u JOIN profils p ON p.id = u.profil_id
                  WHERE u.id = $1 AND p.libelle = 'admin' AND u.est_actif = TRUE
                  FOR SHARE OF u`;
const ACCOUNT_COLUMNS = `u.id, u.login, p.libelle AS profile, u.numero_siren, e.raison_sociale, u.est_actif,
    COALESCE(u.est_actif AND u.bloque_jusqua > NOW(), FALSE) AS is_blocked,
    CASE WHEN NOT u.est_actif THEN 'Désactivé'
         WHEN u.bloque_jusqua > NOW() THEN 'Bloqué jusqu''à ' ||
           to_char(u.bloque_jusqua AT TIME ZONE 'Europe/Paris',
             CASE WHEN (u.bloque_jusqua AT TIME ZONE 'Europe/Paris')::date =
                       (NOW() AT TIME ZONE 'Europe/Paris')::date
                  THEN 'HH24:MI' ELSE 'DD/MM/YYYY HH24:MI' END)
         ELSE 'Actif' END AS state`;
export async function listAccounts(): Promise<ManagedAccount[]> {
  // Ne sélectionner que l'identité et l'état opérationnel, sans empreinte ni données financières.
  return await accountQuery(
    `SELECT ${ACCOUNT_COLUMNS} FROM utilisateurs u JOIN profils p ON p.id = u.profil_id
     LEFT JOIN entreprises e ON e.numero_siren = u.numero_siren
     WHERE p.libelle IN ('client', 'po') ORDER BY p.libelle, u.login`, [],
  ) as ManagedAccount[];
}
export async function getAccountForDisable(actorId: number, id: number): Promise<ManagedAccount | null> {
  if (id === actorId) return null;
  // La confirmation ne concerne qu'un client actif, jamais un administrateur.
  const rows = await accountQuery(
    `SELECT ${ACCOUNT_COLUMNS} FROM utilisateurs u JOIN profils p ON p.id = u.profil_id
     LEFT JOIN entreprises e ON e.numero_siren = u.numero_siren
     WHERE u.id = $1 AND u.id <> $2 AND p.libelle = 'client' AND u.est_actif = TRUE`, [id, actorId],
  );
  return (rows[0] as ManagedAccount | undefined) ?? null;
}
export async function createAccount(actorId: number, values: AccountValues) {
  if (Object.keys(validateAccount(values)).length) throw new AccountError("unavailable");
  const initial = generateInitialPassword();
  const passwordHash = await hash(initial, 10);
  // Lier les insertions garantit qu'une erreur annule l'entreprise et le compte.
  // Vérifier le profil client avant l'entreprise évite une ligne orpheline.
  const rows = await accountQuery(
    `WITH actor AS (${ACTOR_SQL}), client_profile AS (
       SELECT id FROM profils WHERE libelle = 'client'
     ), new_company AS (
       INSERT INTO entreprises (numero_siren, raison_sociale)
       SELECT $2, $3 FROM actor CROSS JOIN client_profile RETURNING numero_siren
     )
     INSERT INTO utilisateurs (login, mot_de_passe_hash, profil_id, numero_siren)
     SELECT $4, $5, p.id, e.numero_siren FROM new_company e CROSS JOIN client_profile p
     RETURNING id`,
    [actorId, values.siren, values.companyName.trim(), values.login, passwordHash],
  );
  if (!rows[0]) throw new AccountError("unavailable");
  return { id: rows[0].id as number, password: initial };
}
export async function disableAccount(actorId: number, id: number) {
  if (id === actorId) throw new AccountError("unavailable");
  // Verrouiller la cible puis lier les modifications conserve l'historique et l'atomicité.
  const rows = await accountQuery(
    `WITH actor AS (${ACTOR_SQL}), target AS (
       SELECT u.id, u.numero_siren FROM utilisateurs u JOIN profils p ON p.id = u.profil_id
       WHERE u.id = $2 AND u.id <> $1 AND p.libelle = 'client' AND u.est_actif = TRUE
         AND u.numero_siren IS NOT NULL AND EXISTS (SELECT 1 FROM actor)
       FOR UPDATE OF u
     ), disabled_company AS (
       UPDATE entreprises e SET est_active = FALSE FROM target t
       WHERE e.numero_siren = t.numero_siren RETURNING e.numero_siren
     )
     UPDATE utilisateurs u SET est_actif = FALSE
     FROM target t JOIN disabled_company e ON e.numero_siren = t.numero_siren
     WHERE u.id = t.id AND u.id <> $1 AND u.est_actif = TRUE RETURNING u.id`, [actorId, id],
  );
  if (!rows[0]) throw new AccountError("unavailable");
}
export async function unlockAccount(actorId: number, id: number) {
  if (id === actorId) throw new AccountError("unavailable");
  // Revérifier le blocage dans l'écriture couvre un bouton issu d'une ancienne page.
  const rows = await accountQuery(
    `WITH actor AS (${ACTOR_SQL})
     UPDATE utilisateurs u SET tentatives_echouees = 0, bloque_jusqua = NULL
     FROM profils p WHERE u.id = $2 AND u.id <> $1 AND p.id = u.profil_id
       AND p.libelle IN ('client', 'po') AND u.est_actif = TRUE
       AND u.bloque_jusqua > NOW() AND EXISTS (SELECT 1 FROM actor) RETURNING u.id`, [actorId, id],
  );
  if (!rows[0]) throw new AccountError("unavailable");
}
