-- Conserve les huit libellés complets et synchronise leur description.
-- Contrôler la cible avant toute exécution manuelle : branche dev d'abord,
-- puis production avant la fusion de develop vers main.
-- La sauvegarde contient seulement le dictionnaire des motifs, sans compte.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Garder les mêmes lignes entre le contrôle, la sauvegarde et la modification.
LOCK TABLE motifs_impayes IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
    IF (SELECT COUNT(*) FROM motifs_impayes) <> 8
       OR (SELECT COUNT(DISTINCT code) FROM motifs_impayes) <> 8
       OR EXISTS (
           SELECT 1 FROM motifs_impayes
           WHERE code IS NULL OR code NOT IN ('01', '02', '03', '04', '05', '06', '07', '08')
       )
    THEN
        RAISE EXCEPTION 'Migration impossible : exactement les huit codes 01 à 08 sont requis';
    END IF;

    IF EXISTS (SELECT 1 FROM motifs_impayes WHERE char_length(libelle) > 20) THEN
        RAISE EXCEPTION 'Migration impossible : un ancien libellé dépasse 20 caractères';
    END IF;

    -- Ne pas réutiliser un instantané dont l'origine n'a pas été contrôlée.
    IF to_regclass('sauvegarde_motifs_20261029') IS NOT NULL THEN
        RAISE EXCEPTION 'Migration impossible : sauvegarde_motifs_20261029 existe déjà, contrôler son origine';
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS sauvegarde_motifs_20261029 AS
    SELECT code, libelle, description FROM motifs_impayes;
ALTER TABLE motifs_impayes ALTER COLUMN libelle TYPE VARCHAR(80);

-- Les codes restent stables pour préserver les identifiants et les références.
UPDATE motifs_impayes AS m
SET libelle = v.libelle, description = v.libelle
FROM (VALUES
    ('01', 'Fraude à la carte'),
    ('02', 'Compte à découvert'),
    ('03', 'Compte clôturé'),
    ('04', 'Compte bloqué'),
    ('05', 'Provision insuffisante'),
    ('06', 'Opération contestée par le débiteur'),
    ('07', 'Titulaire décédé'),
    ('08', 'Raison non communiquée, contactez la banque du client')
) AS v(code, libelle)
WHERE m.code = v.code;
COMMIT;
