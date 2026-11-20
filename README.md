# Hogwarts Phone

Application mobile de téléphone virtuel pour l'univers de Poudlard.

## Stack
- React + TypeScript + Vite
- Vercel Functions (API)
- Better Auth avec OAuth Discord
- Neon PostgreSQL

## Connexion Discord
L'authentification utilise Better Auth sur les fonctions API Vercel. Le compte joueur est créé dans \`app_users\` à sa première connexion et reçoit automatiquement le statut \`pending\`. Le statut appartient au compte Discord, jamais aux personnages.

Après validation du compte par l'administration :
- le joueur peut accéder à l'application ;
- l'API ne lui renvoie que les personnages dont il est propriétaire ;
- les personnages sont disponibles dès leur création et ne possèdent aucun statut de validation.

## Variables d'environnement
Configurer les variables de \`.env.example\` dans les variables d'environnement du projet Vercel et dans un fichier \`.env.local\` pour le développement. Ne jamais committer les vraies valeurs.

Dans le portail Discord Developer, ajouter les URL de redirection suivantes à l'application Discord :
- Local : \`http://localhost:5173/api/auth/callback/discord\`
- Production : \`https://VOTRE-DOMAINE-VERCEL/api/auth/callback/discord\`

La valeur de production doit correspondre exactement au domaine de l'application.

## Schéma Better Auth
Better Auth utilise ses propres tables \`user\`, \`session\`, \`account\` et \`verification\`, séparées des tables métier \`app_users\` et \`characters\`. Après configuration des variables d'environnement, générer le schéma avec :

\`\`\`bash
npx auth generate
\`\`\`

Vérifier le SQL généré avant de l'appliquer à Neon. Ne pas lancer de migration directement sur la branche principale sans l'avoir testée sur une branche Neon.

## Développement
\`\`\`bash
npm install
npm run dev
\`\`\`


## Profils, applications et médias

La migration `migrations/003_media_and_character_details.sql` ajoute l'orientation sexuelle verrouillée après validation, les références de portraits et les pièces jointes aux publications et messages. Elle crée également `media_assets`, qui conserve les fichiers importés par les joueurs dans PostgreSQL.

Les fichiers importés sont limités à 10 Mo et aux images JPEG/PNG/WebP/GIF ainsi qu'aux vidéos MP4/WebM. L'API `/api/media` vérifie le compte Discord et la propriété du personnage avant chaque importation. Les médias publiés sont ensuite accessibles aux autres comptes autorisés.

L'orientation sexuelle est demandée une seule fois lors de la première ouverture du téléphone d'un personnage. Une fois validée, elle est verrouillée et affichée dans Contacts, Instagram et les demandes de liens.
