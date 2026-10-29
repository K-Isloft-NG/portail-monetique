import { query } from "@/lib/db";
import type { VerifiedSession } from "@/lib/session";

async function sessionQuery(sql: string, params: unknown[]) {
  try { return await query(sql, params); }
  catch { throw new Error("Déconnexion indisponible. Réessayez."); }
}
export async function revokeCurrentSession(session: VerifiedSession) {
  // Le propriétaire vient du cookie signé, jamais du formulaire.
  await sessionQuery(`-- Ne modifier que la session dont le propriétaire est celui du cookie signé.
UPDATE public.sessions
SET date_revocation = NOW()
WHERE id = $1::uuid AND utilisateur_id = $2
  AND date_revocation IS NULL
RETURNING id;`, [session.sessionId, session.id]);
}
export async function revokeAllSessions(session: VerifiedSession) {
  // Une session déjà révoquée ne peut pas fermer les nouvelles connexions.
  await sessionQuery(`-- Une ancienne session révoquée ne doit pas fermer des sessions créées ensuite.
UPDATE public.sessions AS target
SET date_revocation = NOW()
WHERE target.utilisateur_id = $1
  AND target.date_revocation IS NULL
  AND EXISTS (
      SELECT 1
      FROM public.sessions current_session
      JOIN public.utilisateurs u ON u.id = current_session.utilisateur_id
      JOIN public.profils p ON p.id = u.profil_id
      WHERE current_session.id = $2::uuid AND u.id = $1
        AND current_session.date_revocation IS NULL
        AND current_session.date_expiration > NOW()
        AND u.est_actif = TRUE AND p.libelle = $3
        AND u.numero_siren IS NOT DISTINCT FROM $4
  )
RETURNING target.id;`, [session.id, session.sessionId, session.profile, session.siren]);
}
export async function purgeExpiredSessions() {
  // Une maintenance en retard ne prolonge aucun accès : la garde contrôle l'expiration.
  try { await query(`-- Borner la maintenance et ne pas attendre une ligne déjà traitée ailleurs.
WITH old_sessions AS (
    SELECT id FROM public.sessions
    WHERE date_expiration < NOW() - INTERVAL '1 day'
    ORDER BY date_expiration, id
    LIMIT 100
    FOR UPDATE SKIP LOCKED
)
DELETE FROM public.sessions s
USING old_sessions old
WHERE s.id = old.id;`); } catch { /* La prochaine connexion retentera le lot borné. */ }
}
