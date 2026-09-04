"""Le seul serialiseur de ce qui est signe.

`json.dumps` ne produit PAS les octets de `JSON.stringify`, et la signature
porte sur des octets. Quatre ecarts, tous corriges ici :

* **Non-ASCII.** `json.dumps` echappe par defaut : `"Cafe"` sort `Caf\\u00e9`
  la ou JS ecrit la lettre. Le backend reconstruit la charge utile d'une
  notification avec `JSON.stringify` (`yeria-admin/source/notifications.js`)
  avant d'en verifier la signature — une notification en francais signee par
  le SDK Python etait donc rejetee.
* **Nombres.** Python ecrit `1.0`, `1e-07`, `-0.0`, `1e+20` ; JS ecrit `1`,
  `1e-7`, `0`, `100000000000000000000`. Une latitude `6.0` suffisait a faire
  diverger la signature des deux SDK pour la meme vue.
* **Non finis.** `nan` et `±inf` n'ont pas de forme JSON : refus net.
* **Grands entiers.** Un nombre JavaScript est un flottant double. Au-dela de
  2^53-1, JS ecrit la valeur du double le plus proche (`2**60` sort
  `1152921504606847000`), et si ce double ne vaut pas l'entier demande il a
  silencieusement change la valeur — on refuse alors de signer. Les entiers
  du SDK (horodatages en ms, tailles, durees) sont tres en deca.
"""

import math
import re
from typing import Any

from ..errors.exceptions import InvalidParameterError

# Ce que `JSON.stringify` echappe dans une chaine, et rien d'autre.
_ESCAPES = {
    '"': '\\"',
    "\\": "\\\\",
    "\b": "\\b",
    "\f": "\\f",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
}
# Controles C0 et demi-codets isoles (JSON.stringify bien forme, ES2019).
_MUST_ESCAPE = re.compile(r'[\x00-\x1f"\\\ud800-\udfff]')


def _escape_char(match: "re.Match") -> str:
    ch = match.group(0)
    escaped = _ESCAPES.get(ch)
    if escaped is not None:
        return escaped
    return "\\u{:04x}".format(ord(ch))


def _js_string(value: str) -> str:
    # Une chaine JavaScript est une suite d'unites UTF-16, une chaine Python
    # une suite de points de code : `chr(0xD83D) + chr(0xDE00)` est UN
    # caractere pour JS (l'emoji) et DEUX pour Python. On recompose donc les
    # paires valides avant d'ecrire — sans quoi la charge utile portait des
    # demi-codets bruts et `payload.encode("utf-8")` levait au moment de
    # signer. Un demi-codet ISOLE reste echappe `\\udXXX`, comme le fait
    # `JSON.stringify` bien forme (ES2019).
    out = []
    i = 0
    length = len(value)
    while i < length:
        ch = value[i]
        code = ord(ch)
        if 0xD800 <= code <= 0xDBFF and i + 1 < length and 0xDC00 <= ord(value[i + 1]) <= 0xDFFF:
            low = ord(value[i + 1])
            out.append(chr(0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)))
            i += 2
            continue
        out.append(_MUST_ESCAPE.sub(_escape_char, ch))
        i += 1
    return '"' + "".join(out) + '"'


def _js_number(value: float) -> str:
    """`Number::toString(10)` d'ECMAScript, a partir du `repr` Python.

    Les CHIFFRES sont les memes des deux cotes (l'un et l'autre ecrivent la
    plus courte representation qui relit la meme valeur) ; seule la mise en
    forme differe, et c'est elle qu'on refait ici."""
    if value == 0:
        return "0"  # `-0.0` compris : JS ecrit `0`
    if value < 0:
        return "-" + _js_number(-value)

    mantissa, _, exponent = repr(value).partition("e")
    exp = int(exponent) if exponent else 0
    int_part, _, frac_part = mantissa.partition(".")
    digits = (int_part + frac_part).lstrip("0")
    # n : la valeur vaut 0.<digits> × 10^n
    n = len(int_part) + exp - (len(int_part + frac_part) - len(digits))
    digits = digits.rstrip("0") or "0"
    k = len(digits)

    if k <= n <= 21:
        return digits + "0" * (n - k)
    if 0 < n <= 21:
        return digits[:n] + "." + digits[n:]
    if -6 < n <= 0:
        return "0." + "0" * (-n) + digits
    mantissa_out = digits if k == 1 else digits[0] + "." + digits[1:]
    e = n - 1
    return mantissa_out + "e" + ("+" if e >= 0 else "-") + str(abs(e))


