# GarbAdine — Corrections et nouvelles fonctionnalités

## ⚠️ Étape obligatoire avant de redéployer

1. Ouvre la console SQL de ton projet **Neon**.
2. Copie-colle tout le contenu de `migration/001_fix_schema.sql` et exécute-le.
   (Sans danger, tu peux le relancer plusieurs fois.)
3. Redéploie le projet sur Vercel avec les nouveaux fichiers.
4. Crée (ou réinitialise) ton compte admin en appelant une fois :
   `POST /api/admin/admin` avec le body JSON :
   ```json
   { "email": "ton-email@exemple.com", "password": "TonMotDePasse", "phone": "70000000" }
   ```
   Tu peux le faire avec Postman, ou une simple page/fetch depuis la console du navigateur.
   Une fois connecté, utilise le bouton **"Mon compte"** dans l'espace admin pour changer
   email/téléphone/mot de passe quand tu veux — plus besoin de rappeler cet endpoint.

## Bugs corrigés

- **Connexion admin impossible** : aucun compte admin n'existait en base (aucune inscription
  admin n'était prévue dans le code). → endpoint `/api/admin/admin` à appeler une fois (voir
  ci-dessus), puis modification normale via "Mon compte".
- **Gérante ne pouvait pas enregistrer de dépenses (ni de ventes)** : deux bugs cumulés :
  1. Le formulaire envoyait `type: "expense"/"sale"` mais l'API n'acceptait que
     `"depense"/"vente"` → toute saisie était rejetée silencieusement (erreur 400).
  2. La boutique (`shopId`) n'était jamais transmise à la gérante à la connexion : le login
     ne renvoyait la boutique que pour le DG. La gérante créée par le DG n'était même pas
     rattachée à une boutique en base (`register.js` créait une boutique différente à chaque
     fois). → ajout d'une colonne `shop_id` sur les gérantes, rattachement automatique à la
     boutique du DG qui l'invite, et le login renvoie maintenant la boutique pour les deux rôles.

## Nouvelles fonctionnalités demandées

- **Modifier son compte**
  - DG et gérante : bouton "Mon compte" → changer numéro de téléphone + mot de passe
    (confirmation par mot de passe actuel obligatoire).
  - Admin : bouton "Mon compte" → changer email + téléphone + mot de passe.
- **Badge d'abonnement (jours restants)**
  - Vert si plus de 3 jours restants.
  - Rouge et **clignotant** si 3 jours ou moins, ou expiré.
  - Visible pour le DG **et** la gérante (synchronisé : les deux affichent les jours restants
    de la boutique, pas un compteur séparé).
- **Renouvellement en un clic (admin)**
  - Sur chaque boutique : bouton "Renouveler" → choix 1 / 3 / 12 mois → mise à jour immédiate
    de la date de fin d'abonnement (cumul des jours restants s'il y en a).

## Autres corrections faites en vérifiant l'ensemble

- L'essai gratuit à l'inscription DG est maintenant bien de **7 jours** (le code avait 3 jours,
  contredisant ce qui avait été convenu).
- L'abonnement est maintenant rattaché à la **boutique** (pas à l'utilisateur) : c'est la
  boutique que l'admin renouvelle, donc c'est elle la seule source de vérité pour DG et gérante.
- `api/transactions/create.js` : la boutique sans date d'abonnement (bug précédent) était
  traitée comme "jamais expirée" — corrigé pour bloquer proprement si la date est absente.
- Ajout de `api/transactions/list.js` : stats et historique réels (jour / 7 derniers jours /
  mois / plage personnalisée) au lieu des données factices en `localStorage` qui étaient
  utilisées jusqu'ici côté gérante et DG.
- Ajout de `api/transactions/update.js` : modifier/supprimer une saisie (prévu mais jamais
  implémenté).
- Ajout de `api/dg/gerantes.js` : liste réelle des gérantes d'un DG, avec désactivation et
  suppression de compte (prévu mais jamais implémenté — le tableau du dashboard DG affichait
  toujours "0 gérante(s)").
