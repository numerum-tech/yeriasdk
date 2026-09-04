# Modèle de navigation — premier jet de spécification

> **Statut : brouillon. Non implémenté.** Ce document sert à cadrer la discussion
> avant écriture du code. Il ne doit pas être synchronisé vers `specs/` tant que
> le modèle n'est pas tranché : le site publierait une promesse que le client ne
> tient pas — ce qui est précisément le problème décrit ci-dessous.
>
> Les questions ouvertes sont regroupées en fin de document.

## Le problème

Un utilisateur soumet un formulaire. Le fournisseur répond par une vue de
résultat. L'utilisateur revient en arrière et retombe **sur le formulaire qu'il
vient d'envoyer**, vide de ses valeurs, prêt à être renvoyé.

Ce n'est pas un défaut isolé. C'est le symptôme visible d'un manque : **le
fournisseur compose des écrans, jamais le chemin entre eux.** La pile de
navigation appartient entièrement au client, qui empile tout ce qu'il reçoit et
dépile à chaque geste de retour.

Trois symptômes, une seule cause :

| Symptôme | Constat |
|---|---|
| Retour sur un formulaire déjà soumis | La vue de résultat est **empilée** sur le formulaire (`form_layout.dart`, appel à `pushComponent` après une soumission réussie) |
| `setPrev` ne ramène pas à la page configurée | La clé `nav` est émise par les deux SDK et **lue par personne** dans l'application |
| Étapes d'un processus sans repère | `processId`, `currentStep`, `canGoBack` sont émis et **lus par personne** |

## Ce qui existe aujourd'hui

| Concept | Écrit par | Clé sur le fil | Consommé par le client |
|---|---|---|---|
| `nav.next`, `nav.prev` | `setNext()`, `setPrev()` | `nav` | **non** |
| `processId`, `currentStep`, `totalSteps`, `canGoBack`, `canSkip` | `setProcess()`, `belongsToProcess()` | `process` | **non** |
| Action de soumission | `submitButton()` | `content.submit` | oui |
| Seconde action (`mode: navigate\|submit`) | `secondaryButton()` | `content.secondary` | oui |
| Cibles d'action (`href`) | `addAction()` | `content.actions` | oui |

Ce qui est consommé a un point commun : **c'est déclenché par un geste explicite
de l'utilisateur sur un élément visible**. Ce qui ne l'est pas décrit le
*parcours* — et le parcours n'a jamais été implémenté.

## Le principe : qui décide de quoi

Deux responsabilités distinctes, à ne pas mélanger.

**Le fournisseur possède le parcours.** Lui seul sait qu'un formulaire est
consommé, qu'une étape est franchie, qu'un dossier est clos. Le client ne peut
pas le deviner : pour lui, une vue de résultat est une vue comme une autre.

**Le client possède les conventions de la plateforme.** Un geste de retour fait
toujours quelque chose de prévisible ; on ne piège jamais l'utilisateur dans un
écran ; le retour système n'est jamais avalé en silence.

D'où la règle de conception : **le protocole exprime une intention de parcours,
le client la traduit en comportement de plateforme.** Le fournisseur ne
manipule jamais une pile — il n'en connaît pas l'état, et deux clients (mobile,
web) n'ont pas la même.

## Le modèle proposé

### 1. L'invariant : la racine ne bouge jamais

**La vue servie par l'URL de base du service est la racine du parcours. Elle
occupe toujours le fond de la pile et n'en sort jamais.**

Ce n'est pas une directive du fournisseur, c'est une règle du client. Sa raison
d'être : l'entrée du service doit rester atteignable quoi qu'il arrive. Une vue
quelconque ne peut pas devenir racine — sinon un parcours mal composé enferme
l'utilisateur dans une branche sans retour vers l'accueil du service.

Conséquences directes :

- une directive de remplacement ne retire jamais la racine ; si la pile ne
  contient qu'elle, la vue servie s'empile ;
- `nav.prev` réduit la pile à `[racine, cible]` — et à `[racine]` seule quand
  la cible **est** la racine ;
- le geste de retour depuis la racine quitte le service.

