#!/usr/bin/env python3
"""Régénère specs/<page>.md depuis specs/en/<page>.html.

Depuis « every spec now has an HTML source », les fragments par langue SONT la
source. Les .md restent publiés — ils sont ce qu'un lecteur voit sur GitHub —
mais ils ne s'écrivent plus à la main : ils se régénèrent ici, sinon les deux
formats divergent à la première correction.

    python3 scripts/render-specs-md.py            # régénère tout
    python3 scripts/render-specs-md.py --check    # échoue si un .md est périmé

Le titre de niveau 1 n'existe pas dans le fragment (le site l'affiche depuis son
catalogue) : il est repris du .md existant, ou dérivé du catalogue pour une page
nouvelle.
"""
import html as H
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
EN = ROOT / "specs" / "en"
CATALOG = ROOT.parent / "yeria-ui" / "definitions" / "docs-catalog.js"


def link_map():
    """Chemin du site -> fichier .md, lu dans le catalogue de yeria-ui.

    Un lien `/docs/navigation` doit devenir `navigation.md` : sur GitHub, le
    lecteur n'a pas le site sous la main.
    """
    if not CATALOG.exists():
        return {}
    text = CATALOG.read_text(encoding="utf-8")
    pairs = re.findall(r"slug:\s*'([^']+)',\s*file:\s*'([^']+)'", text)
    return {"/docs/%s" % slug: "%s.md" % file for slug, file in pairs}


LINKS = link_map()


def unwrap(fragment):
    t = re.sub(r'<code class="ys-code">(.*?)</code>', r"`\1`", fragment, flags=re.S)
    t = re.sub(r"<strong>(.*?)</strong>", r"**\1**", t, flags=re.S)
    t = re.sub(r"<em>(.*?)</em>", r"*\1*", t, flags=re.S)
    t = re.sub(
        r'<a href="([^"]+)">(.*?)</a>',
        lambda m: "[%s](%s)" % (m.group(2), LINKS.get(m.group(1), m.group(1))),
        t,
        flags=re.S,
    )
    # Les <br> des cellules de tableau sont du contenu, pas de la mise en page :
    # ils survivent au retrait des balises.
    t = t.replace("<br>", "\x00BR\x00")
    t = re.sub(r"<[^>]+>", "", t)
    t = t.replace("\x00BR\x00", "<br>")
    return H.unescape(t).strip()


def cell(fragment):
    """Cellule de tableau : un `|` non échappé couperait la colonne en deux."""
    return unwrap(fragment).replace("|", "\\|")


BLOCK = re.compile(
    r'<h([23]) id="[^"]*">(.*?)</h\1>|<p>(.*?)</p>|<ul>(.*?)</ul>|'
    r'<div class="ys-table-wrap"><table>(.*?)</table></div>|'
    r'<pre class="ys-codeblock" data-lang="([^"]*)"><code>(.*?)</code></pre>',
    re.S,
)


def render(source, title):
    out = ["# " + title, ""]
    for match in BLOCK.finditer(source):
        level, head, para, items, table, lang, code = match.groups()
        if head is not None:
            out += ["#" * int(level) + " " + unwrap(head), ""]
        elif para is not None:
            out += [unwrap(para), ""]
        elif items is not None:
            out += ["- " + unwrap(li) for li in re.findall(r"<li>(.*?)</li>", items, re.S)]
            out += [""]
        elif table is not None:
            headers = [cell(c) for c in re.findall(r"<th>(.*?)</th>", table, re.S)]
            out.append("| " + " | ".join(headers) + " |")
            out.append("|" + "|".join(["-------"] * len(headers)) + "|")
            for row in re.findall(r"<tr>(?!.*?<th)(.*?)</tr>", table, re.S):
                cells = [cell(c) for c in re.findall(r"<td>(.*?)</td>", row, re.S)]
                if cells:
                    out.append("| " + " | ".join(cells) + " |")
            out.append("")
        elif code is not None:
            out += ["```" + lang, H.unescape(code), "```", ""]
    return "\n".join(out).rstrip() + "\n"


def title_for(page):
    existing = ROOT / "specs" / (page + ".md")
    if existing.exists():
        first = existing.read_text(encoding="utf-8").split("\n", 1)[0]
        if first.startswith("# "):
            return first[2:].strip()
    pretty = page.replace("-", " ").title()
    return pretty + " Specification"


def main():
    check = "--check" in sys.argv
    stale = []
    for source in sorted(EN.glob("*.html")):
        page = source.stem
        target = ROOT / "specs" / (page + ".md")
        rendered = render(source.read_text(encoding="utf-8"), title_for(page))
        if target.exists() and target.read_text(encoding="utf-8") == rendered:
            continue
        if check:
            stale.append(page)
        else:
            target.write_text(rendered, encoding="utf-8")
            print("écrit  specs/%s.md" % page)
    if check and stale:
        print("périmé(s) : " + ", ".join(stale), file=sys.stderr)
        print("relancer : python3 scripts/render-specs-md.py", file=sys.stderr)
        return 1
    if check:
        print("tous les .md sont à jour")
    return 0


if __name__ == "__main__":
    sys.exit(main())
