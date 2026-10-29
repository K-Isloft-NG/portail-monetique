# Préparer le déploiement sur Vercel

Procédure suivie les 27 et 28/10/2026 pour mettre l'application en ligne sur Vercel, avec l'état constaté à l'issue du déploiement (section 1) et les contrôles réalisés (section 7). Les étapes sont exécutées manuellement dans les consoles Vercel, Neon et GitHub.

## 1. État constaté

Les décisions D02 et D03 retiennent Next.js App Router, TypeScript, SQL direct avec `@neondatabase/serverless`, Vercel et Neon.

- Le dépôt GitHub est relié à un projet Vercel du compte propriétaire du dépôt (plan Hobby). Branche de production : `main`. Les autres branches produisent des déploiements de préproduction (Preview).
- Le projet Neon `portail-monetique` est à Francfort, avec deux branches : `dev` (développement local et Preview) et `production`, la branche par défaut. Ne pas confondre une branche Neon et une branche Git.
- Adresse de production : `https://portail-monetique.vercel.app`, sous-domaine `vercel.app` attribué au projet. Aucun achat de domaine ni changement de DNS n'a été nécessaire. [Domaines Vercel](https://vercel.com/docs/domains/working-with-domains).
- Les fonctions sont exécutées dans la région `fra1` : `cdg1::fra1` a été constaté dans l'en-tête `x-vercel-id` d'un déploiement Preview. Le réglage s'applique à chaque nouveau déploiement.
- Le Sprint 1 (connexion, sessions, cloisonnement) est livré sur `main`. La production a été vérifiée le 28/10/2026 (section 7).

Une erreur a été corrigée avant la recette : les comptes de production étaient refusés parce que la variable `DATABASE_URL` de Production avait reçu la même valeur que celle de Preview, c'est-à-dire la chaîne de la branche `dev`. Après son remplacement par la chaîne de la branche `production` et un nouveau déploiement, les connexions ont fonctionné. La section 4 donne un contrôle simple pour éviter cette confusion.

Avant un nouveau déploiement :

1. Vérifier que le commit à déployer est présent sur GitHub : les changements locaux non publiés ne sont pas déployés.
2. Suivre [la procédure de base de données](base-de-donnees.md) pour toute opération sur la branche `production`. Ne jamais choisir `dev` pour ces opérations.
3. Conserver localement les captures de réglages existants, le SHA du commit et l'identifiant du dernier déploiement sain. Aucune capture ne doit contenir une chaîne de connexion, une valeur de variable, un mot de passe ou un cookie.

## 2. Plans gratuits : conditions vérifiées dans les sources officielles

Les pages ont été consultées le 27/10/2026. Les plafonds peuvent évoluer : les comparer aux écrans du compte avant la mise en ligne et avant la soutenance.

