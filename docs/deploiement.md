# Préparer le déploiement sur Vercel

Procédure du 27/10/2026, à exécuter manuellement par Karlos après validation du plan par le responsable technique. Aucun déploiement n'a été réalisé pour rédiger ce document.

## 1. État et conditions de départ

Les décisions D02 et D03 retiennent Next.js App Router, TypeScript, SQL direct avec `@neondatabase/serverless`, Vercel et Neon. Le projet Neon `portail-monetique` comporte, selon le cadrage reçu, une branche `dev` déjà alimentée et une branche par défaut destinée à la production. Leur état distant, leur nom exact et leur région restent à contrôler dans la console par Karlos. Ne pas confondre branche Git `main` et branche Neon par défaut.

Le nom de domaine retenu est le sous-domaine `vercel.app` attribué au projet. Son libellé exact dépend de sa disponibilité, il ne faut pas annoncer une adresse avant son attribution. Aucun achat de domaine ni changement de DNS n'est nécessaire pour ce choix. [Domaines Vercel](https://vercel.com/docs/domains/working-with-domains).

Au 27/10/2026, le dépôt local contient `/api/health`, qui exécute `SELECT 1`. La racine redirige vers `/login`, mais cette page, les sessions et le cloisonnement ne sont pas encore implémentés. Un déploiement du squelette peut donc réussir avec une page de connexion en 404. Cela ne valide pas la recette de soutenance.

Avant toute action :

1. Faire valider par le responsable technique le commit à déployer, le compte propriétaire Vercel, le dépôt exact et la compatibilité de Hobby avec le travail de l'équipe. Aucune story n'est encore associée à cette liaison : en rattacher une avant de soumettre les commits.
2. Vérifier que ce commit est réellement présent sur GitHub. Les changements locaux non publiés ne sont pas déployés. Les fusions et publications sont effectuées par les membres selon la revue d'équipe.
3. Prévoir les éléments touchés : nouveau projet Vercel, liaison GitHub, deux variables par environnement, région `fra1`, schéma et données de la seule branche Neon de production.
4. Suivre [la procédure de base de données](base-de-donnees.md) pour la sauvegarde, l'initialisation et le retour arrière. Ne jamais choisir `dev` pour ces opérations.
5. Conserver localement les captures de réglages existants, le SHA du commit et, s'il existe, l'identifiant du dernier déploiement sain. Aucune capture ne doit contenir une chaîne de connexion, une valeur de variable, un mot de passe ou un cookie.

## 2. Plans gratuits : conditions vérifiées dans les sources officielles

Les pages ont été consultées le 27/10/2026. Les plafonds peuvent évoluer : les comparer aux écrans du compte avant la mise en ligne et avant la soutenance.

