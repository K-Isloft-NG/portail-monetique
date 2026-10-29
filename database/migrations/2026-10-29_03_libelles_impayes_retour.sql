-- Restaure les anciens textes sans tronquer et conserve la sauvegarde.
-- Contrôler la cible et tester manuellement sur la branche dev d'abord.
-- Ne pas exécuter sans avoir retiré tout code qui affiche un libellé long.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Empêcher un changement de dictionnaire pendant les vérifications du retour.
LOCK TABLE motifs_impayes IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
    IF to_regclass('sauvegarde_motifs_20261029') IS NULL THEN
        RAISE EXCEPTION 'Retour impossible : sauvegarde_motifs_20261029 est absente';
    END IF;

    -- Une sauvegarde contrôlée ne doit plus changer avant sa restauration.
    LOCK TABLE sauvegarde_motifs_20261029 IN SHARE MODE;
    IF (SELECT COUNT(*) FROM motifs_impayes) <> 8
       OR (SELECT COUNT(DISTINCT code) FROM motifs_impayes) <> 8
       OR EXISTS (
           SELECT 1 FROM motifs_impayes
           WHERE code IS NULL OR code NOT IN ('01', '02', '03', '04', '05', '06', '07', '08')
       )
    THEN
        RAISE EXCEPTION 'Retour impossible : exactement les huit codes 01 à 08 sont requis';
    END IF;

    IF (SELECT COUNT(*) FROM sauvegarde_motifs_20261029) <> 8
       OR (SELECT COUNT(DISTINCT code) FROM sauvegarde_motifs_20261029) <> 8
       OR EXISTS (
           SELECT 1 FROM sauvegarde_motifs_20261029
           WHERE code IS NULL OR code NOT IN ('01', '02', '03', '04', '05', '06', '07', '08')
              OR libelle IS NULL OR description IS NULL OR char_length(libelle) > 20
       )
    THEN
        RAISE EXCEPTION 'Retour impossible : vérifier les huit codes et les anciens textes de la sauvegarde';
    END IF;
END;
$$;

-- Restaurer les textes courts avant de réduire le type, sans conversion forcée.
UPDATE motifs_impayes AS m
SET libelle = s.libelle, description = s.description
FROM sauvegarde_motifs_20261029 AS s
WHERE m.code = s.code;
ALTER TABLE motifs_impayes ALTER COLUMN libelle TYPE VARCHAR(20);
COMMIT;
