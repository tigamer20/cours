# Cartable

Plateforme scolaire moderne : cours, horaire, plan d’évaluation, remise de travaux, notes, absences, documents de cours (avec règles de publication), calendrier, messagerie et dossiers étudiants. Trois types de comptes : administrateur, enseignant, étudiant.

- **100 % gratuit à héberger** : Render (plan gratuit) + base de données en ligne Turso (plan gratuit).
- **Aucune dépendance npm.** Node.js 24 seulement : `node:sqlite` en local, l’API HTTP de Turso en ligne, `crypto.scrypt` pour les mots de passe. Rien de tiers à auditer.
- Interface personnalisable par chaque utilisateur : thème clair/sombre/auto, couleur d’accent, densité, taille du texte, coins, arrière-plan, menu réduit, animations. Recherche rapide avec **Ctrl + K**.

---

## Fonctionnalités

| | Étudiant | Enseignant | Admin |
|---|:-:|:-:|:-:|
| Tableau de bord (échéances, événements, documents récents) | ✔ | ✔ | ✔ |
| Horaire hebdomadaire | le sien | le sien | toute l’école ou celui de n’importe qui |
| Calendrier (évaluations + événements) | voir | ajouter dans ses cours | ajouter partout, y compris des événements globaux |
| Documents de cours | voir le PDF dans le navigateur, télécharger (si permis), confirmer la lecture | publier avec **règles de publication**, voir qui a ouvert / confirmé et quand | tout |
| Plan d’évaluation (pondérations, échéances) | voir | créer, modifier | tout |
| Remise de travaux | remettre (et remettre à nouveau) | voir les remises, retards, versions | tout |
| Notes | les siennes, une fois publiées, avec moyenne pondérée | saisie, commentaires, publication, relevé, export CSV | tout |
| Absences | les siennes | prise des présences, bilan | tout |
| Messagerie | ses enseignants et l’administration | ses étudiants (un à un ou tout un groupe) et le personnel | tout le monde |
| Dossier étudiant | le sien | ses étudiants, limité à ses cours | tous |
| Comptes, cours, inscriptions, nom et couleur de l’établissement | | | ✔ |
| Vue d’ensemble et journal d’activité | | | ✔ |

### Règles de publication des documents (enseignants)

Pour chaque document :

- **Brouillon** : invisible pour les étudiants, jusqu’à ce que l’enseignant le publie.
- **Publication programmée** : le document apparaît automatiquement à la date choisie.
- **Disponible jusqu’au** : le document disparaît automatiquement après cette date.
- **Destinataires** : tout le groupe, ou seulement certains étudiants.
- **Consultation seulement** : l’étudiant peut ouvrir le PDF dans le site, mais pas le télécharger.
- **Lecture obligatoire** : l’étudiant doit cliquer « J’ai lu ». L’enseignant voit qui l’a fait et quand.
- **Avis automatique** : un message est envoyé aux étudiants concernés dès que le document devient visible.

Chaque cours a aussi des **règles par défaut**, appliquées aux nouveaux documents : commencer en brouillon, consultation seulement, lecture obligatoire, avis, durée de disponibilité, catégorie.

---

## Lancer en local

Prérequis : **Node.js 24** ou plus récent (`node --version`).

```bash
npm start
```

Ouvrez ensuite http://localhost:3000. Pour relancer automatiquement à chaque modification, utilisez `npm run dev`.

Sans `DATABASE_URL`, l’application utilise un fichier SQLite local dans `data/`. Au premier démarrage, des **données de démo** sont créées. Tous les comptes de démo ont le mot de passe `demo12345` :

| Rôle | Courriel |
|---|---|
| Administrateur | `admin@ecole.test` |
| Enseignant | `prof.tremblay@ecole.test`, `prof.roy@ecole.test` |
| Étudiant | `etudiant@ecole.test`, `n.cote@ecole.test`, `e.pelletier@ecole.test`… |

- Pour repartir de zéro : `npm run reset`.
- Pour lancer les tests : `npm test`. La suite complète roule deux fois : contre SQLite local, puis contre le pilote Turso, au moyen d’un faux serveur Turso.

---

## Déploiement sur Render (plan gratuit, 0 $)

