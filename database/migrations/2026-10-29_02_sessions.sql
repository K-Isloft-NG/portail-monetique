-- Contrôler la cible : dev d'abord, puis production avant la fusion de develop vers main.
-- Les anciens cookies ne créent aucune ligne : une reconnexion sera nécessaire.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
    IF to_regclass('public.utilisateurs') IS NULL THEN
        RAISE EXCEPTION 'Migration impossible : table public.utilisateurs absente';
    END IF;

    -- Stabiliser le schéma du compte pendant la création de sa dépendance.
    LOCK TABLE public.utilisateurs IN ACCESS EXCLUSIVE MODE;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'utilisateurs'
          AND column_name = 'id' AND data_type = 'integer'
    ) THEN
        RAISE EXCEPTION 'Migration impossible : identifiant utilisateur inattendu';
    END IF;

    IF to_regclass('public.sessions') IS NOT NULL THEN
        RAISE EXCEPTION 'Migration impossible : public.sessions existe déjà';
    END IF;

    IF to_regclass('public.idx_sessions_utilisateur') IS NOT NULL
       OR to_regclass('public.idx_sessions_expiration') IS NOT NULL THEN
        RAISE EXCEPTION 'Migration impossible : nom d index déjà utilisé';
    END IF;
END;
$$;

CREATE TABLE public.sessions (
    id                  UUID PRIMARY KEY,
    utilisateur_id      INTEGER NOT NULL
                        CONSTRAINT sessions_utilisateur_id_fkey
                        REFERENCES public.utilisateurs (id) ON DELETE CASCADE,
    date_creation       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_expiration     TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '8 hours'),
    date_revocation     TIMESTAMPTZ DEFAULT NULL,
    CONSTRAINT sessions_revocation_check
        CHECK (date_revocation IS NULL OR date_revocation >= date_creation)
);

CREATE INDEX idx_sessions_utilisateur
    ON public.sessions (utilisateur_id);
CREATE INDEX idx_sessions_expiration
    ON public.sessions (date_expiration, id);

COMMIT;
