-- Retirer d'abord le code qui lit ou écrit ces colonnes.
-- Contrôler la cible et tester sur dev avant tout retour sur production.
-- Refuser toute perte de trace : si une valeur existe, préparer un retour
-- distinct avec sauvegarde validée ; ce script n'efface jamais un accord renseigné.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
    IF to_regclass('public.utilisateurs') IS NULL THEN
        RAISE EXCEPTION 'Retour impossible : table public.utilisateurs absente';
    END IF;
    LOCK TABLE public.utilisateurs IN ACCESS EXCLUSIVE MODE;
    IF (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'utilisateurs'
          AND column_name IN ('accord_po_le', 'cree_par')) <> 2 THEN
        RAISE EXCEPTION 'Retour impossible : les deux colonnes sont requises';
    END IF;
    -- Vérifier chaque colonne, même si une seule des deux a été renseignée.
    IF EXISTS (SELECT 1 FROM public.utilisateurs
               WHERE accord_po_le IS NOT NULL OR cree_par IS NOT NULL) THEN
        RAISE EXCEPTION 'Retour refusé : des traces existent, une sauvegarde et un retour adaptés sont requis';
    END IF;
END;
$$;
ALTER TABLE public.utilisateurs
    DROP COLUMN cree_par,
    DROP COLUMN accord_po_le;
COMMIT;
