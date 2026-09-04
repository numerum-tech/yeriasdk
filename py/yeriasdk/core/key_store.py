"""
YeriaPublicKeys — provider-side helper for resolving the JWT ``kid`` header
of inbound Yeria-issued user tokens.

Mirrors the JS :class:`YeriaPublicKeys`. Fetches the TRUSTED KEY SET from
``GET /api/v1/public/registry/public-key`` and caches it as one document.
Every key Yeria currently vouches for is in there — the active one plus any
key still inside its rotation grace window — each stamped with
``trusted_until``, the instant it stops being trusted.

Two consequences, both deliberate:

1. A ``kid`` absent from the set is rejected with NO network call. A flood
   of forged kids costs nothing.
2. Trust is re-evaluated on every lookup against ``trusted_until``, not
   against the cache TTL. A retired key stops verifying the moment its grace
   window closes, even if the cached document outlives it. Caching the
   document longer never widens the window a retired key is accepted in —
   that was the bug this design replaces.

Against a Yeria older than the trusted-set response (no ``keys`` array), the
store falls back to the per-kid endpoint
``GET /api/v1/public/registry/public-keys/{kid}`` and behaves as before.

Typical usage::

    from yeriasdk import YeriaApp, YeriaPublicKeys

    keys = YeriaPublicKeys(base_url="https://yeria.app")
    claims = YeriaApp.verify_user_token_with_resolver(
        bearer, keys.get_by_kid, MY_SERVICE_ID
    )
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Dict, Optional, Tuple

import requests

from ..errors import YeriaPlatformUnreachableError


@dataclass
class KeyLookup:
    # 'active' | 'rotating' | 'expired' | 'unknown' | 'unreachable'
    #   active/rotating — trusted, PEM present.
    #   expired/unknown — Yeria answered authoritatively; reject the token.
    #   unreachable     — Yeria could NOT be reached (network/timeout/5xx/
    #                     non-JSON body). No trust decision was possible;
    #                     distinct from unknown on purpose.
    state: str
    public_key: Optional[str] = None  # PEM, present only for active/rotating
    # Trust deadline, ISO — present only for active/rotating. This is when the
    # key stops verifying tokens, NOT its declared expiry: for a rotating key
    # the declared expiry is still months out while trust ends when the grace
    # window closes.
    expires_at: Optional[str] = None
    # Populated only when state == 'unreachable'.
    reason: Optional[str] = None      # 'network' | 'http_error' | 'malformed_response'
    status_code: Optional[int] = None
    cause: Optional[Exception] = None


@dataclass
class _TrustedEntry:
    """One key from the trusted set."""
    public_key: str
    state: str                          # 'active' | 'rotating'
    trusted_until: Optional[float]      # epoch seconds; None = unbounded


DEFAULT_TTL_SECONDS = 10 * 60
DEFAULT_ERROR_TTL_SECONDS = 5
DEFAULT_MIN_REFETCH_INTERVAL_SECONDS = 30


class YeriaPublicKeys:
    """In-memory cache of Yeria's trusted signing keys, resolved by ``kid``."""

    def __init__(
        self,
        *,
        base_url: str,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
        error_ttl_seconds: int = DEFAULT_ERROR_TTL_SECONDS,
        min_refetch_interval_seconds: float = DEFAULT_MIN_REFETCH_INTERVAL_SECONDS,
        http_get: Optional[Callable[[str, int], "requests.Response"]] = None,
        timeout: int = 5,
    ):
        if not base_url:
            raise ValueError("YeriaPublicKeys: base_url is required")
        self._base_url = base_url.rstrip("/")
        # Bounds how stale the SET may be. It does NOT extend how long an
        # individual key is accepted — that is governed by its trusted_until.
        # Lower it to shorten the window a manually revoked key is honoured.
        self._ttl_seconds = ttl_seconds
        # Short TTL for 'unreachable' so a transient blip does not fail every
        # token for the full ttl_seconds (see JS parity).
        self._error_ttl_seconds = error_ttl_seconds
        # Floor between forced refetches. A kid absent from the cached set
        # triggers ONE refetch — that covers a token minted with a key created
        # after the last fetch. Without the floor, a flood of forged kids would
        # turn every bad token into a request against Yeria.
        self._min_refetch_interval_seconds = min_refetch_interval_seconds
        self._timeout = timeout
        # Allow tests to inject a fake. Defaults to requests.get.
        self._http_get = http_get or (lambda url, to: requests.get(url, timeout=to))

        # Trusted-set path.
        self._set: Optional[Tuple[Dict[str, _TrustedEntry], float]] = None
        self._set_unreachable: Optional[Tuple[KeyLookup, float]] = None
        self._last_set_fetch_at: float = 0.0
        # Latched once Yeria answers without `keys` — stops re-probing the set
        # endpoint on every lookup against an older platform.
        self._set_unsupported = False

        # Legacy per-kid path (only used when _set_unsupported).
        self._cache: Dict[str, Tuple[KeyLookup, float]] = {}

    def get_by_kid(self, kid: str) -> Optional[str]:
        """Resolve a kid to a PEM.

        - active/rotating → the PEM string.
        - expired/unknown → ``None``. Yeria answered authoritatively that the
          key is not trusted; the caller must REJECT the token (401).
        - unreachable → raises :class:`YeriaPlatformUnreachableError`. Yeria
          could not be reached, so no trust decision was possible; the caller
          must surface a 503, NOT a 401. As a resolver into
          ``verify_user_token_with_resolver`` this propagates out of verify so
          provider middleware can tell "cannot verify" from "invalid".
        """
        lookup = self._lookup(kid)
        if lookup.state == "unreachable":
            raise YeriaPlatformUnreachableError(
                kid,
                self._set_url(),
                lookup.reason or "network",
                lookup.status_code,
                lookup.cause,
            )
        return lookup.public_key

    def get_state(self, kid: str) -> str:
        """Resolve a kid to its trust state, INCLUDING ``unreachable``. Same
        network / cache behaviour as :meth:`get_by_kid` but never raises —
        for callers that want to log / branch on the state (e.g. tell a
        platform outage from a genuinely unknown key without a try/except)."""
        return self._lookup(kid).state

    def invalidate(self, kid: str) -> None:
        """Drop the cached set (and any legacy per-kid entry) so the next
        lookup refetches. Use on an out-of-band revoke signal — an admin
        webhook, an ops call. NOT useful as a verify-failure hook: a
        rotated-out key still produces a mathematically valid signature, so
        rotation never surfaces as a verification failure. Staleness is
        handled by ``trusted_until``."""
        self._cache.pop(kid, None)
        self._set = None

    def invalidate_all(self) -> None:
        """Drop the entire cache."""
        self._cache.clear()
        self._set = None
        self._set_unreachable = None

    # ── internals ────────────────────────────────────────────────────────
    def _set_url(self) -> str:
        return f"{self._base_url}/api/v1/public/registry/public-key"

    def _url_for(self, kid: str) -> str:
        return f"{self._base_url}/api/v1/public/registry/public-keys/{kid}"

    def _lookup(self, kid: str) -> KeyLookup:
        if not isinstance(kid, str) or not kid:
            # Malformed input, not a platform problem — authoritative reject.
            return KeyLookup(state="unknown")

        if not self._set_unsupported:
            via_set = self._lookup_in_set(kid)
            if via_set is not None:
                return via_set
            # Fell through: this Yeria predates the trusted-set response.

        return self._lookup_by_kid(kid)

    def _lookup_in_set(self, kid: str) -> Optional[KeyLookup]:
        """Resolve from the trusted set. Returns ``None`` when the set path is
        not usable against this platform (no ``keys`` array) so the caller can
        fall back to the per-kid endpoint."""
        kind, payload = self._ensure_set(force=False)
        if kind == "unreachable":
            return payload
        if kind == "unsupported":
            self._set_unsupported = True
            return None

        entries: Dict[str, _TrustedEntry] = payload
        entry = entries.get(kid)

        # Absent kid: either genuinely unknown, or minted with a key created
        # after our last fetch. One rate-limited refetch settles it.
        if entry is None and (time.time() - self._last_set_fetch_at) >= self._min_refetch_interval_seconds:
            kind, payload = self._ensure_set(force=True)
            if kind == "unreachable":
                return payload
            if kind == "unsupported":
                self._set_unsupported = True
                return None
            entries = payload
            entry = entries.get(kid)

        if entry is None:
            return KeyLookup(state="unknown")

        # Present but past its deadline — the cached document outlived the
        # key's trust. Reject without a refetch: Yeria would not hand the key
        # back either. This is what caps the retired-key window at zero.
        if entry.trusted_until is not None and entry.trusted_until <= time.time():
            return KeyLookup(state="expired")

        return KeyLookup(
            state=entry.state,
            public_key=entry.public_key,
            expires_at=(
                None if entry.trusted_until is None
                else datetime.fromtimestamp(entry.trusted_until, timezone.utc).isoformat()
            ),
        )

    def _ensure_set(self, *, force: bool):
        """Returns ``(kind, payload)`` where kind ∈ {'ok', 'unreachable',
        'unsupported'} and payload is the entry map / the KeyLookup / None."""
        now = time.time()

        if not force:
            if self._set_unreachable and self._set_unreachable[1] > now:
                return "unreachable", self._set_unreachable[0]
            if self._set and self._set[1] > now:
                return "ok", self._set[0]

        kind, payload = self._fetch_set()
        self._last_set_fetch_at = now

        if kind == "unreachable":
            self._set_unreachable = (payload, now + self._error_ttl_seconds)
            return kind, payload
        if kind == "unsupported":
            return kind, payload

        self._set_unreachable = None
        self._set = (payload, now + self._ttl_seconds)
        return kind, payload

    def _fetch_set(self):
        url = self._set_url()
        try:
            res = self._http_get(url, self._timeout)
        except requests.RequestException as e:
            return "unreachable", KeyLookup(state="unreachable", reason="network", cause=e)

        # Unlike the per-kid endpoint there is no authoritative-404 case here:
        # the set always exists. Any non-2xx is the platform failing to answer.
        status = getattr(res, "status_code", None)
        if status is not None and not (200 <= status < 300):
            return "unreachable", KeyLookup(
                state="unreachable", reason="http_error", status_code=status
            )

        try:
            body = res.json()
        except ValueError:
            return "unreachable", KeyLookup(
                state="unreachable", reason="malformed_response", status_code=status
            )

        result = _extract_result(body)
        if not isinstance(result, dict):
            return "unreachable", KeyLookup(
                state="unreachable", reason="malformed_response", status_code=status
            )

        raw_keys = result.get("keys")
        if not isinstance(raw_keys, list):
            # Pre-trusted-set Yeria: it answered fine, it just has no set to
            # give. Not an error — the caller falls back to the per-kid route.
            return "unsupported", None

        entries: Dict[str, _TrustedEntry] = {}
        for raw in raw_keys:
            if not isinstance(raw, dict):
                continue
            kid = raw.get("key_id")
            pem = raw.get("public_key")
            state = raw.get("state")
            if not isinstance(kid, str) or not isinstance(pem, str):
                continue
            if state not in ("active", "rotating"):
                continue
            entries[kid] = _TrustedEntry(
                public_key=pem,
                state=state,
                trusted_until=_parse_iso(raw.get("trusted_until")),
            )

        return "ok", entries

    # ── legacy per-kid path ──────────────────────────────────────────────
    # Used only against a Yeria that does not publish the trusted set.

    def _lookup_by_kid(self, kid: str) -> KeyLookup:
        now = time.time()
        cached = self._cache.get(kid)
        if cached and cached[1] > now:
            return cached[0]

        lookup = self._fetch(kid)
        # Transient (unreachable) results get the short error TTL; authoritative
        # results get the normal TTL — clamped to the key's own trust deadline
        # so a rotating key is never cached past the end of its grace window.
        ttl = self._error_ttl_seconds if lookup.state == "unreachable" else self._ttl_seconds
        deadline = _parse_iso(lookup.expires_at)
        if deadline is not None:
            ttl = max(0.0, min(float(ttl), deadline - now))
        self._cache[kid] = (lookup, now + ttl)
        return lookup

    def _fetch(self, kid: str) -> KeyLookup:
        url = self._url_for(kid)
        try:
            res = self._http_get(url, self._timeout)
        except requests.RequestException as e:
            # Transport failure (DNS, connection refused, timeout). Yeria was
            # never reached — no decision about the key is possible.
            return KeyLookup(state="unreachable", reason="network", cause=e)

        # Yeria answers 200 with a state body for a known kid and 404 (still a
        # well-formed body) for a genuinely unknown one. Any OTHER non-2xx
        # (5xx, 502/503 gateway pages, 429, …) is the platform failing to
        # answer — treat as unreachable, not as an authoritative verdict.
        status = getattr(res, "status_code", None)
        if status is not None and not (200 <= status < 300) and status != 404:
            return KeyLookup(state="unreachable", reason="http_error", status_code=status)

        # A body that will not parse as JSON (e.g. an HTML error page served by
        # a proxy in front of Yeria) is NOT a trustworthy "unknown".
        try:
            body = res.json()
        except ValueError:
            return KeyLookup(state="unreachable", reason="malformed_response", status_code=status)

        result = _extract_result(body)
        state = result.get("state") if isinstance(result, dict) else None
        state_known = state in ("active", "rotating", "expired", "unknown")

        # A 404 is an authoritative not-found regardless of what the body looks
        # like: Yeria only serves it when it holds no such kid. Older platforms
        # lose the `state` field on that path (the error envelope drops unknown
        # keys), and treating that as malformed answered 503 for every forged
        # kid instead of rejecting it.
        if not state_known and status == 404:
            return KeyLookup(state="unknown")

        # Any other body without a recognisable state is a broken contract, not
        # an authoritative 'unknown' — surface it as unreachable so it is never
        # silently cached as a hard token rejection.
        if not isinstance(result, dict) or not state_known:
            return KeyLookup(state="unreachable", reason="malformed_response", status_code=status)

        if state in ("active", "rotating"):
            # Prefer `trusted_until` (the real deadline) over `expires_at`
            # (the key's declared expiry, untouched by rotation). Older Yeria
            # sends only the latter.
            trusted_until = result.get("trusted_until") or result.get("expires_at")
            return KeyLookup(
                state=state,
                public_key=result.get("public_key"),
                expires_at=trusted_until,
            )
        return KeyLookup(state=state)


def _parse_iso(value) -> Optional[float]:
    """ISO-8601 → epoch seconds, or None when absent / unparseable.

    ``datetime.fromisoformat`` only learned to accept a trailing ``Z`` in
    3.11; the SDK supports 3.10, so normalise it first.
    """
    if not isinstance(value, str) or not value:
        return None
    text = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()


def _extract_result(body):
    """Extract ``result`` from a ``{success, message, result}`` envelope,
    or fall back to the top-level object when the platform returned a
    state-only body."""
    if not isinstance(body, dict):
        return None
    if isinstance(body.get("result"), dict):
        return body["result"]
    if isinstance(body.get("state"), str):
        return body
    # Trusted-set body without the wrapper.
    if isinstance(body.get("keys"), list) or isinstance(body.get("public_key"), str):
        return body
    return None