Coût assumé : si le fournisseur sert un formulaire à son URL de base, revenir
en arrière depuis le résultat ramène à ce formulaire. C'est l'accueil de son
service ; le réafficher est le comportement attendu, et c'est à lui de servir
autre chose à la racine si ce formulaire ne doit pas être rejoué.

### 2. Comment une vue entre dans l'historique — la pièce manquante

Une directive portée par la vue servie, **deux valeurs** :

```
nav.entry : "push" | "replace"
```

| Valeur | Effet | Cas d'usage |
|---|---|---|
| `push` | La vue s'empile. Retour = écran précédent. | Navigation ordinaire, consultation |
| `replace` | La vue **prend la place** de celle d'où l'on vient (jamais de la racine). | Résultat d'une soumission, étape franchie |

`root` a été écarté : aucune vue ne peut se déclarer racine, c'est l'invariant
ci-dessus qui tient ce rôle. Une fin de parcours qui veut « tout oublier »
s'exprime par `nav.prev` pointant sur l'accueil — la pile redevient `[racine]`.

**Le défaut est `push`.** Un remplacement implicite après une écriture avait été
envisagé — il aurait corrigé le retour sur formulaire soumis sans une ligne de
code fournisseur — puis écarté : **il casserait les formulaires multi-étapes**,
où l'étape 2 renvoyée en `POST` effacerait l'étape 1 et rendrait l'assistant
impossible à remonter. Le client ne peut pas distinguer « voici le reçu de ce
que tu viens d'envoyer » de « voici l'étape suivante » ; seul le fournisseur le
sait.

La conséquence est assumée : **le fournisseur doit déclarer `entry: "replace"`
sur sa vue de résultat**. C'est le rôle de la documentation de le rendre
évident, pas celui d'un défaut qui devine.

**Le point clé de conception :** la décision « on ne doit pas revenir au
formulaire » se pose sur la vue **qui le remplace**, pas sur le formulaire
lui-même. Or c'est précisément la vue que le fournisseur sert en réponse à la
soumission. Il n'a donc besoin de rien savoir de la pile — il décrit ce que
*sa* vue vaut dans le parcours.

C'est exactement le *POST / Redirect / GET* du web, transposé : après une
écriture, on ne laisse pas la page d'envoi dans l'historique.

### 3. Où mène le retour — la cible de sortie

Sémantique retenue, quel que soit le nom que portera le champ (voir 3 bis et
les questions ouvertes) :

- la cible est **récupérée** auprès du fournisseur (même chemin que les actions :
  résolution contre la base du service, vérification de signature) ;
- la pile devient `[racine, cible]`, conformément à l'invariant ;
- les trois gestes de retour la suivent.

Décidé également : **aucun champ de navigation n'accepte un identifiant de vue
nu** (`allowViewId: false`, comme `href` des actions). L'application n'a pas
d'annuaire d'identifiants ; un fournisseur doit être arrêté à l'écriture plutôt
que de découvrir à l'exécution que rien ne se passe.

### 3 bis. Deux notions distinctes portées par un seul mot : `prev`

Le mot `prev` recouvre aujourd'hui deux intentions qui n'ont ni le même
déclencheur, ni le même effet sur l'historique.

**Le frère** — la page précédente d'une séquence. Un fournisseur pagine :
page 1 → page 2 → page 3. `prev` et `next` sont **symétriques**, tous deux
« va voir cette vue-là ». Ils se déclenchent par des **contrôles visibles**
(deux flèches), jamais par le geste de retour du système.

**Le parent** — la vue à laquelle on revient en quittant la branche courante,
en invalidant le reste du chemin. Ce n'est pas un frère : c'est une **sortie**.
Elle se déclenche par le geste de retour, et elle n'a pas de symétrique.

C'est la distinction *Up* / *Back* d'Android : *Back* défait le temps, *Up*
remonte la hiérarchie déclarée par l'application. Les confondre produit
exactement le défaut signalé — soit le geste de retour rejoue la pagination à
l'envers sur quarante pages, soit les flèches de pagination vident la pile.

**Retenu** : `next`/`prev` restent la séquence, et **aucun champ n'est ajouté
pour le parent**.

