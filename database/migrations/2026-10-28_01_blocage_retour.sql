-- Retire la fin du blocage temporaire et perd les échéances enregistrées.
-- À tester manuellement sur Neon dev d'abord.
-- Retirer le code qui lit la colonne avant d'exécuter ce retour.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE utilisateurs DROP COLUMN IF EXISTS bloque_jusqua;
COMMIT;
