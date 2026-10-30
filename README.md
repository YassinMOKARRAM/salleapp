# Salle

Application personnelle de suivi d'entraînement pour iPhone.
Aucun serveur et aucun compte : tes données restent sur ton téléphone.

Version actuelle : `salle-2026-10-30-2` (visible dans Réglages → Application).

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

Directement dans l'app : onglet Séances → « Modifier » au-dessus des exercices.
Tu peux changer le nom de la séance, ajouter, modifier, supprimer ou réordonner les exercices
(séries, répétitions, repos, consigne, % du 1RM, dropset, poids du corps).
Les changements s'appliquent au jour de la semaine choisi et sont inclus dans la sauvegarde Fichiers.
« Revenir au programme d'origine » (Réglages) remet le contenu de `js/data.js`.

## Pendant la séance

- Touche la case d'un exercice à chaque série faite : elle se remplit (1/3, 2/3, 3/3) puis se coche.
- Appui long sur la case : retire une série.
- Le repos se lance tout seul après chaque série (désactivable dans Réglages → Séance).

## Suivre sa progression

- Charges : sur chaque exercice, « Noter » enregistre la charge et les répétitions (et coche l'exercice).
  La semaine suivante, l'app affiche « Dernière fois » et un conseil pour progresser.
- Onglet Évolution : poids de corps (« Pesée », courbe, objectif) et progression des charges par exercice.
- Note de séance : sous la liste des exercices, enregistrée automatiquement.
- « Mon max » (exercices à charge) : indique ta série la plus lourde réussie (poids + répétitions).
  L'app estime ton max (formule d'Epley) et affiche la charge conseillée pour les répétitions prévues,
  avec environ 2 répétitions en réserve, arrondie à 0,5 kg. Avec un % du 1RM : max estimé × %.
  Dropset : la baisse s'applique à cette charge. C'est une estimation, ajuste selon tes sensations.

## Mises à jour

L'app vérifie s'il existe une nouvelle version à chaque ouverture et à chaque retour dedans.
Juste après l'ouverture, elle se recharge toute seule ; sinon un bandeau « Nouvelle version disponible »
propose « Mettre à jour ». Le numéro de version est affiché dans Réglages.

Pour publier une modification : change `VERSION` dans `sw.js` **et** `APP_VERSION` dans `js/main.js`
(même valeur), puis remets les fichiers sur GitHub.

## Tests

`node tests/run.mjs` (Node 18 ou plus, aucune installation) : programme, inversion mardi/mercredi,
séries, minuteur, « Mon max », sauvegarde, version.

## Ce qui est public

Le dépôt GitHub contient seulement l'app et le programme.
Ton prénom, ton objectif et tes pointages ne sont jamais envoyés : ils restent dans l'app sur ton iPhone.
