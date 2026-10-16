# Correction Render : better-sqlite3

Cette version met `better-sqlite3` à `^12.10.0` et fixe Node.js à `24.21.0`, une version compatible avec les versions récentes de better-sqlite3.

## Réglages Render
- Runtime : Node
- Build Command : `npm install`
- Start Command : `npm start`
- Root Directory : dossier contenant `package.json` (laisser vide si le dépôt est déjà à la racine)

## À faire après avoir remplacé les fichiers
1. Commit et push les fichiers mis à jour vers le dépôt Git connecté à Render.
2. Dans Render > service > Settings > Build, vérifie les commandes ci-dessus.
3. Dans Environment, si `NODE_VERSION` est déjà défini, mets `24.21.0` ou supprime-le pour laisser `.node-version` définir la version.
4. Déclenche un nouveau déploiement avec effacement du cache de build si l'option est proposée.
5. Vérifie que le journal annonce Node 24 et que `npm install` termine sans erreur.
6. Une fois déployé, teste `/api/health`.

## Important : persistance de SQLite
Un disque Render persistant doit être configuré pour conserver `sk9k-arena.db` entre les déploiements/redémarrages. Sans disque persistant, les comptes locaux stockés dans ce fichier peuvent être perdus lors d'un nouveau déploiement. Sur un service Render, configure un disque monté à `/var/data`, puis adapte le chemin SQLite dans `server.js` à `/var/data/sk9k-arena.db` avant de compter sur la persistance.

## Si le déploiement échoue encore
Le warning `prebuild-install` seul ne suffit pas à identifier la cause. Copie les 30 à 50 dernières lignes du journal de build, en masquant les secrets éventuels.
