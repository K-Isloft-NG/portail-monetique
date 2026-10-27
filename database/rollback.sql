-- ============================================================
-- Portail monétique : retour arrière du schéma
-- Fichier : database/rollback.sql
-- Supprime toutes les tables créées par schema.sql, dans l'ordre
-- inverse des dépendances. Les données sont perdues : à n'utiliser
-- que sur l'environnement de développement, ou en production après
-- une sauvegarde.
-- ============================================================

DROP TABLE IF EXISTS annonces_tresorerie;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS remises;
DROP TABLE IF EXISTS motifs_impayes;
DROP TABLE IF EXISTS utilisateurs;
DROP TABLE IF EXISTS entreprises;
DROP TABLE IF EXISTS profils;
