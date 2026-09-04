"""Provider -> mobile error contract. Mirrors js/src/core/provider-error.ts.

A provider signals a business/domain error to the mobile client with a
controlled ``error`` object that mirrors the Yeria platform's error shape, so
the mobile side reuses the SAME parsing + code->l10n logic it already runs for
platform/auth errors: read ``error.code`` (dot.notation) and
``error.invalid_params[]``, then localize by code with a human-message fallback.

Two emission forms (both carry the identical ``error`` object):
  - unsigned:  ``YeriaUI.error(...)``   -> ``{"error": {...}}`` (keyless, always
               available — no YeriaApp, no key needed)
  - signed:    ``app.serve_error(...)`` -> ``{payload, signature}`` wrapping
               ``{"appId", "timestamp", "error": {...}}``

The mobile client verifies the signature ONLY when present, and keys error
handling off the presence of this ``error`` envelope in the body — NOT off the
HTTP status (the provider's gateway/proxy may return an arbitrary status the
SDK does not control).
"""

from typing import Any, Dict, List, Optional

from ..errors.exceptions import InvalidParameterError


def build_provider_error(
    code: str,
    message: str,
    status: int = 400,
    invalid_params: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Build the canonical ``{"error": {...}}`` body. Pure, keyless. Raises
    ``InvalidParameterError`` when ``code`` or ``message`` is missing.

    ``code`` is the dot.notation machine string; ``status`` the numeric
    severity (default 400). ``invalid_params`` is a list of
    ``{"path", "code", "message"}`` dicts.
    """
    if not isinstance(code, str) or not code:
        raise InvalidParameterError("code", code, "must be a non-empty string")
    if not isinstance(message, str) or not message:
        raise InvalidParameterError("message", message, "must be a non-empty string")

    error: Dict[str, Any] = {
        # `bool` est un `int` : `True` serait parti comme statut 1.
        "status": status if isinstance(status, int) and not isinstance(status, bool) else 400,
        "code": code,
        "message": message,
    }
    if invalid_params:
        error["invalid_params"] = [
            {"path": str(p["path"]), "code": str(p["code"]), "message": str(p["message"])}
            for p in invalid_params
        ]
    return {"error": error}