- **Vercel Hobby** : usage personnel non commercial, une région de fonctions, pas de collaboration d'équipe incluse. La simulation universitaire de paiements fictifs ne constitue pas à elle seule une activité commerciale ; l'adéquation du compte individuel au travail de cinq personnes doit toutefois être confirmée par le responsable technique. Repères publiés : 100 Go de Fast Data Transfer, un million d'invocations de fonctions, 4 heures de CPU actif, 360 Go-heures de mémoire provisionnée et 100 déploiements par jour. Un dépassement peut suspendre la ressource ; la gratuité n'est pas une garantie de disponibilité. [Plan Hobby](https://vercel.com/docs/plans/hobby).
- **Liaison GitHub et Hobby** : un dépôt privé d'organisation GitHub ne peut pas être déployé sur Hobby. L'auteur du commit doit correspondre au propriétaire de l'équipe Hobby. Vérifier cette contrainte aussi pour les commits de fusion et les previews des coéquipiers. Si elle bloque, soumettre le choix de compte ou de plan au responsable technique ; ne pas rendre le dépôt public ni changer ses auteurs pour contourner le problème. [Déploiement Git](https://vercel.com/docs/git), [collaboration](https://vercel.com/docs/deployments/troubleshoot-project-collaboration).
- **Neon Free** : 100 projets, 10 branches par projet, 100 CU-heures de calcul par projet et par mois, 1 Go PostgreSQL par projet avec un plafond de 20 Go au total du compte, 5 Go de transfert réseau public par projet. Le calcul des branches `dev` et production partage le quota du projet. Mise en veille après cinq minutes d'inactivité, non désactivable sur Free. Pas de SLA inclus. Les sources présentent Free pour prototypes et petites équipes ; ne pas lui attribuer par analogie la restriction d'usage personnel de Vercel. [Plans Neon](https://neon.com/docs/introduction/plans), [mise en veille](https://neon.com/docs/introduction/scale-to-zero).

Contrôle et preuve attendus : noter le type de plan, les compteurs d'usage et le propriétaire du dépôt. Capturer seulement les métadonnées utiles. Si les conditions du compte divergent de ces repères, arrêter la mise en production et transmettre l'écart au responsable technique.

## 3. Créer le projet et relier GitHub

1. Karlos ouvre son tableau de bord Vercel, choisit **Add New / Project**, puis l'import GitHub.
2. Autoriser l'application GitHub sur le seul dépôt prévu. Pour un dépôt personnel, la documentation exige le propriétaire pour l'import ; pour une organisation, vérifier les droits et l'approbation de l'application. [Import GitHub](https://vercel.com/docs/git/vercel-for-github).
3. Contrôler propriétaire, nom du dépôt, racine de l'application et commit. Choisir le préréglage **Next.js**, racine `./` si `package.json` est bien à la racine du dépôt importé, installation `npm ci`, compilation `npm run build`. Conserver la sortie Next.js gérée par Vercel.
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

Pour chaque chaîne : dans Neon, ouvrir le projet `portail-monetique`, sélectionner la bonne branche dans **Connect**, vérifier la base, le rôle et la région, puis copier vers le champ Vercel sans passer par une conversation ou un fichier partagé. Conserver les paramètres de sécurité fournis par Neon. Ne pas afficher la chaîne pour comparer les environnements ; comparer les branches et les métadonnées des endpoints dans la console privée.

Si des variables Preview sont surchargées par branche Git, contrôler aussi ces surcharges : aucune ne doit pointer sur la production. La variable locale Development est distincte des déploiements Preview ; elle ne doit pas recevoir les identifiants de production.

Contrôle et capture attendus : noms des deux variables, environnements sélectionnés et valeurs masquées. Karlos confirme en privé que les deux secrets diffèrent. Ne pas conserver de capture de leur saisie. Une modification de variable nécessite un nouveau déploiement et ne change pas les déploiements existants. [Variables Vercel](https://vercel.com/docs/environment-variables).

### Générer un secret sans l'afficher

Karlos peut utiliser le générateur cryptographique de son gestionnaire de mots de passe, ou lancer lui-même ce bloc dans PowerShell local, hors partage d'écran, avec transcription et historique du presse-papiers désactivés :

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

PgBouncer réutilise les connexions PostgreSQL et les libère après chaque transaction. Ne pas compter sur un état SQL conservé entre deux requêtes pour cloisonner les profils. Les migrations et opérations nécessitant une session persistante demandent une connexion directe ; ici, les scripts sont appliqués séparément par Karlos dans le SQL Editor, jamais par l'application. [Pool de connexions Neon](https://neon.com/docs/connect/connection-pooling).

## 5. Fixer la région près de Neon

1. Dans Neon, confirmer que le projet et ses endpoints sont à Francfort. Si la région diffère, transmettre l'écart au responsable technique avant de configurer Vercel.
2. Dans Vercel : **Settings / Functions / Function Regions**, choisir **Frankfurt (`fra1`)**, une seule région sur Hobby, puis enregistrer.
3. Redéployer pour prendre en compte le réglage. Contrôler dans les détails de la fonction `/api/health` la région d'exécution du nouveau déploiement.

Capture attendue : `fra1` sélectionnée et région effective de la fonction. Les fichiers statiques restent distribués par le CDN ; ce réglage concerne l'exécution des fonctions. Sans réglage explicite, les nouveaux projets utilisent `iad1` selon la documentation consultée. [Région des fonctions](https://vercel.com/docs/functions/configuring-functions/region), [liste des régions](https://vercel.com/docs/regions).

Une autre possibilité, à soumettre dans une tâche dédiée, serait un fichier `vercel.json` contenant `{"regions":["fra1"]}`. Aucun fichier de configuration n'est créé par cette procédure ; le réglage retenu ici passe par le tableau de bord.

## 6. Initialiser la production et lancer le déploiement retenu

1. Obtenir l'arbitrage sur le jeu de démonstration, puis appliquer [base-de-donnees.md](base-de-donnees.md) sur la branche de production et conserver les comptages. Une branche de production non vide impose un arrêt préalable pour examen.
2. Avant publication, relire le lot. Depuis le dépôt, lancer les commandes existantes `npm run lint`, `npm test` et `npm run build`. Aucune de ces commandes ne doit contenir de migration. Vérifier les fichiers que l'équipe prévoit de publier et l'absence de secrets ou de fichiers de travail locaux.
3. Karlos et l'équipe publient le commit relu selon leur procédure. Dans Vercel **Deployments**, sélectionner le déploiement de `main`, environnement **Production**, vérifier le SHA et attendre **Ready**. Si les variables ou la région viennent de changer, utiliser **Redeploy** dans le tableau de bord après validation du plan. Ne pas promouvoir une Preview en supposant qu'elle conserve sa base `dev` : Production doit utiliser ses propres variables.
4. Relever le domaine stable de production dans **Settings / Domains**, puis ouvrir son URL HTTPS dans une fenêtre privée. Ne pas utiliser par erreur une URL de Preview pour la soutenance.

Captures attendues : état Ready, SHA, environnement Production et domaine attribué. [Intégration Git](https://vercel.com/docs/git), [certificats HTTPS](https://vercel.com/docs/domains/working-with-ssl).

## 7. Contrôles après déploiement

Consigner pour chaque contrôle : date, SHA, environnement, résultat réel et capture sans secret. Les contrôles ci-dessous restent à exécuter par Karlos ; ils ne sont pas déclarés réussis par ce document.

1. **HTTPS** : certificat accepté par le navigateur, URL finale en HTTPS, pas de contenu mixte. Ouvrir aussi l'URL HTTP et vérifier sa redirection vers HTTPS.
2. **Santé** : ouvrir `/api/health`, attendre HTTP 200 et `{"status":"ok"}`, avec `Cache-Control: no-store`. HTTP 503 et `{"status":"erreur"}` signifient qu'il faut examiner la configuration privée, la disponibilité et les quotas. Ne pas recopier une erreur de connexion contenant une chaîne. Ce contrôle prouve un accès SQL, pas la présence des sept tables ni le cloisonnement.
3. **Réveil** : après plus de cinq minutes sans activité, chronométrer le premier appel puis un second. Un délai supplémentaire est possible ; aucune durée maximale n'est promise. Avant la soutenance, faire un appel de santé et une connexion juste avant le passage, sans lancer de surveillance permanente pour empêcher la veille.
4. **Trois profils, quand disponibles** : se connecter successivement avec les comptes de test détenus en privé pour administrateur, Product Owner et commerçant. Vérifier les pages attendues et le refus des pages réservées aux autres profils. Déconnecter et vérifier qu'un rechargement d'une page privée refuse l'accès.
5. **Cookie, quand disponible** : dans les outils du navigateur, contrôler uniquement les attributs `HttpOnly`, `Secure`, `SameSite` et l'absence de domaine partagé avec les previews. Vérifier que la valeur et la signature ne figurent ni dans une capture ni dans le stockage JavaScript. Un cookie Production doit être limité à son hôte, sans `Domain=.vercel.app`.
6. **Boulangerie contre garage, quand disponible** : avec le commerçant boulangerie, noter une remise de son entreprise et vérifier qu'une remise du garage, repérée auparavant dans une session autorisée, est refusée via accès direct et modification des filtres/requêtes. Attendre un refus 403/404 ou un résultat vide selon le contrat applicatif, jamais une donnée du garage. Faire le test inverse. Inclure trésorerie, détails, impayés et exports lorsqu'ils existent. Un sélecteur caché dans l'interface ne suffit pas : vérifier aussi la réponse réseau. Ne pas inventer de route API absente.

Au stade actuel, les contrôles 4 à 6 sont bloqués par les fonctionnalités manquantes. Conserver ce statut dans le procès-verbal ; ne pas annoncer le portail prêt pour la démonstration sur la seule base du contrôle de santé.

## 8. Risques et contrôles associés

- **Cookie sans Secure ou session exposée** : vérifier les attributs dans le navigateur en HTTPS, l'invalidation après déconnexion et le refus d'une session invalide. Bloquer la recette tant que les sessions ne sont pas implémentées et testées.
- **Secret exposé ou partagé entre environnements** : variables serveur privées, aucune valeur dans Git, réponses HTTP ou captures, deux générations distinctes, surcharges Preview contrôlées. Si exposition : rotation par Karlos et nouveau déploiement ; un retour au code précédent n'annule pas la fuite.
- **Preview branchée sur la production** : double contrôle des sélecteurs Neon et du périmètre des variables, puis comparaison des comptages privés par environnement. Interdire les tests d'écriture en production.
- **Jeu de démonstration accessible sur Internet** : comptes protégés avec mots de passe propres à la production, données fictives, pages privées refusées sans session, test croisé et aucun identifiant de connexion dans les documents publics. Faire valider le jeu et son accès par le responsable technique avant le seed.
- **Veille au premier appel** : test après inactivité et réveil juste avant la démonstration. Contrôler aussi les quotas, partagés entre branches ; ne pas confondre veille et quota épuisé.
- **Restriction Hobby sur GitHub ou auteur du commit** : vérifier propriétaire, visibilité et auteur avant la liaison ; escalader au responsable technique si incompatible.
- **Mauvaise région** : prouver `fra1` dans le réglage et dans la fonction déployée ; ne pas déduire la région serveur du domaine ou du CDN.
- **Régression après un push sur main** : relever SHA et dernier déploiement sain, contrôler chaque déploiement et geler le lot de soutenance selon le calendrier de l'équipe.

## 9. Retour arrière de l'application

Après accord de Karlos, utiliser le tableau de bord pour rétablir le dernier déploiement de production sain, puis revérifier domaine, HTTPS, santé et accès. Vérifier ensuite le suivi des déploiements automatiques avant la prochaine publication. Pour un premier déploiement sans version saine, suspendre la mise en service et demander au responsable technique un plan de retrait ; ne rien supprimer par défaut.

Un retour arrière Vercel ne restaure ni le schéma Neon, ni ses données, ni les secrets. La restauration de la base suit la procédure séparée, et toute rotation doit rester cohérente avec le déploiement actif.
