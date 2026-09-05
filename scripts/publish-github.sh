#!/usr/bin/env bash
#
# Publie une copie NETTOYÉE du SDK sur le miroir public GitHub.
#
#   ./scripts/publish-github.sh            # prépare et montre le diff, ne pousse pas
#   ./scripts/publish-github.sh --push     # pousse pour de bon
#
# Le miroir (github.com/yeria-app/yeriasdk) ne rejoue pas l'historique interne :
# il porte UN commit par version publique, chaîné sur le précédent, et UN tag
# `vX.Y.Z` posé dessus — c'est le tag qui rend une version repérable sur le
# miroir, où l'historique ne dit rien. On y retrouve
# donc « Public release v1.2.0 », « v1.3.0 »… et rien du travail intermédiaire.
# Ce choix est délibéré — l'historique interne cite des tickets, des brouillons
# et des évaluations qui n'ont pas à sortir.
#
# Jusqu'ici l'opération était manuelle. Ce script la rejoue à l'identique, avec
# deux garde-fous que la main n'avait pas : la liste d'exclusion est écrite noir
# sur blanc, et tout fichier de premier niveau non classé arrête le script au
# lieu de partir en public par défaut.

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

PUSH=false
[ "${1:-}" = "--push" ] && PUSH=true

log() { echo "[github] $*"; }
die() { echo "[github] ECHEC : $*" >&2; exit 1; }

# ── Ce qui NE sort PAS ────────────────────────────────────────────────────
# Plans, évaluations et brouillons internes, et le contexte OpenWolf.
#
# Les specs HTML par langue SORTENT, elles. Ce commentaire disait l'inverse —
# « générées pour le site, rien à faire dans un dépôt de bibliothèque » — au
# temps où le Markdown était la source. Il ne l'est plus : depuis « every spec
# now has an HTML source », les fragments de specs/en et specs/fr SONT la
# source, et un .md rendu redondant est supprimé. Les exclure revenait donc à
# publier une documentation qui se vide à mesure qu'elle est migrée.
#
# Ce sont des fragments de corps : GitHub les affiche en source, pas en page
# rendue. Ils sortent quand même — ils sont la référence, et le site yeria.app
# reste l'endroit où on les LIT.
EXCLUDE=(
  ".wolf"
  "PYTHON_PORT_PLAN.md"
  "PYTHON_SDK_ACCURACY_ASSESSMENT.md"
  "PYTHON_SDK_FIX_PLAN.md"
  "RELEASE_READINESS_ASSESSMENT.md"
  "docs/compose-view-draft.md"
  "docs/sdk-architecture-refactor-plan.md"
  "specs/check-fr.py"
)

# Fichiers de premier niveau déjà jugés publiables. Une nouveauté non listée
# n'est pas supposée publique : mieux vaut interrompre et décider.
KNOWN_PUBLIC=(
  ".gitignore" "BUILDER_MIGRATION.md" "CHANGELOG.md" "CONTRIBUTING.md"
  "LICENSE" "NOTICE" "README.md" "demo" "docs" "js" "package-lock.json"
  "package.json" "py" "scripts" "specs" "tests"
)

# ── Contrôles préalables ──────────────────────────────────────────────────
[ -z "$(git status --porcelain)" ] || die "l'arbre de travail n'est pas propre"

VERSION="$(python3 -c "import json;print(json.load(open('js/package.json'))['version'])")"
PY_VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' py/pyproject.toml | head -1)"
[ "$VERSION" = "$PY_VERSION" ] ||
  die "versions désaccordées : js $VERSION, python $PY_VERSION"

git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null ||
  die "le tag v$VERSION n'existe pas — publier une version non taguée rendrait le miroir intraçable"

git remote get-url github >/dev/null 2>&1 || die "remote 'github' absent"

# Toute entrée de premier niveau doit être classée, publique ou exclue.
UNKNOWN=""
while read -r entry; do
  for k in "${KNOWN_PUBLIC[@]}"; do [ "$entry" = "$k" ] && continue 2; done
  for e in "${EXCLUDE[@]}"; do [ "$entry" = "$e" ] && continue 2; done
  UNKNOWN="$UNKNOWN $entry"
done < <(git ls-tree --name-only HEAD)
[ -z "$UNKNOWN" ] ||
  die "entrée(s) non classée(s) :$UNKNOWN — ajouter à KNOWN_PUBLIC ou à EXCLUDE"

