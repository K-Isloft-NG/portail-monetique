# Portail monétique

Projet BUT2 Informatique, module Qualité de développement (Université Gustave Eiffel).
Portail Web de gestion de paiements par cartes bancaires, avec un jeu de données entièrement fictif.

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

- `DATABASE_URL` : chaîne de connexion à la base Neon de développement ;
- `SESSION_SECRET` : secret de signature réservé à la future gestion des sessions.

Ces valeurs restent locales et ne doivent jamais être partagées ou versionnées.
Le build et les tests unitaires ne nécessitent pas de connexion à la base.

## Lancement

```sh
npm run dev
```

Ouvrir `http://localhost:3000`. La racine redirige vers `/login`.
La page de connexion sera ajoutée lors de la mission suivante : cette adresse répond pour l'instant 404.

Le contrôle `GET /api/health` exécute uniquement `SELECT 1` :

- HTTP 200 et `{"status":"ok"}` si la base répond ;
- HTTP 503 et `{"status":"erreur"}` si la configuration manque ou si la base est indisponible.

Le détail des erreurs de connexion n'est jamais renvoyé. Pour contrôler la connexion réelle,
le responsable de l'environnement ouvre cette route après avoir configuré `.env.local`.

Pour lancer une version compilée localement : `npm run build`, puis `npm start`.

## Contrôles

```sh
npm run lint
npm run build
npm test
```

Les tests contrôlent l'absence de `DATABASE_URL`, la séparation des paramètres SQL et
les réponses de la route de contrôle. Ils simulent le pilote de base et ne contactent pas Neon.

## Structure

```text
src/app/          Pages, styles et routes HTTP
src/components/  Composants d'interface à ajouter selon les stories
src/lib/         Accès SQL et futurs utilitaires serveur
database/        Schéma, données fictives et retour arrière SQL
tests/           Tests unitaires
docs/            Conception, suivi et preuves de tests
```

Le module `src/lib/db.ts` s'utilise côté serveur avec des requêtes SQL fixes et des
paramètres séparés (`$1`, `$2`). Les futurs accès aux données d'entreprise devront passer
par le cloisonnement fondé sur la session. Aucun accès métier ni mécanisme de session
n'est encore implémenté dans ce socle.

Les scripts SQL du dossier `database/` sont exécutés manuellement après validation.
