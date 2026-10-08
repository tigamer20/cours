# École en ligne

Plateforme de gestion scolaire : cours, horaire, plan d’évaluation, remise de travaux, notes, absences, documents de cours, calendrier, messagerie et dossiers étudiants, avec trois types de comptes (administrateur, enseignant, étudiant).

- **Aucune dépendance npm.** Tout repose sur Node.js 24 : `node:sqlite` pour la base de données, `crypto.scrypt` pour les mots de passe et `node:http` pour le serveur. Il n’y a pas de bibliothèque tierce à auditer ou à mettre à jour.
- Le frontend est en JavaScript natif (modules ES), sans étape de build.

---

## Fonctionnalités

| | Étudiant | Enseignant | Admin |
|---|:-:|:-:|:-:|
| Tableau de bord (échéances, événements, documents récents) | ✔ | ✔ | ✔ |
| Horaire hebdomadaire | le sien | le sien | toute l’école ou celui de n’importe qui |
| Calendrier (évaluations + événements) | voir | ajouter dans ses cours | ajouter partout, y compris des événements globaux |
| Documents de cours | voir le PDF dans le navigateur, télécharger | publier, supprimer, **voir qui l’a ouvert et quand** | tout |
| Plan d’évaluation (pondérations, échéances) | voir | créer, modifier | tout |
| Remise de travaux | remettre (et remettre à nouveau) | voir les remises, retards, versions | tout |
| Notes | les siennes, une fois publiées, avec sa moyenne pondérée | saisie, commentaires, publication, relevé et export CSV | tout |
| Absences | les siennes | prise des présences, bilan | tout |
| Messagerie | écrire à ses enseignants et à l’administration | écrire à ses étudiants (un à un ou à tout un groupe) et au personnel | écrire à tout le monde |
| Dossier étudiant | le sien | ses étudiants, limité à ses cours | tous, complets |
| Comptes (création étudiant, enseignant, admin, désactivation, réinitialisation) | | | ✔ |
| Gestion des cours, enseignants assignés, inscriptions, horaire | | horaire de ses cours | ✔ |
| Vue d’ensemble et journal d’activité (connexions, notes, remises, documents consultés…) | | | ✔ |

---

## Lancer en local

Prérequis : **Node.js 24** ou plus récent (`node --version`).

```bash
npm start
```

Ouvrez ensuite http://localhost:3000. Pour relancer automatiquement à chaque modification, utilisez `npm run dev`.

### Comptes de démonstration

En local, au premier démarrage avec une base vide, des données de démo sont créées : 3 cours, 2 enseignants, 6 étudiants, des notes, des absences, des documents PDF et des messages. Tous les comptes de démo ont le mot de passe **`demo12345`**.

| Rôle | Courriel |
|---|---|
| Administrateur | `admin@ecole.test` |
| Enseignant | `prof.tremblay@ecole.test`, `prof.roy@ecole.test` |
| Étudiant | `etudiant@ecole.test`, `n.cote@ecole.test`, `e.pelletier@ecole.test`… |

- Pour repartir de zéro : `npm run reset` (supprime `data/`), puis `npm start`.
- Les données de démo ne sont **jamais** créées en production (`NODE_ENV=production`), sauf si `SEED_DEMO=true`.

### Tests

```bash
npm test
```

Les tests démarrent un serveur sur une base temporaire. Ils vérifient les permissions de chaque rôle, la remise et la correction des travaux, le suivi des consultations de documents, la messagerie, le calendrier et la protection CSRF.

---

## Déploiement sur Render

Render héberge l’application comme un **Web Service Node**. Deux points sont essentiels :

1. **Disque persistant.** La base SQLite et les fichiers téléversés vivent dans `DATA_DIR`. Sans disque, le système de fichiers de Render est effacé à chaque déploiement ou redémarrage, et toutes les données sont perdues. Un disque exige une instance **payante** (Starter, environ 7 $/mois, plus 0,25 $/Go/mois pour le disque).
2. **Premier administrateur.** En production, il n’y a pas de données de démo. Le premier compte admin est créé à partir de `ADMIN_EMAIL` et `ADMIN_PASSWORD` au premier démarrage. Ensuite, tous les autres comptes se créent depuis l’interface (*Administration → Comptes*).

