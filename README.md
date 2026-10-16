# SK9K ARENA — prototype 0.1

Prototype local du jeu multijoueur 2D inspiré du genre Slither.io. Il comprend une arène partagée via WebSocket, des comptes locaux, des déplacements calculés côté serveur, le boost qui consomme de la vie, des orbes, collisions, éliminations et respawn. Les comptes sont stockés dans SQLite et les mots de passe sont hachés avec bcrypt.

## Prérequis
- Node.js 20 ou plus récent
- npm (fourni avec Node.js)
- Un navigateur moderne

## Installation
1. Décompressez l'archive dans un dossier, par exemple `C:\SK9K-Arena`.
2. Ouvrez un terminal dans ce dossier.
3. Lancez `npm install`.
4. Lancez `npm start`.
5. Ouvrez `http://localhost:3000` dans votre navigateur.
6. Pour tester le multijoueur local, ouvrez l'adresse dans deux fenêtres ou profils de navigateur et créez deux comptes différents.

Le serveur reste actif tant que le terminal tourne. Pour l'arrêter : `Ctrl+C`.

## Commandes
- `npm start` : lancer le serveur.
- `npm run dev` : redémarrer automatiquement le serveur lorsque les fichiers serveur changent.

## Contrôles
- Souris : diriger le serpent.
- Maintenir clic gauche ou Espace : boost, qui consomme de la vie.
- Ramasser les orbes : regagner de la vie.
- Se cogner à un autre serpent : élimination et réapparition après un court délai.

## Ce qui est réellement inclus
- Authentification locale avec création de compte et connexion.
- Pseudos limités à lettres ASCII, chiffres et underscore (3–16 caractères), donc pas d'emojis.
- Mots de passe hachés avec bcrypt.
- SQLite pour les comptes, monnaie fictive et ELO initial.
- Serveur WebSocket autoritaire pour positions, boost, vie, collisions, orbes et état partagé de l'arène.
- Un bot d'entraînement clairement indiqué, contrôlé côté serveur, pour que l'arène ne soit pas vide.
- Interface responsive simple, indicateur de connexion, vie et nombre de joueurs.
- Une couronne SK9K discrète côté serveur pour le compte `sk9k` (le nom est réservé à ce compte à l'inscription).

## Pas encore inclus
- Hébergement public et matchmaking entre machines distantes.
- Ranked complet, calcul d'ELO de fin de partie et saisons.
- 1v1 public/privé, amis, invitations et chat.
- Boutique/casier complet, inventaire de cosmétiques et paiements (aucun paiement réel prévu).
- Événements dynamiques synchronisés, classement mondial, récupération de compte par e-mail.
- Tests automatisés complets, modération et protections anti-abus avancées.

## Sécurité / limites
Cette version est conçue pour le développement local, pas pour un serveur public. Les sessions utilisent un jeton aléatoire en mémoire : redémarrer le serveur déconnecte les utilisateurs. N'exposez pas ce serveur à Internet sans ajouter HTTPS/WSS, limitation de débit, gestion robuste des sessions, validation plus stricte, sauvegardes et protections anti-triche. Le compte `sk9k` est réservé par comparaison insensible à la casse, mais en local toute personne peut tenter de créer ce pseudo en premier ; créez ce compte vous-même avant tout autre compte. Pour une production, précréez le compte administrativement et empêchez l'inscription publique à ce nom.

## Tests manuels
1. Créez un compte, déconnectez-vous puis reconnectez-vous.
2. Essayez un pseudo avec emoji ou espace : il doit être refusé.
3. Ouvrez deux fenêtres et connectez deux comptes : les deux serpents doivent apparaître.
4. Maintenez le boost : la vitesse augmente et la vie baisse.
5. Ramassez les orbes : la vie remonte.
6. Entrez en collision avec un autre serpent : vous devez réapparaître.
7. Vérifiez que le nombre de joueurs et l'indicateur de connexion changent.
8. Vérifiez la couronne à côté de `sk9k`.

## Dépannage
- `npm` introuvable : installez Node.js LTS puis rouvrez le terminal.
- Port 3000 occupé : définissez `PORT=3001` (PowerShell : `$env:PORT=3001`; CMD : `set PORT=3001`) puis `npm start`.
- Erreur de compilation de `better-sqlite3` : utilisez Node.js 20 ou 22 LTS et réessayez `npm install`.
