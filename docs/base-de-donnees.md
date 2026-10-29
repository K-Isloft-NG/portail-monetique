# Initialiser la base de production Neon

Procédure appliquée le 27/10/2026 sur la branche de production du projet Neon. Les requêtes sont relues puis exécutées manuellement dans le SQL Editor.

## 1. Périmètre et décision sur les données

Projet : `portail-monetique`. La branche `dev` contient le jeu de démonstration. La branche par défaut, nommée `production`, sert de production : ne pas la confondre avec la branche Git `main`. Avant chaque exécution, vérifier la branche, la base (`neondb`), le rôle et la région (Francfort).

Les scripts locaux sont `database/schema.sql`, `database/seed.sql` et `database/rollback.sql`. Le schéma crée sept tables et quatre index explicites. Le seed est transactionnel (`BEGIN` et `COMMIT`) et non rejouable sur des données déjà présentes. Le schéma ne contient ni transaction explicite ni `IF NOT EXISTS`. Le retour arrière supprime les sept tables et toutes leurs données, il ne restaure rien.

**Décision du 27/10/2026 : le jeu de démonstration est chargé en production.** La soutenance a lieu sur la production et doit montrer filtres, historique, graphiques, impayés et cloisonnement avec des données reproductibles. Cela reste un environnement de démonstration universitaire : aucune carte complète ni donnée personnelle réelle. Le commentaire d'en-tête de `seed.sql` vise le développement ; son usage en production est assumé par cette décision.

Conditions : contrôler les données, réserver les accès de connexion à l'équipe et au correcteur, employer des mots de passe propres à la production et tester les restrictions. Les empreintes de mots de passe du seed ne sont pas propres à la production : après le chargement du seed, un script séparé remplace les mots de passe des six comptes par des empreintes générées localement, sans mot de passe en clair dans le dépôt. Ce script n'est pas versionné et le seed reste inchangé.

La période du jeu actuel couvre novembre 2025 à octobre 2026. À la soutenance du 30/11/2026, choisir explicitement cette période dans les filtres. Si les critères imposent une fenêtre glissante incluant novembre 2026, faire préparer un nouveau jeu validé ; ne pas annoncer que le jeu actuel couvre ce mois.

Sans jeu de démonstration, appliquer seulement le schéma, sans seed. Une base vide ne contient aucun compte : les connexions et la démonstration fonctionnelle restent bloquées jusqu'à la validation d'un autre jeu fictif, incluant les profils et comptes nécessaires.

## 2. Sauvegarde et identification avant tout changement

1. Fixer le plan : cible de production, version des trois scripts, chargement ou non du seed, sauvegarde, contrôles et retour arrière. Relever le commit des scripts et leurs empreintes locales avec `Get-FileHash database/schema.sql, database/seed.sql, database/rollback.sql -Algorithm SHA256`.
2. Dans la console Neon, ouvrir le seul projet concerné, puis sa branche de production et le SQL Editor. Vérifier les sélecteurs à chaque nouveau passage dans l'éditeur. Une identité SQL seule ne prouve pas la branche : deux branches peuvent partager les mêmes noms de base et de rôle.
3. Avant toute modification d'une base contenant des données, créer une sauvegarde restaurable : dans **Branches / Create branch**, sélectionner la branche de production comme source, à l'état courant, et donner un nom explicite tel que `sauvegarde-production-2026-10-27`. Ne pas choisir `dev` et ne pas réinitialiser une branche existante. Relever l'identifiant de sauvegarde et l'heure. Cette branche de sécurité est temporaire ; elle n'ajoute pas un nouvel environnement applicatif. Pour une base vide, comme lors de l'initialisation du 27/10, cette étape n'a pas d'objet.
4. Vérifier que cette branche apparaît et que son inventaire correspond à la production avant modification. Noter le chemin de restauration à la section 6. Si le quota de branches empêche cette sauvegarde ou si sa restauration n'est pas maîtrisée, arrêter avant toute écriture et faire valider une autre sauvegarde. Ne pas supprimer une branche existante pour libérer une place.

Le plan Free impose des quotas partagés et une fenêtre de restauration limitée ; ne pas supposer qu'un historique automatique remplace une sauvegarde durable. [Plans Neon](https://neon.com/docs/introduction/plans), [stratégies de sauvegarde](https://neon.com/docs/postgres/backup-restore/backups), [branches Neon](https://neon.com/docs/introduction/branching).

Capture attendue : projet, branche cible, région, base et sauvegarde, sans onglet Connect ouvert. Conserver les preuves dans le dossier local de travail, pas dans le dépôt livré.

## 3. Contrôles avant application