### Étape 0 : pousser le code sur GitHub

Le dépôt doit contenir ce projet à sa racine, avec `package.json`, `server.js` et `render.yaml`.

```bash
git push origin main
```

### Option A : Blueprint (recommandé, tout est préconfiguré)

Le fichier [`render.yaml`](render.yaml) décrit le service complet : Node 24, disque de 1 Go monté sur `/var/data`, vérification de santé et variables d’environnement.

1. Sur https://dashboard.render.com, choisissez **New → Blueprint**.
2. Connectez votre compte GitHub, puis choisissez le dépôt (par ex. `tigamer20/cours`) et la branche `main`.
3. Render lit `render.yaml` et vous demande les deux valeurs secrètes :
   - `ADMIN_EMAIL` : votre courriel d’administrateur ;
   - `ADMIN_PASSWORD` : un mot de passe fort (8 caractères minimum).
4. Cliquez sur **Apply** (ou **Deploy Blueprint**). Le premier déploiement prend 1 à 3 minutes.
5. Ouvrez l’URL `https://ecole-en-ligne-xxxx.onrender.com` et connectez-vous avec `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
6. Changez ensuite votre mot de passe dans **Mon profil**. Vous pouvez supprimer `ADMIN_PASSWORD` des variables d’environnement : il ne sert qu’au tout premier démarrage.

### Option B : configuration manuelle

1. Choisissez **New → Web Service**, puis le dépôt GitHub.
2. Remplissez les champs :

   | Champ | Valeur |
   |---|---|
   | Language / Runtime | `Node` |
   | Branch | `main` |
   | Root Directory | *(vide, ou le sous-dossier si le projet n’est pas à la racine)* |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | **Starter** (requis pour le disque) |

3. Sous **Advanced → Add Disk** :

   | Champ | Valeur |
   |---|---|
   | Name | `ecole-data` |
   | Mount Path | `/var/data` |
   | Size | `1` Go (agrandissable plus tard, jamais réductible) |

4. Sous **Environment → Environment Variables** :

   | Clé | Valeur | Rôle |
   |---|---|---|
   | `NODE_ENV` | `production` | désactive les données de démo |
   | `NODE_VERSION` | `24` | version de Node utilisée par Render |
   | `DATA_DIR` | `/var/data` | **doit correspondre au Mount Path du disque** |
   | `ADMIN_EMAIL` | votre courriel | premier compte admin |
   | `ADMIN_PASSWORD` | mot de passe fort | premier compte admin |
   | `MAX_UPLOAD_MB` | `25` *(optionnel)* | taille maximale d’un fichier téléversé |

5. Sous **Advanced → Health Check Path**, indiquez `/api/health`.
6. Cliquez sur **Create Web Service**.

> Ne définissez pas `PORT` : Render le fournit lui-même, et le serveur écoute automatiquement sur `process.env.PORT` (adresse `0.0.0.0`).

### Tester gratuitement (plan Free, sans disque)

Le plan Free fonctionne pour une démo, avec deux limites :

- **pas de disque** : les données sont effacées à chaque redéploiement, redémarrage ou mise en veille ;
- le service **s’endort** après 15 minutes d’inactivité, et le premier chargement suivant prend environ 1 minute.

Configuration pour une démo : instance **Free**, aucun disque, et les variables `NODE_ENV=production`, `NODE_VERSION=24`, `SEED_DEMO=true`. `DATA_DIR` n’est pas nécessaire (le dossier `./data` sera utilisé). Les comptes de démo (`admin@ecole.test` / `demo12345`, etc.) sont alors recréés à chaque démarrage.

⚠️ N’utilisez **jamais** `SEED_DEMO=true` sur un site réel : les mots de passe de démo sont publics dans ce README.

### Nom de domaine personnalisé (optionnel)

Allez dans **Settings → Custom Domains → Add**, puis ajoutez l’enregistrement DNS (CNAME) indiqué par Render chez votre registraire. Le certificat HTTPS est automatique.

### Mises à jour

Chaque `git push` sur `main` redéploie automatiquement (**Auto-Deploy**). Les données restent sur le disque. Le schéma de la base est créé ou complété au démarrage (`CREATE TABLE IF NOT EXISTS`).

> Avec un disque attaché, Render arrête l’ancienne instance avant de démarrer la nouvelle. Le site est donc indisponible quelques secondes pendant un déploiement.

### Sauvegardes

Render prend un **instantané quotidien du disque**, conservé 7 jours. Vous pouvez le restaurer depuis **Disks → Snapshots**. Pour une copie manuelle, ouvrez le **Shell** du service sur Render :

```bash
cd /var/data && tar czf /tmp/sauvegarde.tgz ecole.db* uploads
```

### Dépannage

| Symptôme | Cause probable |
|---|---|
| Les données disparaissent après un déploiement | Pas de disque, ou `DATA_DIR` différent du *Mount Path* |
| « Aucun utilisateur : définissez ADMIN_EMAIL… » dans les logs | `ADMIN_EMAIL` / `ADMIN_PASSWORD` absents au premier démarrage : ajoutez-les puis **Manual Deploy → Restart** |
| `Cannot find module 'node:sqlite'` ou erreur de syntaxe | Mauvaise version de Node : vérifiez `NODE_VERSION=24` |
| Connexion qui « ne tient pas » | Ouvrez le site en `https://` : les cookies de session sont marqués `Secure` derrière le proxy HTTPS de Render |
| Échec du health check | Vérifiez que le *Health Check Path* est `/api/health` et lisez les **Logs** |

