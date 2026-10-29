-- Retirer le code dépendant et sécuriser les clés avant ce retour.
-- Une ancienne version sans contrôle SQL ne doit jamais reprendre l'ancienne clé.
-- Vérifier la sauvegarde et la cible ; aucune suppression en cascade générale.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
    IF to_regclass('public.sessions') IS NULL THEN
        RAISE EXCEPTION 'Retour impossible : public.sessions absente';
    END IF;

    LOCK TABLE public.sessions IN ACCESS EXCLUSIVE MODE;

    IF (
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sessions'
    ) <> 5 OR (
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sessions'
          AND (
              (column_name = 'id' AND data_type = 'uuid')
              OR (column_name = 'utilisateur_id' AND data_type = 'integer')
              OR (
                  column_name IN ('date_creation', 'date_expiration', 'date_revocation')
                  AND data_type = 'timestamp with time zone'
              )
          )
    ) <> 5 THEN
        RAISE EXCEPTION 'Retour impossible : structure de sessions inattendue';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.sessions'::regclass
          AND conname = 'sessions_utilisateur_id_fkey'
          AND contype = 'f'
          AND confrelid = 'public.utilisateurs'::regclass
          AND confdeltype = 'c'
          AND convalidated
    ) THEN
        RAISE EXCEPTION 'Retour impossible : référence utilisateur inattendue';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.sessions
        WHERE date_revocation IS NULL AND date_expiration > NOW()
    ) THEN
        RAISE EXCEPTION 'Retour refusé : des sessions sont encore valides';
    END IF;
END;
$$;

DROP TABLE public.sessions;
COMMIT;