Dans le SQL Editor de production, exécuter cette lecture :

```sql
-- L'inventaire évite d'appliquer un schéma initial sur une base déjà utilisée.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

SELECT COUNT(*) AS nombre_tables
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
```

Attendu pour cette initialisation : zéro table. Capturer l'inventaire et le nombre avant application. Si une seule table existe, arrêter et analyser avant toute écriture. Ne pas tenter de rendre les scripts rejouables avec des suppressions. Si les sept tables existent déjà, les comptages de la section suivante peuvent aider au diagnostic, mais cela n'autorise pas à relancer le schéma ou le seed.

## 4. Appliquer schema.sql puis contrôler

1. Ouvrir le fichier local `database/schema.sql` approuvé, copier son contenu complet dans le SQL Editor de la branche de production.
2. Pour éviter un schéma partiellement créé, entourer le contenu copié d'un `BEGIN;` au début et d'un `COMMIT;` à la fin, dans la sélection complète exécutée en une seule fois. Le fichier du dépôt reste inchangé. Faire relire ce bloc avant exécution.
3. Exécuter une seule fois. En cas d'erreur, conserver le message sans valeur sensible et arrêter. Une transaction en erreur ne doit pas être validée. Si l'éditeur conserve la session ouverte, utiliser `ROLLBACK;` pour l'annuler ; ne pas supposer qu'une transaction ouverte survit au changement d'onglet. Refaire l'inventaire dans une nouvelle exécution pour connaître l'état effectivement validé.
4. Refaire l'inventaire : les sept tables ci-dessous doivent exister. Exécuter ensuite le bloc de comptage commun, après le schéma, puis de nouveau après le seed.

```sql
-- Les comptages ne lisent ni les identifiants de connexion ni les hashes.
SELECT 'profils' AS table_nom, COUNT(*) AS nombre FROM profils
UNION ALL SELECT 'entreprises', COUNT(*) FROM entreprises
UNION ALL SELECT 'utilisateurs', COUNT(*) FROM utilisateurs
UNION ALL SELECT 'motifs_impayes', COUNT(*) FROM motifs_impayes
UNION ALL SELECT 'remises', COUNT(*) FROM remises
UNION ALL SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL SELECT 'annonces_tresorerie', COUNT(*) FROM annonces_tresorerie
ORDER BY table_nom;
```

Après schéma seul : sept résultats, tous à zéro. Conserver la capture avec branche et heure. Ne pas charger le seed si cette étape échoue.

## 5. Appliquer seed.sql après arbitrage et contrôler

1. Confirmer la décision de charger le jeu et la validation des comptes de production. Vérifier de nouveau les sélecteurs et les sept comptages à zéro immédiatement avant l'insertion.
2. Copier le contenu entier du `database/seed.sql` approuvé dans le SQL Editor. Il contient déjà `BEGIN`, les insertions, le recalage des séquences et `COMMIT` : ne pas l'entourer d'une seconde transaction.
3. Exécuter une seule fois. Si une erreur survient, arrêter, annuler une transaction encore ouverte et contrôler l'état dans une nouvelle exécution. Ne pas relancer aveuglément le script et ne pas corriger les lignes directement sur la production.
4. Rejouer le bloc de comptage de la section 4. Attendus calculés statiquement à partir des lignes `VALUES` du fichier local, à confirmer sur la base :

- `profils` : 3 ; `entreprises` : 4 ; `utilisateurs` : 6.
- `motifs_impayes` : 8 ; `remises` : 64 ; `transactions` : 164 ; `annonces_tresorerie` : 64.

5. Exécuter les contrôles complémentaires suivants, sans afficher de compte ni de hash :

```sql
-- Le nombre de comptes par profil confirme la couverture des trois parcours.
SELECT p.libelle, COUNT(u.id) AS nombre_comptes
FROM profils p
LEFT JOIN utilisateurs u ON u.profil_id = p.id
GROUP BY p.libelle
ORDER BY p.libelle;

-- Le rattachement d'entreprise est nécessaire pour cloisonner les commerçants.
SELECT COUNT(*) AS comptes_incoherents
FROM utilisateurs u
JOIN profils p ON p.id = u.profil_id
WHERE (p.libelle = 'client' AND u.numero_siren IS NULL)
   OR (p.libelle IN ('admin', 'po') AND u.numero_siren IS NOT NULL);

-- Une démonstration des impayés doit disposer de cas identifiables.
SELECT COUNT(*) AS nombre_impayes
FROM transactions
WHERE motif_impaye_id IS NOT NULL;

-- Comparer les remises à leurs détails révèle un chargement incomplet.
SELECT COUNT(*) AS remises_incoherentes
FROM remises r
LEFT JOIN (
    SELECT remise_id, COUNT(*) AS nombre, SUM(montant) AS total
    FROM transactions
    GROUP BY remise_id
) t ON t.remise_id = r.id
WHERE r.nb_transactions <> COALESCE(t.nombre, 0)
   OR r.montant_total <> COALESCE(t.total, 0);

SELECT MIN(date_vente) AS premiere_vente, MAX(date_vente) AS derniere_vente
FROM transactions;
```