---

## Variables d’environnement

| Variable | Défaut | Description |
|---|---|---|
| `PORT` | `3000` | Port d’écoute (fourni par Render) |
| `HOST` | `0.0.0.0` | Adresse d’écoute |
| `DATA_DIR` | `./data` | Dossier de la base SQLite et des fichiers téléversés |
| `NODE_ENV` | | `production` désactive les données de démo |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | | Premier admin, créé seulement si la base n’a aucun utilisateur |
| `SEED_DEMO` | | `true` force les données de démo, `false` les empêche en local |
| `MAX_UPLOAD_MB` | `25` | Taille maximale d’un fichier |

---

## Structure

```
server.js              serveur HTTP, routage, fichiers statiques, en-têtes de sécurité
src/db.js              schéma SQLite et utilitaires
src/auth.js            mots de passe (scrypt), sessions, limitation des tentatives de connexion
src/access.js          règles d’accès (qui peut voir ou gérer quel cours, quel dossier)
src/files.js           téléversement et envoi des fichiers
src/seed.js            premier admin et données de démo
src/routes/users.js    connexion, profil, comptes, contacts
src/routes/courses.js  cours, inscriptions, horaire, présences
src/routes/coursework.js  documents, évaluations, notes, remises
src/routes/general.js  tableau de bord, calendrier, messagerie, dossiers, administration
public/                interface (index.html, styles.css, app.js, js/*.js)
test/api.test.js       tests de l’API
render.yaml            Blueprint Render
```

## Sécurité

- Les mots de passe sont hachés avec scrypt et un sel aléatoire. Ils ne sont jamais renvoyés par l’API.
- Les sessions utilisent un cookie `HttpOnly`, `SameSite=Strict` et `Secure` en HTTPS. Seule l’empreinte SHA-256 du jeton est stockée en base, et une session expire après 7 jours.
- Protection CSRF : toute requête qui modifie des données doit porter l’en-tête `X-Requested-With`, impossible à envoyer depuis un autre site sans autorisation CORS.
- Après 10 échecs de connexion en 15 minutes (même IP et même courriel), les tentatives sont bloquées.
- Toutes les requêtes SQL sont paramétrées, et chaque route vérifie le rôle et l’appartenance au cours.
- Seuls les PDF, les images et le texte s’affichent dans le navigateur. Tout autre fichier (HTML, SVG…) est forcé en téléchargement avec `nosniff` et une CSP `sandbox`, ce qui empêche l’exécution de script.
- L’interface applique une Content-Security-Policy stricte (`script-src 'self'`), et tout contenu dynamique est échappé.
- Les actions importantes sont consignées dans un journal d’activité, consultable par les administrateurs.