- **Vercel Hobby** : usage personnel non commercial, une région de fonctions, pas de collaboration d'équipe incluse. La simulation universitaire de paiements fictifs ne constitue pas à elle seule une activité commerciale ; le projet est déployé depuis le compte individuel du propriétaire du dépôt, et un travail à plusieurs sur Vercel demanderait de revérifier les conditions du plan. Repères publiés : 100 Go de Fast Data Transfer, un million d'invocations de fonctions, 4 heures de CPU actif, 360 Go-heures de mémoire provisionnée et 100 déploiements par jour. Un dépassement peut suspendre la ressource ; la gratuité n'est pas une garantie de disponibilité. [Plan Hobby](https://vercel.com/docs/plans/hobby).
- **Liaison GitHub et Hobby** : un dépôt privé d'organisation GitHub ne peut pas être déployé sur Hobby. L'auteur du commit doit correspondre au propriétaire de l'équipe Hobby. Vérifier cette contrainte aussi pour les commits de fusion et les previews des coéquipiers. Si elle bloque, revoir le choix de compte ou de plan ; ne pas rendre le dépôt public ni changer ses auteurs pour contourner le problème. [Déploiement Git](https://vercel.com/docs/git), [collaboration](https://vercel.com/docs/deployments/troubleshoot-project-collaboration).
- **Neon Free** : 100 projets, 10 branches par projet, 100 CU-heures de calcul par projet et par mois, 1 Go PostgreSQL par projet avec un plafond de 20 Go au total du compte, 5 Go de transfert réseau public par projet. Le calcul des branches `dev` et production partage le quota du projet. Mise en veille après cinq minutes d'inactivité, non désactivable sur Free. Pas de SLA inclus. Les sources présentent Free pour prototypes et petites équipes ; ne pas lui attribuer par analogie la restriction d'usage personnel de Vercel. [Plans Neon](https://neon.com/docs/introduction/plans), [mise en veille](https://neon.com/docs/introduction/scale-to-zero).

Contrôle et preuve attendus : noter le type de plan, les compteurs d'usage et le propriétaire du dépôt. Capturer seulement les métadonnées utiles. Si les conditions du compte divergent de ces repères, arrêter la mise en production et revoir le plan avant de continuer.

## 3. Créer le projet et relier GitHub

1. Ouvrir le tableau de bord Vercel, choisir **Add New / Project**, puis l'import GitHub.
2. Autoriser l'application GitHub sur le seul dépôt prévu. Pour un dépôt personnel, la documentation exige le propriétaire pour l'import ; pour une organisation, vérifier les droits et l'approbation de l'application. [Import GitHub](https://vercel.com/docs/git/vercel-for-github).
3. Contrôler propriétaire, nom du dépôt, racine de l'application et commit. Contrôler que le préréglage est bien **Next.js** (l'import peut proposer « Other » : le corriger dans **Settings / Build and Deployment**), racine `./` si `package.json` est bien à la racine du dépôt importé, installation `npm ci`, compilation `npm run build`. Conserver la sortie Next.js gérée par Vercel.
4. Choisir une version Node compatible avec `package.json`, par exemple Node 24 si proposée. Ne pas choisir une version uniquement parce qu'elle est celle du compte par défaut.
5. Renseigner les variables de production avant de cliquer sur **Deploy**. L'import peut déclencher un premier déploiement : ce clic fait déjà partie du plan validé. S'il est impossible de choisir la région avant cette création, traiter ce premier déploiement comme provisoire, puis régler la région et redéployer avant la recette.
6. Dans les réglages du projet, ouvrir **Environments / Production**, puis **Branch Tracking / Production Branch** et confirmer `main`. Selon l'interface, le réglage peut se trouver dans **Settings / Git**. Se fier au champ indiquant la branche de production, pas uniquement au nom du dépôt. Confirmer aussi le dépôt dans **Settings / Git**.

Contrôle et capture attendus : dépôt relié, branche `main`, racine, préréglage, version Node et SHA. Les prochains changements de `main` déclenchent la production ; les autres branches produisent des previews, sous réserve des droits Hobby. Ne pas lancer de migration dans une commande de build.

## 4. Renseigner les variables par environnement

Dans **Settings / Environment Variables**, créer des entrées distinctes et sélectionner leur environnement explicitement. Utiliser le type secret lorsque proposé. Ne pas sélectionner Preview et Production simultanément pour une même valeur. Les variables ne portent jamais le préfixe `NEXT_PUBLIC_`.

| Variable | Preview | Production |
| --- | --- | --- |
| `DATABASE_URL` | Chaîne Neon de la branche `dev`, copiée directement depuis Connect | Chaîne Neon de la branche par défaut réservée à la production |
| `SESSION_SECRET` | Secret aléatoire propre à Preview | Autre secret aléatoire, généré séparément et différent de Preview |

Pour chaque chaîne : dans Neon, ouvrir le projet `portail-monetique`, sélectionner la bonne branche dans **Connect**, vérifier la base, le rôle et la région, puis copier vers le champ Vercel sans passer par une conversation ou un fichier partagé. Conserver les paramètres de sécurité fournis par Neon. Ne pas afficher la chaîne pour comparer les environnements ; comparer les branches et les métadonnées des endpoints dans la console privée. Contrôle simple : l'hôte de la chaîne (la partie entre `@` et le nom de la base) doit être différent entre Preview et Production, puisque chaque branche Neon a son propre endpoint.

Si des variables Preview sont surchargées par branche Git, contrôler aussi ces surcharges : aucune ne doit pointer sur la production. La variable locale Development est distincte des déploiements Preview ; elle ne doit pas recevoir les identifiants de production.

Contrôle et capture attendus : noms des deux variables, environnements sélectionnés et valeurs masquées. Confirmer en privé que les deux secrets diffèrent. Ne pas conserver de capture de leur saisie. Une modification de variable nécessite un nouveau déploiement et ne change pas les déploiements existants. [Variables Vercel](https://vercel.com/docs/environment-variables).

### Générer un secret sans l'afficher

On peut utiliser le générateur cryptographique d'un gestionnaire de mots de passe, ou lancer ce bloc dans PowerShell local, hors partage d'écran, avec transcription et historique du presse-papiers désactivés :

```powershell
$secretBytes = New-Object byte[] 48
$secretGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $secretGenerator.GetBytes($secretBytes)
    [BitConverter]::ToString($secretBytes).Replace('-', '') | Set-Clipboard
} finally {
    $secretGenerator.Dispose()
    [Array]::Clear($secretBytes, 0, $secretBytes.Length)
    Remove-Variable secretBytes, secretGenerator
}
```

Ce bloc place 48 octets aléatoires, encodés en 96 caractères hexadécimaux, dans le presse-papiers sans sortie console. Coller directement dans le champ secret de Preview, enregistrer dans un gestionnaire privé, puis vider le presse-papiers avec `Set-Clipboard -Value ''`. Relancer le bloc pour Production : ne pas réutiliser la première génération. Désactiver aussi la synchronisation du presse-papiers et effacer son historique éventuel. Ne jamais exécuter une commande qui imprime la valeur, ni la copier dans un ticket, une capture ou un fichier versionné. La rotation d'un secret de session invalidera les sessions signées avec l'ancien secret.

### Choix de connexion : pooler

Recommandation pour `DATABASE_URL` : sélectionner **Connection pooling** dans Connect pour chaque branche. Le nom d'hôte contient alors `-pooler`. Ce choix suit la recommandation Neon de privilégier les connexions mutualisées pour une application serverless. [Choisir la connexion](https://neon.com/docs/connect/choose-connection).

Le code actuel appelle `neon()` puis `sql.query()` : les requêtes passent par HTTP, sans `Pool` JavaScript ni session PostgreSQL persistante entre deux appels. Le transport HTTP et le pooler côté Neon sont deux choix distincts ; ne pas ajouter de pool côté application. Le pilote accepte une chaîne Neon, directe ou mutualisée. La recommandation du pooler ne signifie pas qu'il serait obligatoire pour chaque requête HTTP. [Pilote serverless](https://neon.com/docs/serverless/serverless-driver).

PgBouncer réutilise les connexions PostgreSQL et les libère après chaque transaction. Ne pas compter sur un état SQL conservé entre deux requêtes pour cloisonner les profils. Les migrations et opérations nécessitant une session persistante demandent une connexion directe ; ici, les scripts sont appliqués séparément dans le SQL Editor, jamais par l'application. [Pool de connexions Neon](https://neon.com/docs/connect/connection-pooling).

## 5. Fixer la région près de Neon

1. Dans Neon, confirmer que le projet et ses endpoints sont à Francfort. Si la région diffère, choisir pour Vercel la région la plus proche de la base.
2. Dans Vercel : **Settings / Functions / Function Regions**, choisir **Frankfurt (`fra1`)**, une seule région sur Hobby, puis enregistrer.
3. Redéployer pour prendre en compte le réglage. Contrôler dans les détails de la fonction `/api/health` la région d'exécution du nouveau déploiement.

Capture attendue : `fra1` sélectionnée et région effective de la fonction. Les fichiers statiques restent distribués par le CDN ; ce réglage concerne l'exécution des fonctions. Sans réglage explicite, les nouveaux projets utilisent `iad1` selon la documentation consultée. [Région des fonctions](https://vercel.com/docs/functions/configuring-functions/region), [liste des régions](https://vercel.com/docs/regions).

Une autre possibilité, à soumettre dans une tâche dédiée, serait un fichier `vercel.json` contenant `{"regions":["fra1"]}`. Aucun fichier de configuration n'est créé par cette procédure ; le réglage retenu ici passe par le tableau de bord.

## 6. Initialiser la production et lancer le déploiement retenu

1. Appliquer [base-de-donnees.md](base-de-donnees.md) sur la branche de production (jeu de démonstration chargé) et conserver les comptages. Une branche de production non vide impose un arrêt préalable pour examen.
2. Avant publication, relire le lot. Depuis le dépôt, lancer les commandes existantes `npm run lint`, `npm test` et `npm run build`. Aucune de ces commandes ne doit contenir de migration. Vérifier les fichiers que l'équipe prévoit de publier et l'absence de secrets ou de fichiers de travail locaux.
3. Publier le commit relu : demande de fusion de `develop` vers `main`, avec la liste de contrôle de relecture dans la description. Dans Vercel **Deployments**, sélectionner le déploiement de `main`, environnement **Production**, vérifier le SHA et attendre **Ready**. Si les variables ou la région viennent de changer, utiliser **Redeploy** dans le tableau de bord après validation du plan. Ne pas promouvoir une Preview en supposant qu'elle conserve sa base `dev` : Production doit utiliser ses propres variables.
4. Relever le domaine stable de production dans **Settings / Domains**, puis ouvrir son URL HTTPS dans une fenêtre privée. Ne pas utiliser par erreur une URL de Preview pour la soutenance.

Captures attendues : état Ready, SHA, environnement Production et domaine attribué. [Intégration Git](https://vercel.com/docs/git), [certificats HTTPS](https://vercel.com/docs/domains/working-with-ssl).

## 7. Contrôles après déploiement

Contrôles réalisés le 28/10/2026 sur la production, dans une fenêtre de navigation privée, avec les comptes de production détenus en privé. À refaire après tout changement important de configuration et avant la soutenance. Pour chaque contrôle, consigner la date, le SHA, l'environnement, le résultat réel et une capture sans secret.

| Contrôle | Résultat |
| --- | --- |
| HTTPS : certificat accepté, URL finale en HTTPS | Conforme |
| Santé : `/api/health` renvoie 200 et `{"status":"ok"}` | Conforme |
| Pages privées sans session (`/po`, `/client`) | Redirection vers `/login` |
| Connexion administrateur, PO, commerçant boulangerie et commerçant garage | Conforme : chaque profil arrive dans son espace |
| Cloisonnement : SIREN de l'autre entreprise dans l'adresse, depuis le compte garage | Redirection vers `/client`, aucune donnée de l'autre entreprise |
| Cookie `portail_session` : `HttpOnly`, `Secure`, `SameSite=Lax`, chemin `/`, sans domaine partagé | Conforme |
| Redirection de HTTP vers HTTPS, réveil de Neon après inactivité | Non mesurés à ce jour |

Points à retenir pour les contrôles suivants :

- **Santé** : HTTP 503 et `{"status":"erreur"}` signifient qu'il faut examiner la configuration privée, la disponibilité et les quotas. Ne pas recopier une erreur de connexion contenant une chaîne. Ce contrôle prouve un accès SQL, pas la présence des sept tables ni le cloisonnement.
- **Réveil** : après plus de cinq minutes sans activité, le premier appel peut être plus lent. Avant la soutenance, faire un appel de santé et une connexion juste avant le passage.
- **Cloisonnement** : un sélecteur caché dans l'interface ne suffit pas, vérifier aussi la réponse réseau. Tester dans les deux sens (boulangerie vers garage, puis garage vers boulangerie) et ajouter trésorerie, détails, impayés et exports au fur et à mesure qu'ils existent. Le refus attendu est une redirection, un 403, un 404 ou un résultat vide, jamais une donnée de l'autre entreprise.

## 8. Risques et contrôles associés

- **Cookie sans Secure ou session exposée** : vérifier les attributs dans le navigateur en HTTPS, l'invalidation après déconnexion et le refus d'une session invalide. Contrôlé le 28/10/2026 en production (section 7).
- **Secret exposé ou partagé entre environnements** : variables serveur privées, aucune valeur dans Git, réponses HTTP ou captures, deux générations distinctes, surcharges Preview contrôlées. Si exposition : rotation du secret et nouveau déploiement ; un retour au code précédent n'annule pas la fuite.
- **Preview branchée sur la production** : double contrôle des sélecteurs Neon et du périmètre des variables, puis comparaison des comptages privés par environnement. Interdire les tests d'écriture en production.
- **Jeu de démonstration accessible sur Internet** : comptes protégés avec mots de passe propres à la production, données fictives, pages privées refusées sans session, test croisé et aucun identifiant de connexion dans les documents publics. Valider le jeu et son accès avant le seed (fait le 27/10/2026).
- **Veille au premier appel** : test après inactivité et réveil juste avant la démonstration. Contrôler aussi les quotas, partagés entre branches ; ne pas confondre veille et quota épuisé.
- **Restriction Hobby sur GitHub ou auteur du commit** : vérifier propriétaire, visibilité et auteur avant la liaison ; revoir le choix de compte ou de plan si incompatible.
- **Mauvaise région** : prouver `fra1` dans le réglage et dans la fonction déployée ; ne pas déduire la région serveur du domaine ou du CDN.
- **Régression après un push sur main** : relever SHA et dernier déploiement sain, contrôler chaque déploiement et geler le lot de soutenance selon le calendrier de l'équipe.

## 9. Retour arrière de l'application

Utiliser le tableau de bord pour rétablir le dernier déploiement de production sain, puis revérifier domaine, HTTPS, santé et accès. Vérifier ensuite le suivi des déploiements automatiques avant la prochaine publication. Pour un premier déploiement sans version saine, suspendre la mise en service et préparer un plan de retrait ; ne rien supprimer par défaut.

Un retour arrière Vercel ne restaure ni le schéma Neon, ni ses données, ni les secrets. La restauration de la base suit la procédure séparée, et toute rotation doit rester cohérente avec le déploiement actif.


## Déploiement des sessions révocables

Appliquer la migration 02 sur dev, vérifier table vide, colonnes, clé étrangère et index, puis effectuer la recette à deux navigateurs. Après sauvegarde validée, Karlos applique la même migration en production avant la fusion de develop vers main et le déploiement automatique. Les anciens cookies sans UUID imposent une reconnexion générale. Aucune migration n'est lancée pendant le build.

Conserver de préférence la table et le contrôle SQL lors d'un retour applicatif. Si le retour reprend un ancien code sans état, utiliser une SESSION_SECRET neuve, jamais une clé précédente, et imposer une reconnexion générale : l'ancien code ignorerait la révocation SQL. Ne pas rétablir un ancien déploiement avec l'ancienne clé. Une restauration de sauvegarde peut aussi restaurer des sessions révoquées ; prévoir leur invalidation ou une clé neuve avant remise en service. Le retour SQL 02 n'est exécuté qu'après retrait du code dépendant et absence de sessions valides.
