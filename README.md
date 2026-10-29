# Portail monétique

Projet BUT2 Informatique, module Qualité de développement (Université Gustave Eiffel).
Portail Web de gestion de paiements par cartes bancaires, avec un jeu de données entièrement fictif.

Version en ligne : https://portail-monetique.vercel.app

## État d'avancement

Disponible à la fin du Sprint 1 :

- connexion par identifiant et mot de passe, avec une session signée valable huit heures, révocable côté serveur ;
- trois profils (administrateur, Product Owner, commerçant), chacun avec son espace : `/admin`, `/po` et `/client` ;
- cloisonnement des commerçants : un commerçant n'accède qu'aux données de son entreprise, le SIREN étant toujours lu dans la session et jamais dans l'adresse ;
- avertissement après deux échecs de connexion et bouton d'affichage du mot de passe ;
- en-têtes de sécurité HTTP et route de contrôle `/api/health`.

Les écrans de trésorerie, de remises, d'impayés, de graphiques et d'exports sont prévus dans les sprints suivants.

## Installation

Prérequis : Node.js 22.12 ou supérieur dans la série 22, Node.js 24, ou Node.js 26 et supérieur, avec npm.
Node.js 24 convient à l'ensemble des dépendances, y compris les tests. Installer les dépendances verrouillées :

```sh
npm ci
```

L'application utilise Next.js 16.4.3 (App Router), TypeScript et Tailwind CSS.
L'accès à PostgreSQL sur Neon se fait en SQL direct, sans ORM.

## Variables d'environnement

Créer un fichier `.env.local` à partir des noms présents dans `.env.example`, sans remplacer un fichier existant.
Renseigner localement :

- `DATABASE_URL` : chaîne de connexion à la branche `dev` de la base Neon ;
- `SESSION_SECRET` : secret de signature des sessions, une chaîne aléatoire longue propre à chaque environnement.

Les variables `E2E_*` du fichier d'exemple sont facultatives : ce sont les mots de passe des comptes de démonstration, utilisés seulement pour des vérifications manuelles en local. Elles ne servent ni au build ni aux tests.

Ces valeurs restent locales et ne doivent jamais être partagées ou versionnées. Le fichier `.env.local` est ignoré par Git.
Le build et les tests unitaires ne nécessitent pas de connexion à la base.

## Base de données

Les scripts du dossier `database/` sont exécutés manuellement dans le SQL Editor de Neon, après relecture :

- `schema.sql` crée les huit tables ;
- `seed.sql` charge le jeu de démonstration (quatre entreprises, douze mois de transactions) ;
- `rollback.sql` supprime les huit tables et leurs données.

Le projet Neon comporte deux branches : `dev` pour le développement local et les déploiements de préproduction, `production` pour le site en ligne. La procédure complète est dans [docs/base-de-donnees.md](docs/base-de-donnees.md).
Les identifiants des comptes de démonstration ne sont pas versionnés : ils sont remis séparément.

## Lancement

```sh
npm run dev
```

Ouvrir `http://localhost:3000`. La racine redirige vers `/login` ; après connexion, chaque profil arrive dans son espace.

Le contrôle `GET /api/health` exécute uniquement `SELECT 1` :

- HTTP 200 et `{"status":"ok"}` si la base répond ;
- HTTP 503 et `{"status":"erreur"}` si la configuration manque ou si la base est indisponible.

Le détail des erreurs de connexion n'est jamais renvoyé.

Pour lancer une version compilée localement : `npm run build`, puis `npm start`.

## Contrôles

```sh
npm run lint
npm run build
npm test
```

Les tests couvrent la session signée, l'authentification, les gardes d'accès et le cloisonnement, le proxy, les en-têtes HTTP, la route de contrôle et la séparation des paramètres SQL.
Ils simulent le pilote de base et ne contactent pas Neon.

## Principes de sécurité

- Requêtes SQL paramétrées (`$1`, `$2`), jamais de valeur concaténée dans le texte d'une requête.
- Mots de passe hachés avec bcrypt (coût 10) ; au premier échec, identifiant inconnu et mot de passe faux reçoivent le même message ; l'avertissement et le blocage demandés par le PO révèlent ensuite qu'un compte existe.
- Cookie de session `httpOnly`, `sameSite=lax`, `secure` en production, signé avec `SESSION_SECRET`.
- Chaque page protégée relit le compte en base et vérifie son profil et son entreprise. Le proxy se limite à rediriger les visiteurs sans cookie vers `/login`.
- Aucun secret ni mot de passe dans les fichiers versionnés.

## Structure

```text
src/app/          Pages (login, admin, po, client) et routes HTTP (api/health)
src/components/   Composants d'interface (formulaire de connexion, bouton de déconnexion)
src/lib/          Session, authentification, contrôle d'accès et accès SQL
src/proxy.ts      Redirection vers /login quand le cookie de session est absent
database/         Schéma, données fictives et retour arrière SQL
tests/            Tests unitaires
docs/             Déploiement et base de données, dossiers prévus pour la conception, le suivi et les tests
```

Le module `src/lib/db.ts` s'utilise côté serveur avec des requêtes SQL fixes et des paramètres séparés.
Tout accès aux données d'une entreprise passe par `getClientCompany` (`src/lib/access.ts`), qui fixe le SIREN à partir de la session.

## Déploiement

L'application est hébergée sur Vercel et la base sur Neon, toutes deux en région Francfort.
`main` alimente la production ; les autres branches produisent des déploiements de préproduction, reliés à la branche `dev` de la base.
Les variables d'environnement sont définies séparément pour chaque environnement. Voir [docs/deploiement.md](docs/deploiement.md).

## Conventions de travail

- `main` (production) et `develop` (intégration) sont permanentes. Chaque travail se fait sur une branche `feature/<epic>-<sujet>` créée depuis `develop`.
- Les messages de commit sont en français, commencent par un verbe à l'infinitif et se terminent par la référence de la story, par exemple `Ajouter les en-têtes de sécurité HTTP (E6-TS1)`.
- Les branches sont fusionnées par demande de fusion (pull request), avec une liste de contrôle de relecture dans la description, en conservant un commit de fusion.


La déconnexion révoque la session courante ; « Se déconnecter de tous les appareils » révoque celles du compte visibles au début de l'opération. Si la révocation ne peut pas être confirmée, le cookie reste présent pour réessayer et une erreur est affichée. La migration 02 doit être appliquée avant utilisation ; les anciens cookies imposent une reconnexion.