Sur le plan gratuit de Render, le disque est **effacé** à chaque mise en veille (après 15 minutes sans visite), à chaque redémarrage et à chaque déploiement. Cartable garde donc **toutes** ses données dans une base en ligne gratuite, **Turso**, compatible SQLite : comptes, notes, messages, et aussi les fichiers téléversés.

### Étape 1 : créer la base de données Turso (gratuite)

1. Allez sur https://turso.tech et créez un compte (connexion GitHub possible). Le plan gratuit ne demande pas de carte de crédit.
2. Dans le tableau de bord, cliquez sur **Create Database** :
   - Nom : `cartable`
   - Région : **AWS us-west-2 (Oregon)**, la même région que le service Render, pour que ce soit rapide.
3. Ouvrez la base et copiez son **URL**. Elle ressemble à `libsql://cartable-votrenom.turso.io`.
4. Cliquez sur **Create Token** (accès *Read & Write*, sans expiration) et copiez le **jeton**. Il n’est affiché qu’une seule fois.

<details><summary>Avec l’outil en ligne de commande Turso (facultatif)</summary>

```bash
turso db create cartable --location aws-us-west-2
```
```bash
turso db show cartable --url
```
```bash
turso db tokens create cartable
```
</details>

Il n’y a rien d’autre à faire : les tables sont créées automatiquement au premier démarrage.

### Étape 2 : créer le service sur Render

**Option A : Blueprint (recommandé).** Le fichier [`render.yaml`](render.yaml) contient déjà toute la configuration.

1. Sur https://dashboard.render.com, choisissez **New → Blueprint**.
2. Choisissez le dépôt GitHub `tigamer20/cours`, branche `main`.
3. Render demande quatre valeurs :

   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | l’URL Turso (`libsql://cartable-….turso.io`) |
   | `DATABASE_TOKEN` | le jeton Turso |
   | `ADMIN_EMAIL` | votre courriel d’administrateur |
   | `ADMIN_PASSWORD` | un mot de passe fort (8 caractères minimum) |

4. Cliquez sur **Apply**. Le déploiement prend 1 à 3 minutes.

**Option B : configuration manuelle.** Choisissez **New → Web Service**, puis le dépôt GitHub, et remplissez :

| Champ | Valeur |
|---|---|
| Language | `Node` |
| Branch | `main` |
| Region | `Oregon (US West)` |
| Root Directory | *(vide)* |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | **Free** |
| Health Check Path (sous *Advanced*) | `/api/health` |

Ensuite, sous **Environment Variables** :

| Clé | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24` |
| `DATABASE_URL` | URL Turso (`libsql://….turso.io`) |
| `DATABASE_TOKEN` | jeton Turso |
| `ADMIN_EMAIL` | votre courriel d’administrateur |
| `ADMIN_PASSWORD` | mot de passe fort |
| `MAX_UPLOAD_MB` | `15` *(facultatif)* |

> Ne définissez **pas** `PORT` : Render le fournit lui-même.

### Étape 3 : première connexion

1. Ouvrez `https://cartable-xxxx.onrender.com`.
2. Connectez-vous avec `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. Dans **Administration → Établissement**, entrez le nom de l’école, un slogan et une couleur.
4. Dans **Comptes**, créez les enseignants et les étudiants. Dans **Gestion des cours**, créez les cours et faites les inscriptions.
5. Changez votre mot de passe dans **Mon profil**. Vous pouvez ensuite retirer `ADMIN_PASSWORD` de Render : il ne sert qu’au tout premier démarrage.

### Bon à savoir sur le plan gratuit

- **Mise en veille** : après 15 minutes sans visite, le service s’endort. La visite suivante prend environ 1 minute à charger, mais aucune donnée n’est perdue, car tout est dans Turso. Pour éviter la veille, un moniteur gratuit (par ex. UptimeRobot) peut appeler `https://votre-app.onrender.com/api/health` toutes les 10 minutes. Une seule application allumée 24 h sur 24 consomme environ 744 h par mois, sous la limite gratuite de 750 h de Render (à vérifier dans votre tableau de bord).
- **Limites Turso gratuites** (à vérifier sur turso.tech) : 5 Go de stockage, 500 millions de lignes lues et 10 millions de lignes écrites par mois. C’est largement suffisant pour une école ; les fichiers comptent dans les 5 Go.
- **Taille des fichiers** : 15 Mo par défaut (`MAX_UPLOAD_MB`). L’instance gratuite n’a que 512 Mo de mémoire.
- **Sauvegardes** : Turso offre une restauration à un moment précis (Point-in-Time Restore, durée limitée sur le plan gratuit). Pour une copie complète : `turso db shell cartable .dump > sauvegarde.sql`.

