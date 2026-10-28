-- Ajoute la fin du blocage temporaire, sans modifier les comptes existants.
-- À exécuter manuellement sur Neon dev d'abord, avant le code qui lit la colonne.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE utilisateurs
    ADD COLUMN IF NOT EXISTS bloque_jusqua TIMESTAMPTZ DEFAULT NULL;
COMMIT;