| Champ | Méthode SDK | Déclencheur | Effet sur la pile |
|---|---|---|---|
| `nav.next`, `nav.prev` | `setNext()`, `setPrev()` | contrôles de pagination **dessinés par le client** | la vue atteinte **remplace** la courante (surchargeable par `entry: "push"`) |
| — | — | geste de retour | l'invariant de racine suffit (voir ci-dessous) |

Le remplacement par défaut sur une pagination n'est pas un choix esthétique :
sans lui, feuilleter quarante pages empile quarante écrans et le geste de retour
devient un tunnel. Le fournisseur qui veut réellement un retour page à page
l'obtient en déclarant `entry: "push"`.

**Pourquoi pas de champ « parent ».** Le seul cas que l'invariant de racine ne
couvrait pas était l'entrée profonde : `yeria://dl/v/{id}?p=/orders/123`, et le
`link` d'une notification rejoué au démarrage à froid, ouvrent une sous-vue
arbitraire du fournisseur avec **une pile d'une seule page** — pas de flèche
retour, et le geste système quitte l'application. La réponse retenue est côté
client : **charger la vue de base sous la vue profonde**. Le retour ramène alors
à l'accueil du service, sans aucun champ de protocole. Un parent intermédiaire
déclaré (`/orders/123` → `/orders`) reste hors de portée ; ce sera à rouvrir si
un fournisseur le demande.

### 3 ter. Ne pas confondre avec la pagination *interne* d'une vue

Un autre mécanisme de pagination existe déjà, à un autre niveau :
`ReaderView.addMarkdown()` accumule des pages dans **un seul élément**
(`markdown.pages[]`). Ce sont les pages d'un même document, feuilletées
localement, sans requête réseau — et le renderer mobile ne les affiche pas
encore (l'élément `markdown` tombe dans le cas par défaut du `switch` et rend
un blanc).

| | Pagination interne | Pagination par `next`/`prev` |
|---|---|---|
| Unité | pages d'un document dans **une** vue | **plusieurs** vues servies |
| Coût | aucun appel réseau | un appel par page |
| Qui décide du contenu | tout est déjà chargé | le fournisseur, à chaque page |
| État | néant | le fournisseur peut varier la page selon le contexte |

Les deux sont légitimes et ne se remplacent pas. **La pagination interne est
hors du périmètre de ce chantier** : le découpage d'un markdown long en pages
est d'ailleurs discutable en soi — un livre ne se découpe pas comme un
formulaire — et le sujet sera repris avec le reste du cas Reader.

### 3 quater. Une vue en surimpression n'entre pas dans l'historique

Une `MessageView` est rendue en boîte de dialogue : elle se superpose à l'écran
courant, ne le remplace pas, et se ferme sans navigation. **Elle ne doit donc
occuper aucune entrée de pile.** Règle générale : ce qui se referme sur place
ne se navigue pas.

État actuel — la règle est enfreinte. Deux chemins mènent à une `MessageView` :