### Dépannage

| Symptôme | Cause probable |
|---|---|
| Logs : « ATTENTION : DATABASE_URL absent » | Variables Turso manquantes : les données seront perdues à la prochaine veille. |
| Logs : `HTTP 401` vers la base | Jeton Turso invalide ou expiré : créez-en un nouveau. |
| Logs : « Aucun utilisateur : définissez ADMIN_EMAIL… » | Ajoutez `ADMIN_EMAIL` / `ADMIN_PASSWORD`, puis **Manual Deploy → Restart service**. |
| `Cannot find module 'node:sqlite'` | Vérifiez `NODE_VERSION=24`. |
| La connexion ne tient pas | Utilisez l’adresse `https://` : les cookies sont `Secure` derrière le proxy de Render. |

---

## Variables d’environnement

| Variable | Défaut | Description |
|---|---|---|
| `DATABASE_URL` | | URL Turso `libsql://…` ; si absente, SQLite local dans `DATA_DIR` |
| `DATABASE_TOKEN` | | Jeton d’accès Turso |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | | Premier admin, créé seulement si la base n’a aucun utilisateur |
| `NODE_ENV` | | `production` désactive les données de démo |
| `SEED_DEMO` | | `true` force les données de démo (jamais sur un vrai site : les mots de passe sont publics) |
| `MAX_UPLOAD_MB` | `15` | Taille maximale d’un fichier |
| `PORT`, `HOST` | `3000`, `0.0.0.0` | Fournis par Render |
| `DATA_DIR` | `./data` | Base locale et cache des fichiers |

---

## Structure

```
server.js                 serveur HTTP, routage, fichiers statiques, en-têtes de sécurité
src/db.js                 pilotes de base de données (Turso HTTP / SQLite local), schéma, migrations
src/auth.js               mots de passe (scrypt), sessions, limitation des tentatives de connexion
src/access.js             règles d’accès (qui voit / gère quel cours, quel document, quel dossier)
src/files.js              fichiers stockés en morceaux dans la base, cache local
src/seed.js               premier admin et données de démo
src/routes/users.js       connexion, profil, préférences, comptes, paramètres de l’établissement
src/routes/courses.js     cours, règles par défaut, inscriptions, horaire, présences
src/routes/coursework.js  documents et règles de publication, évaluations, notes, remises
src/routes/general.js     tableau de bord, calendrier, messagerie, dossiers, administration
public/                   interface (index.html, styles.css, app.js, js/*.js)
test/                     tests de l’API (local + faux serveur Turso)
render.yaml               Blueprint Render (plan gratuit)
```

## Sécurité

- Les mots de passe sont hachés avec scrypt et un sel aléatoire. Ils ne sont jamais renvoyés par l’API.
- Les sessions utilisent un cookie `HttpOnly`, `SameSite=Strict` et `Secure` en HTTPS. Seule l’empreinte SHA-256 du jeton est stockée, et la session expire après 7 jours.
- Protection CSRF : toute requête qui modifie des données doit porter l’en-tête `X-Requested-With`.
- Les tentatives de connexion sont limitées à 10 échecs en 15 minutes (par IP et par courriel).
- Les requêtes SQL sont paramétrées, et chaque route vérifie le rôle et l’appartenance au cours.
- Les règles de publication sont appliquées côté serveur. Un brouillon, un document programmé, expiré ou destiné à d’autres étudiants renvoie « introuvable », même si on devine son adresse.
- Seuls les PDF, les images et le texte s’affichent dans le navigateur. Tout autre fichier est forcé en téléchargement, avec `nosniff` et une CSP `sandbox`.
- L’interface applique une Content-Security-Policy stricte (`script-src 'self'`), et tout contenu dynamique est échappé.
- La « consultation seulement » empêche le téléchargement via Cartable. Un étudiant peut quand même faire une capture d’écran ou utiliser l’impression du lecteur PDF : c’est une dissuasion, pas une protection absolue.
