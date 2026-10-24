# Salle

Application personnelle de suivi d'entraînement pour iPhone.
Aucun serveur et aucun compte : tes données restent sur ton téléphone.

## Installer

1. Mets le contenu de ce dossier dans un dépôt GitHub (Public).
2. Dans le dépôt : Settings → Pages → Branch `main`, dossier `/ (root)` → Save.
3. Attends 1 à 2 minutes. L'adresse est `https://TON-PSEUDO.github.io/NOM-DU-DEPOT/`.
4. Sur l'iPhone, ouvre l'adresse dans Safari → Partager → « Sur l'écran d'accueil ».
5. À partir de là, ouvre toujours Salle depuis l'icône : c'est là que tes données sont gardées.

## Sauvegarder

Réglages (rond avec ton initiale) → « Sauvegarder dans Fichiers » → « Enregistrer dans Fichiers ».
Choisis toujours le même dossier et « Remplacer » pour garder un seul fichier à jour.
Pour récupérer tes données (nouveau téléphone…) : « Restaurer depuis un fichier ».

## Modifier le programme

Change `js/data.js`, puis augmente le numéro `VERSION` dans `sw.js`, et remets les deux fichiers
sur GitHub. L'app se met à jour au lancement suivant.
Ne change pas les `id` des exercices : tes réglages y sont rattachés.

## Ce qui est public

Le dépôt GitHub contient seulement l'app et le programme.
Ton prénom, ton objectif et tes pointages ne sont jamais envoyés : ils restent dans l'app sur ton iPhone.