| Chemin | Route poussée | Historique |
|---|---|---|
| `NavigationHelper.pushComponentAndWait` (message reçu en réponse à une action) | non — dialogue | intact ✔ |
| `MessageLayout` (message servi comme vue d'écran, via `ComponentRenderer`) | non — dialogue | **poussé dans `navigationHistory`** ✘ |

Le second empile le composant « pour la restauration du titre »
(`message_layout.dart`, dans `_showMessageDialog`). Conséquence : l'historique
compte une entrée pour un écran qui n'existe pas. Tout ce qui s'appuie dessus
dérive d'un cran — la restauration de titre au retour, et le `canGoBack()` que
consulte le formulaire pour décider s'il peut dépiler après une soumission sans
vue de réponse.

La restauration du titre est un besoin réel, mais elle doit être portée par un
mécanisme propre au dialogue (mémoriser le titre courant, le remettre à la
fermeture), pas par une entrée de navigation.

### 4. Garde-fous côté client — non négociables

- Un geste de retour mène **toujours** quelque part. Racine atteinte ⇒ on quitte
  le service, on ne bloque pas.
- Cible `nav.prev` injoignable (réseau coupé, vue refusée) ⇒ retour natif et
  message d'erreur. **Jamais** un écran dont on ne peut pas sortir.
- Les trois gestes (flèche de la barre, retour système Android, balayage iOS)
  suivent la même règle. Deux comportements de retour sur un même écran, c'est
  un piège.

### 5. Table de vérité

Pile notée du fond vers le sommet ; `R` = racine.

| Situation | Pile avant | Pile après | Geste retour |
|---|---|---|---|
| Vue servie sur GET, `entry` absent | `[R, A]` | `[R, A, B]` | revient à `A` |
| Vue servie après soumission (défaut = `replace`) | `[R, A]` | `[R, B]` | revient à `R` |
| Idem, mais `entry: "push"` déclaré | `[R, A]` | `[R, A, B]` | revient à `A` |
| Remplacement alors que seule la racine est empilée | `[R]` | `[R, B]` | revient à `R` |
| Vue portant `nav.prev` | `[R, A, B]` | inchangée à l'affichage | récupère la cible ⇒ `[R, cible]` |
| Retour depuis la racine | `[R]` | — | quitte le service |

## Ce que ce modèle ne résout pas

**Le rejeu d'une soumission n'est pas un problème de navigation.** Même avec
`replace`, l'utilisateur peut rappeler le formulaire par un lien, un deeplink,
un second appareil, ou simplement rouvrir le service. Empêcher le retour rend
l'accident improbable ; cela ne protège pas la donnée.

La garantie appartient au fournisseur : **une soumission doit être idempotente**.
Piste à instruire séparément — un jeton de soumission émis avec le formulaire,
refusé au second usage — mais il ne faut pas laisser croire qu'`entry: replace`
en tient lieu.

## Sort des concepts existants

- **`nav.next` / `nav.prev`** : **conservés**. Leur déclencheur est désormais
  défini — les contrôles de pagination d'une séquence de vues (voir 3 bis).
  Ils ne sont plus liés au geste de retour.
- **`process.*`** (`processId`, `currentStep`, `totalSteps`, `canGoBack`,
  `canSkip`) : **gelé**. Le champ continue d'être émis — retirer casserait le
  code fournisseur qui l'appelle déjà — mais les specs doivent porter la mention
  explicite qu'aucun client ne l'honore aujourd'hui. La décision d'implémenter
  (fil d'étapes affiché, `canGoBack` respecté) ou de retirer attend un parcours
  multi-étapes réel. Tant que la mention n'est pas écrite, c'est de la
  documentation qui ment, au même titre que `setPrev`.

## Décisions arrêtées

1. **La racine ne bouge jamais** : la vue servie par l'URL de base du service
   est au fond de la pile et n'en sort pas. Règle du client, pas directive du
   fournisseur. Sur une entrée profonde, le client charge cette racine sous la
   vue demandée.
2. **`nav.entry: "push" | "replace"`, défaut `push`.** Pas de remplacement
   implicite après une écriture : cela casserait les formulaires multi-étapes.
3. **Aucun champ « parent »** : l'invariant de racine couvre l'entrée profonde.
4. **`nav.next` / `nav.prev` conservés** — pagination d'une séquence de vues,
   **contrôles dessinés par le client**, jamais liés au geste de retour. Un
   déplacement remplace la vue courante sauf `entry: "push"`.
5. **Aucun champ de navigation n'accepte un identifiant de vue nu**
   (`allowViewId: false`).
6. **Une vue en surimpression (`MessageView` en dialogue) n'occupe aucune
   entrée de pile** — ni route, ni historique.
7. **`process.*` est gelé** : émis, non honoré ; la documentation doit le dire.
8. **Ordre de travail** : le comportement d'abord, la documentation ensuite —
   une entrée de doc dédiée décrira les options une fois le client stabilisé.
   Documenter avant d'implémenter reproduirait le défaut de `setPrev`.

## Reste à traiter

- **Pagination interne du Reader** (`markdown.pages[]`) — chantier distinct, à
  reprendre avec le cas Reader dans son ensemble.
- **`process.*`** — implémenter ou retirer, à trancher sur un parcours
  multi-étapes réel.
- **Parent intermédiaire déclaré** — écarté aujourd'hui, à rouvrir si un
  fournisseur veut remonter ailleurs qu'à l'accueil du service.
