import { randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { query } from "@/lib/db";
import { isSessionData, type SessionData } from "@/lib/session";

export const AUTH_ERROR = "Identifiant ou mot de passe incorrect.";
export type LoginState = { error?: string; warning?: boolean };
type AuthResult = { ok: true; user: SessionData } | { ok: false; warning: boolean };

type AccountRow = {
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

export async function authenticate(login: unknown, password: unknown): Promise<AuthResult> {
  const fallback = await getFallbackHash();
  const normalizedLogin = typeof login === "string" ? login.trim() : "";
  const validInput = normalizedLogin.length > 0 && normalizedLogin.length <= 50 &&
    typeof password === "string" && password.length > 0 &&
    Buffer.byteLength(password, "utf8") <= 72;

  let account: AccountRow | undefined;
  if (validInput) {
    // Le profil et le rattachement sont issus de la base, jamais du formulaire.
    const rows = await query(
      `SELECT u.id, u.login, u.mot_de_passe_hash, u.est_actif,
              p.libelle AS profile, u.numero_siren AS siren
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

  if (!validInput || !account || !matches || !account.est_actif || !isSessionData(account)) {
    let warning = false;
    if (account && !matches) {
      // L'incrément atomique évite de perdre un échec lors de requêtes simultanées.
      const rows = await query(
        `UPDATE utilisateurs
         SET tentatives_echouees = LEAST(tentatives_echouees::integer + 1, 32767)
         WHERE id = $1 RETURNING tentatives_echouees`,
        [account.id],
      );
      warning = account.est_actif && rows[0]?.tentatives_echouees === 2;
    }
    return { ok: false, warning };
  }

  // L'état actif est revérifié avant le succès, sans changer les autres comptes.
  const updated = await query(
    `UPDATE utilisateurs SET tentatives_echouees = 0
     WHERE id = $1 AND est_actif = TRUE RETURNING id`,
    [account.id],
  );
  if (updated.length !== 1) return { ok: false, warning: false };

  return {
    ok: true,
    user: { id: account.id, login: account.login, profile: account.profile, siren: account.siren } as SessionData,
  };
}