def _array_index(key: str):
    """Le rang d'une clef « indice de tableau » au sens JS, ou None.

    Un objet JavaScript rend ses clefs entieres d'abord, par ordre croissant,
    avant les autres dans leur ordre d'insertion — `{"b":1,"8":2}` se
    serialise `{"8":2,"b":1}`. Un dict Python garde l'insertion. Sans cette
    regle, un `meta` fournisseur indexe par des nombres signait autrement
    dans les deux SDK."""
    if not key.isdigit() or (len(key) > 1 and key[0] == "0"):
        return None
    # Les chiffres non-ASCII passent `isdigit` : `int()` les accepterait aussi,
    # mais JS ne les tient pas pour des indices.
    if not key.isascii():
        return None
    index = int(key)
    return index if index < 2**32 - 1 else None


def _key_text(value: Any) -> str:
    """Le texte d'une clef, comme JS le derive d'une clef non-chaine."""
    if isinstance(value, str):
        return value
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return _encode_int(value, "key")
    if isinstance(value, float):
        return _encode_number(value, "key")
    if value is None:
        return "null"
    raise InvalidParameterError("payload", value, f"keys must be strings, got {type(value).__name__}")


_MAX_SAFE_INTEGER = 2**53 - 1


def _encode_int(value: int, path: str) -> str:
    """Un entier JavaScript est un flottant double.

    Sous 2^53 les deux langages ecrivent les memes chiffres. Au-dela, JS
    ecrit la valeur du DOUBLE le plus proche (`2**60` sort
    `1152921504606847000`) : on repasse donc par la meme mise en forme. Et si
    ce double ne vaut pas l'entier demande, JS aurait silencieusement change
    la valeur — on refuse plutot que de signer autre chose que ce que le
    fournisseur a ecrit."""
    if abs(value) <= _MAX_SAFE_INTEGER:
        return str(value)
    try:
        as_double = float(value)
    except OverflowError:
        as_double = None
    if as_double is None or as_double != value:
        raise InvalidParameterError(
            path, value, "integer is beyond JavaScript's safe range and cannot be signed identically"
        )
    return _js_number(as_double)


def _encode_number(value: float, path: str) -> str:
    if not math.isfinite(value):
        raise InvalidParameterError(path, value, "payload contains a non-finite number")
    return _js_number(value)


def _encode(value: Any, path: str, seen: set) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return _encode_int(value, path)
    if isinstance(value, float):
        return _encode_number(value, path)
    if isinstance(value, str):
        return _js_string(value)
    if isinstance(value, (list, tuple)):
        if id(value) in seen:
            raise InvalidParameterError(path, None, "payload contains a circular reference")
        seen.add(id(value))
        out = "[" + ",".join(_encode(v, f"{path}[{i}]", seen) for i, v in enumerate(value)) + "]"
        seen.discard(id(value))
        return out
    if isinstance(value, dict):
        if id(value) in seen:
            raise InvalidParameterError(path, None, "payload contains a circular reference")
        seen.add(id(value))
        entries = [(_key_text(k), v) for k, v in value.items()]
        indexed = sorted(
            ((idx, k, v) for k, v in entries if (idx := _array_index(k)) is not None),
            key=lambda e: e[0],
        )
        rest = [(k, v) for k, v in entries if _array_index(k) is None]
        ordered = [(k, v) for _, k, v in indexed] + rest
        out = "{" + ",".join(
            _js_string(k) + ":" + _encode(v, f"{path}.{k}", seen) for k, v in ordered
        ) + "}"
        seen.discard(id(value))
        return out
    raise InvalidParameterError(path, value, f"{type(value).__name__} is not JSON-serializable")


def dumps_for_signing(value: Any) -> str:
    """Les octets exacts que `JSON.stringify` produirait pour la meme valeur."""
    return _encode(value, "payload", set())