log "version $VERSION, tag v$VERSION, arbre propre"

# ── Construction de la copie nettoyée ─────────────────────────────────────
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# `git archive` ne sort que les fichiers SUIVIS : ni node_modules, ni .venv,
# ni artefacts de build, sans avoir à les énumérer.
git archive HEAD | tar -x -C "$WORK/"
for path in "${EXCLUDE[@]}"; do rm -rf "${WORK:?}/$path"; done

log "copie nettoyée : $(find "$WORK" -type f | wc -l | tr -d ' ') fichier(s)"

# ── Report sur le miroir ──────────────────────────────────────────────────
MIRROR="$(mktemp -d)"
trap 'rm -rf "$WORK" "$MIRROR"' EXIT

git clone --quiet --depth 1 --branch main "$(git remote get-url github)" "$MIRROR" 2>/dev/null ||
  die "clone du miroir impossible (authentification GitHub ?)"

# rsync avec --delete : un fichier retiré du dépôt interne disparaît aussi du
# miroir. Sans cela, un fichier supprimé y survivrait indéfiniment.
rsync -a --delete --exclude '.git' "$WORK/" "$MIRROR/"

cd "$MIRROR"

# Le tag fait partie de la publication, au même titre que le contenu : toutes
# les versions précédentes en portent un, et sans lui le miroir a bien le code
# mais ne dit pas à quelle version il correspond. Il se vérifie donc à part —
# un miroir déjà identique mais non tagué reste à taguer, ce qui est
# exactement ce qui manquait à 1.4.0.
#
# `tail -1` : un tag annoté sort deux lignes de ls-remote, l'objet puis le
# commit déréférencé ; un tag simple n'en sort qu'une. La dernière est le
# commit dans les deux cas.
REMOTE_TAG="$(git ls-remote --tags origin "refs/tags/v$VERSION" | awk '{print $1}' | tail -1)"

CONTENT_CHANGED=true
[ -z "$(git status --porcelain)" ] && CONTENT_CHANGED=false

if ! $CONTENT_CHANGED && [ -n "$REMOTE_TAG" ]; then
  log "le miroir est déjà identique et porte v$VERSION — rien à publier"
  exit 0
fi

if $CONTENT_CHANGED; then
  echo
  git -c color.ui=always status --short | head -40
  echo
  log "$(git status --porcelain | wc -l | tr -d ' ') fichier(s) modifié(s) sur le miroir"
else
  log "miroir identique — seul le tag v$VERSION manque"
fi

if ! $PUSH; then
  log "essai à blanc — relancer avec --push pour publier"
  [ -z "$REMOTE_TAG" ] && log "poserait le tag v$VERSION"
  exit 0
fi

if $CONTENT_CHANGED; then
git add -A
git commit -q -m "Public release v$VERSION: yeriasdk" -m "$(
  cd "$HERE"
  # Le corps reprend la section de CHANGELOG de cette version : le miroir doit
  # dire ce qui change sans renvoyer à un historique qu'il n'a pas.
  awk -v v="$VERSION" '
    $0 ~ "^## \\[" v "\\]" {p=1; next}
    p && /^## \[/ {exit}
    p' CHANGELOG.md | sed '/^$/d' | head -20
)"

git push --quiet origin main
log "publié : $(git rev-parse --short HEAD) sur github/main"
fi

# Un tag de publication est un point fixe : on le pose s'il manque, jamais on
# ne le déplace. S'il existe et pointe ailleurs, c'est une anomalie qui mérite
# un arrêt plutôt qu'une réécriture silencieuse.
HEAD_SHA="$(git rev-parse HEAD)"
if [ -z "$REMOTE_TAG" ]; then
  git tag "v$VERSION" "$HEAD_SHA"
  git push --quiet origin "refs/tags/v$VERSION"
  log "tag v$VERSION posé sur $(git rev-parse --short HEAD)"
elif [ "$REMOTE_TAG" = "$HEAD_SHA" ]; then
  log "tag v$VERSION déjà en place"
else
  die "v$VERSION existe sur le miroir et pointe sur ${REMOTE_TAG:0:7}, pas sur ${HEAD_SHA:0:7} — un point de publication ne se réécrit pas"
fi