Attendus : 1 compte administrateur, 1 Product Owner, 4 commerçants ; zéro compte incohérent ; 16 transactions impayées ; zéro remise incohérente. Les comptages, la répartition des comptes par profil, l'absence de compte incohérent et l'absence de remise incohérente ont été constatés conformes le 27/10/2026.

Remplacer ensuite les mots de passe des six comptes avec le script de production (empreintes générées localement, non versionné). Sa dernière requête affiche les six identifiants avec `tentatives_echouees` à 0, sans aucun mot de passe. Contrôler les dates réelles retournées et régler la démonstration sur la période du jeu. Ces lectures ne démontrent pas le cloisonnement applicatif : effectuer aussi la recette croisée décrite dans [deploiement.md](deploiement.md).

Conserver les captures des nombres et résultats, sans compte de connexion. Une divergence impose un arrêt et une analyse avant la suite. Ne pas ouvrir le site au public avant les contrôles de session et d'autorisation.

## 6. Retour arrière et restauration

### Transaction non validée

Si la transaction est encore ouverte dans la même session, l'annuler avec `ROLLBACK;`. Contrôler ensuite l'inventaire et les comptages. Un échec du seed ne supprime pas le schéma validé auparavant. Les valeurs de séquences peuvent avoir avancé malgré l'annulation ; ne pas les corriger sans un diagnostic et un script validés.

### Initialisation validée à annuler avec rollback.sql

Uniquement après avoir confirmé la cible, disposé d'une sauvegarde et vérifié l'absence d'usage concurrent :

1. Mettre l'application hors utilisation selon le plan validé, relever le SHA actif et confirmer de nouveau la branche de production.
2. Relever l'inventaire et les comptages avant suppression. Confirmer que les sept tables appartiennent bien à cette initialisation ; si d'autres objets en dépendent ou si des données ont été ajoutées depuis, arrêter.
3. Copier le contenu complet de `database/rollback.sql`, entouré de `BEGIN;` et `COMMIT;`, dans une seule sélection du SQL Editor. Il supprime, dans cet ordre, `annonces_tresorerie`, `transactions`, `remises`, `motifs_impayes`, `utilisateurs`, `entreprises`, `profils`. Il ne faut pas ajouter `CASCADE` en cas d'erreur.
4. Relire puis exécuter ce bloc destructif après confirmation de la cible. Les lignes supprimées ne sont récupérables que via la sauvegarde. Refaire le contrôle de la section 3 : zéro table publique si la base était initialement vide, puis vérifier l'absence des sept relations.
5. Ne relancer les scripts d'initialisation qu'après une nouvelle validation. `/api/health` peut rester `ok` sur une base vide, puisqu'il ne teste que `SELECT 1` ; la restauration est prouvée par les contrôles SQL et la recette applicative.

### Restaurer l'état sauvegardé

Si l'objectif est de retrouver un état antérieur contenant des données, `rollback.sql` est insuffisant. La branche de sauvegarde conserve l'état avant opération. Préparer une restauration depuis cette branche vers la production, en vérifiant dans la console l'option de restauration et les conséquences sur les branches enfants. Confirmer la cible, le point sauvegardé, les endpoints et les connexions avant toute validation. Ne pas réinitialiser `dev` ni changer la branche de production par défaut pour improviser un secours.