- Ajout d'un 3ᵉ mode de paiement **"En attente"** pour les ventes (vente non encore payée,
  comme demandé) en plus de Cash/Orange Money.
- Compte gérante désactivé par le DG → connexion bloquée avec message clair.

## Export Excel (ajouté)

- `api/transactions/export.js` génère un vrai `.xlsx` avec `exceljs` (remplace la dépendance
  `xlsx` qui n'était jamais utilisée et ne gère pas les couleurs) :
  - En-têtes colorées (fond ambre, texte blanc, gras) sur toute la largeur du tableau.
  - Lignes vertes pour les ventes, rouges pour les dépenses.
  - Bandeau résumé en haut (Ventes / Dépenses / Bénéfice net), coloré comme les cartes du
    dashboard.
  - Montants formatés en FCFA, en-tête figé (freeze pane) pour garder les colonnes visibles
    au défilement.
  - Nom du fichier inclut le nom de la boutique et la période exportée.
- Le bouton "Exporter Rapport Excel" du DG respecte la période sélectionnée à l'écran
  (aujourd'hui / 7 jours / mois / plage personnalisée).

## Confirmations demandées

- **Jours restants visibles des deux côtés** : oui, `login.js` calcule `daysLeft` une seule
  fois à partir de `shops.subscription_end` et le renvoie dans la session, que ce soit un DG
  ou une gérante. `dg.html` et `gerante.html` utilisent exactement le même code d'affichage du
  badge (vert > 3j, rouge clignotant ≤ 3j) — donc toujours synchronisés, jamais deux logiques
  différentes.
- **Export Excel invisible côté gérante** : confirmé, le bouton n'existe que dans `dg.html`,
  aucune trace dans `gerante.html`.
- **Abonnement expiré** : le DG n'est jamais bloqué de son tableau de bord (seuls "Inviter une
  gérante" et "Exporter" sont désactivés). La gérante voit tout son écran normalement (stats,
  historique) mais son formulaire de saisie est verrouillé — donc plus aucune nouvelle vente/
  dépense ne remonte chez le DG, sans qu'on ait eu besoin de le bloquer lui-même.
- **Plusieurs gérants simultanés** : chaque gérant a son propre compte + `shop_id`, chaque
  saisie est une ligne indépendante en base — aucun risque de conflit entre eux.

## Chiffre d'affaires réaliste (nouveau)

Avant, l'admin voyait une estimation automatique (5000F × mois restants). Maintenant :
- Nouvelle table `subscription_payments` : trace chaque renouvellement (gratuit ou payant, et
  le montant exact encaissé si payant).
- `api/admin/renew.js` demande maintenant, en plus de la durée (1/3/12 mois), si c'était
  **gratuit** (offert pour le marketing, ex: 30 jours offerts à un client) ou **payant** — et
  si payant, **le montant réellement reçu** (préremplit le tarif de référence mais modifiable).
- La carte "Chiffre d'affaires réel (encaissé)" dans l'espace admin est maintenant la somme
  réelle des montants payés enregistrés — jamais une estimation.

## Page d'accueil (mobile)

- Sur petit écran, le bouton "Essayer" (à droite de "Connexion") pouvait déborder hors de
  l'écran sans aucun moyen d'y accéder. La barre est maintenant glissable au doigt (scroll
  tactile horizontal) si elle ne rentre pas entièrement.

## Récupération de mot de passe (implémentée)

- **DG** : self-service via la question secrète définie à l'inscription — nouveau flux en 2
  étapes sur `login.html` : numéro → question secrète → réponse + nouveau mot de passe au
  choix. Nouveaux endpoints `api/auth/recovery-question.js` et `api/auth/reset-password.js`.
- **Gérante** : pas de question secrète (compte créé par le DG) — le lien "Mot de passe
  oublié" affiche maintenant un message clair : contacter son DG. Le DG peut réinitialiser
  le mot de passe de n'importe laquelle de ses gérantes en un clic (bouton "🔑 Mot de passe
  oublié" dans le tableau des gérantes, `dg.html`) — nouvel endpoint via `api/dg/gerantes.js`
  (PATCH avec `newPassword`).
- **Admin** : toujours via l'endpoint `/api/admin/admin` (déjà documenté plus haut).

## Enregistrement automatique du mot de passe par Chrome

Les champs identifiant/mot de passe de `login.html` n'avaient aucun attribut `autocomplete` —
c'est ce qui empêchait Chrome de proposer d'enregistrer le mot de passe. Ajouté partout :
`autocomplete="username"` / `"current-password"` sur la connexion, `"new-password"` sur les
champs de création/changement de mot de passe (inscription, "Mon compte" DG/gérante/admin,
récupération). Chrome devrait maintenant proposer l'enregistrement comme avant.

## Logo corrigé

Le fichier était enregistré sous `assets/logo.png.png` (double extension) alors que le code
cherchait `/assets/logo.png` — le logo ne s'affichait donc jamais et retombait sur le "G" de
secours partout. Remplacé par le vrai logo GarbaDine que tu as fourni, correctement nommé
`assets/logo.png`.

## Saisie plus rapide pour la gérante (catégories en un clic)

Le vrai problème : la catégorie était un champ texte libre, avec autocomplétion stockée
**uniquement dans le navigateur** (localStorage) — donc rien de prérempli sur un nouveau
téléphone, et il fallait retaper "Attiéké", "Eau", "Jus"... à chaque fois au début. Corrigé :

- Nouvelle table `shop_categories` : les catégories appartiennent à la **boutique** (pas au
  téléphone), donc tout le monde (DG et toutes les gérantes) voit les mêmes.
- Catégories de vente de départ créées automatiquement pour toute nouvelle boutique :
  **Attiéké, Eau, Jus** (modifiable).
- Dans `gerante.html`, la catégorie se choisit maintenant en **touchant une puce** (plus besoin
  de taper), avec un bouton **"+ Nouvelle"** pour en ajouter une à la volée si besoin (visible
  immédiatement pour toute l'équipe ensuite) — et un petit "×" pour en supprimer une devenue
  inutile (les anciennes saisies ne sont pas affectées).
- Les catégories affichées changent automatiquement selon l'onglet (Dépenses vs Ventes), donc
  la gérante ne voit jamais les catégories d'achats en train de faire une vente ou l'inverse.

Concrètement le matin : elle ouvre l'onglet "Dépenses", touche (ou crée) la catégorie de
l'achat (ex: Attiéké, Oignon...), indique la quantité/le prix, valide. Pour une vente
d'attiéké/eau/jus dans la journée, elle bascule sur l'onglet "Ventes", touche la puce du
produit vendu, indique la quantité/le prix, choisit le mode de paiement, valide. Chaque
article différent = une saisie, mais les puces rendent ça très rapide une fois les catégories
en place.

## Audit complet (bugs trouvés en vérifiant tout)

- **Suppression d'une gérante cassait si elle avait déjà des ventes/dépenses** : la base
  refusait la suppression (contrainte technique). Corrigé — l'historique reste intact, la
  gérante supprimée n'apparaît juste plus comme auteur des anciennes saisies.
- **Désactiver une gérante ne l'empêchait pas de continuer à saisir si elle était déjà
  connectée** (seule la prochaine tentative de connexion était bloquée). Corrigé — chaque
  enregistrement de vente/dépense vérifie maintenant aussi que le compte est toujours actif.
- **Créer une nouvelle gérante avec un abonnement expiré était bloqué à l'écran mais pas
  côté serveur** (faille théorique si quelqu'un contournait l'interface). Corrigé.
- **Le badge "jours restants" pouvait rester figé** chez un DG/gérante déjà connecté si
  l'admin renouvelait l'abonnement entre-temps (il fallait se reconnecter pour le voir).
  Corrigé — nouveau petit endpoint `api/shops/status.js` qui rafraîchit le badge (et
  déverrouille/verrouille la saisie chez la gérante) automatiquement à l'ouverture de la page,
  sans avoir à se déconnecter/reconnecter.

## Ce qui reste à faire

- **Connexion Google / empreinte digitale** mentionnées dans les specs d'origine — pas encore
  implémentées.
- Export Excel côté gérante (pour l'instant seulement le DG a le bouton).
