-- Conserve la date de l'accord et l'administrateur à l'origine d'un nouveau client.
-- Contrôler la cible : branche dev d'abord, puis production avant la fusion
-- de develop vers main. Les comptes existants restent sans accord renseigné.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
    IF to_regclass('public.utilisateurs') IS NULL THEN
        RAISE EXCEPTION 'Migration impossible : table public.utilisateurs absente';
    END IF;
    -- Stabiliser la structure entre le contrôle et l'ajout des colonnes.
    LOCK TABLE public.utilisateurs IN ACCESS EXCLUSIVE MODE;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'utilisateurs'
          AND column_name IN ('accord_po_le', 'cree_par')
    ) THEN
        RAISE EXCEPTION 'Migration impossible : accord_po_le ou cree_par existe déjà';
    END IF;
END;
$$;
ALTER TABLE public.utilisateurs
    ADD COLUMN accord_po_le TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN cree_par INTEGER DEFAULT NULL
        CONSTRAINT utilisateurs_cree_par_fkey REFERENCES public.utilisateurs (id);
COMMIT;