Après restauration : comparer l'inventaire et les comptages à ceux de la sauvegarde, vérifier la chaîne utilisée par Production en privé, redéployer seulement si sa configuration a changé, puis rejouer santé et parcours. Conserver la sauvegarde jusqu'à validation de la recette ; sa suppression ultérieure fera l'objet d'une décision distincte. [Sauvegarde et restauration Neon](https://neon.com/docs/postgres/backup-restore/backups).

## 7. État au 28/10/2026

- Production initialisée le 27/10/2026 : schéma, jeu de démonstration et remplacement des mots de passe des six comptes.
- Contrôles après initialisation et recette en ligne conformes (voir [deploiement.md](deploiement.md), section 7).
- À surveiller : les quotas du plan Free, partagés entre les branches, et la période du jeu (novembre 2025 à octobre 2026), à choisir dans les filtres lors de la soutenance.

## 8. Libellés complets des motifs d'impayé

Le Product Owner a autorisé les libellés de plus de vingt caractères le 28/10/2026. Le schéma et le jeu de démonstration prévoient désormais `motifs_impayes.libelle VARCHAR(80) NOT NULL`, seule référence d'affichage. `description` reste conservée pour compatibilité, avec le même texte pour les huit motifs. Le code 08 porte « Raison non communiquée, contactez la banque du client », soit 53 caractères.

Pour une base existante, la [migration du 29/10/2026](../database/migrations/2026-10-29_03_libelles_impayes.sql) est préparée, sans application attestée ici. Contrôler la cible, les huit codes et les anciens libellés de vingt caractères au plus ; tester sur dev d'abord, puis appliquer sur production avant la fusion de develop vers main. Le script sauvegarde seulement `code`, `libelle` et `description` dans `sauvegarde_motifs_20261029`. Une sauvegarde de ce nom déjà présente impose un arrêt et un contrôle de son origine.

Le [retour associé](../database/migrations/2026-10-29_03_libelles_impayes_retour.sql) exige les huit codes d'origine et leur sauvegarde complète, restaure les textes avant de revenir à `VARCHAR(20)`, sans troncature, et conserve la sauvegarde. Retirer tout code qui affiche un libellé long avant ce retour. Ne pas relancer le seed sur une base déjà remplie.

## 9. Accord du Product Owner à la création

Deux colonnes facultatives de utilisateurs conservent la trace des nouvelles créations : accord_po_le (TIMESTAMPTZ, heure SQL de l'accord) et cree_par (INTEGER, clé étrangère vers utilisateurs.id). Le créateur vient de la session administrateur, jamais du formulaire. Les deux colonnes ont NULL par défaut : aucun accord n'est attribué rétroactivement aux comptes existants. La liste affiche la date de Paris ou « Non renseigné ».

La [migration 04](../database/migrations/2026-10-29_04_accord_po.sql) est préparée, sans application attestée ici : vérifier la cible, appliquer sur dev d'abord, puis sur production avant la fusion de develop vers main et avant l'utilisation du code qui lit ces colonnes. Une colonne déjà présente provoque un refus explicite ; ne pas forcer un rejeu.

Le [retour 04](../database/migrations/2026-10-29_04_accord_po_retour.sql) exige de retirer d'abord le code dépendant. Il refuse toute suppression si une seule valeur est renseignée dans l'une des deux colonnes. Dans ce cas, conserver les données et préparer séparément une sauvegarde validée et un retour adapté. Aucune sauvegarde automatique ni suppression forcée n'est prévue. La clé étrangère empêche la suppression physique d'un administrateur encore référencé ; sa désactivation conserve la trace.


## Sessions révocables

La migration 02, database/migrations/2026-10-29_02_sessions.sql, crée sessions avec un UUID serveur, un utilisateur lié par clé étrangère en cascade et trois dates TIMESTAMPTZ : création, expiration et révocation facultative. Deux index portent sur l'utilisateur et sur l'expiration. Le schéma neuf comporte huit tables et six index explicites ; le seed ne crée aucune session.

Karlos contrôle la cible et une sauvegarde restaurable, applique la migration sur Neon dev, puis réalise la recette. Sur production, appliquer la migration avant la fusion de develop vers main, qui déclenche le déploiement. Ne pas rejouer schema.sql ou seed.sql sur une base existante. Le script refuse une table sessions déjà présente. Aucun résultat d'application de cette migration n'est attesté ici.

Après déploiement, les anciens cookies sans UUID sont refusés : chaque utilisateur se reconnecte une fois. Le cookie reste signé ; la garde vérifie propriétaire, expiration, révocation et compte actif dans sa lecture SQL. Une déconnexion ferme la session courante ; la déconnexion globale ferme les sessions du compte visibles au début de son instruction. Une connexion concurrente ultérieure peut survivre ; une requête déjà admise peut finir. Le blocage temporaire ne ferme pas les sessions déjà ouvertes.

La connexion purge au plus 100 sessions expirées depuis plus d'un jour, sans boucle. Un échec de maintenance ne fait pas perdre la connexion ; sans nouvelle connexion, aucune purge n'est garantie. La table ne contient ni cookie, ni mot de passe, ni adresse IP.

Le retour 02 exige le retrait du code dépendant et refuse les sessions encore valides. Il supprime uniquement sessions et ses index, sans cascade générale. Le retour global d'initialisation supprime désormais sessions avant utilisateurs ; il ne sert pas au retour du seul lot.
