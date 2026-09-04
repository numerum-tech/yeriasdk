"""YeriaPublicKeys — trusted-set resolution, staleness bounds, fallback.

Mirrors ``js/tests/key-store.test.ts``. The behaviour under test is the one
that motivated the trusted set: a key Yeria has retired must stop verifying
tokens the instant its grace window closes, even when the SDK still holds the
document that carried it.
"""

import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

from yeriasdk.core.key_store import YeriaPublicKeys
from yeriasdk.errors import YeriaPlatformUnreachableError

BASE_URL = "https://yeria.test"
SET_URL = f"{BASE_URL}/api/v1/public/registry/public-key"


def kid_url(kid: str) -> str:
    return f"{BASE_URL}/api/v1/public/registry/public-keys/{kid}"


PEM_ACTIVE = "-----BEGIN PUBLIC KEY-----\nACTIVE\n-----END PUBLIC KEY-----"
PEM_ROTATING = "-----BEGIN PUBLIC KEY-----\nROTATING\n-----END PUBLIC KEY-----"


def iso_in(seconds: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()


class FakeResponse:
    """Minimal requests.Response stand-in — only status_code / json() used."""

    def __init__(self, body, status_code=200, raise_on_json=False):
        self._body = body
        self.status_code = status_code
        self._raise_on_json = raise_on_json

    def json(self):
        if self._raise_on_json:
            raise ValueError("not json")
        return self._body


def envelope(result):
    return {"success": True, "status": 200, "message": "ok", "result": result}


def active_entry(**overrides):
    entry = {
        "key_id": "key_active",
        "state": "active",
        "algorithm": "RS256",
        "public_key": PEM_ACTIVE,
        "trusted_until": iso_in(365 * 24 * 3600),
    }
    entry.update(overrides)
    return entry


def rotating_entry(trusted_in_seconds: float):
    return {
        "key_id": "key_rotating",
        "state": "rotating",
        "algorithm": "RS256",
        "public_key": PEM_ROTATING,
        "trusted_until": iso_in(trusted_in_seconds),
    }


def set_body(keys):
    return envelope({
        "public_key": PEM_ACTIVE,
        "algorithm": "RS256",
        "key_id": "key_active",
        "created_at": iso_in(-600),
        "expires_at": iso_in(365 * 24 * 3600),
        "keys": keys,
    })


def make_http_get(handler):
    """Returns (callable, calls) recording every URL requested."""
    calls = []

    def http_get(url, timeout):
        calls.append(url)
        return handler(url)

    return http_get, calls


# ── trusted set ──────────────────────────────────────────────────────────

def test_resolves_from_the_set_and_caches_the_document():
    http_get, calls = make_http_get(
        lambda url: FakeResponse(set_body([active_entry(), rotating_entry(240)]))
    )
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get)

    assert keys.get_by_kid("key_active") == PEM_ACTIVE
    assert keys.get_by_kid("key_rotating") == PEM_ROTATING
    # Two lookups, one document.
    assert calls == [SET_URL]


def test_rejects_a_rotating_key_once_trusted_until_passes_without_refetch():
    # Grace ends 10 ms from now; the cached document keeps the entry for the
    # full 10-minute TTL, so only the deadline can stop it.
    http_get, calls = make_http_get(
        lambda url: FakeResponse(set_body([active_entry(), rotating_entry(0.01)]))
    )
    keys = YeriaPublicKeys(
        base_url=BASE_URL,
        http_get=http_get,
        # Long floor: a refetch here would be a test failure, not a rescue.
        min_refetch_interval_seconds=3600,
    )

    assert keys.get_by_kid("key_rotating") == PEM_ROTATING

    time.sleep(0.05)

    assert keys.get_by_kid("key_rotating") is None
    assert keys.get_state("key_rotating") == "expired"
    assert calls == [SET_URL]  # still one fetch — the deadline decided


def test_active_key_unaffected_by_an_expired_sibling_entry():
    http_get, _ = make_http_get(
        lambda url: FakeResponse(set_body([active_entry(), rotating_entry(-60)]))
    )
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get)

    assert keys.get_by_kid("key_rotating") is None
    assert keys.get_by_kid("key_active") == PEM_ACTIVE


def test_refetches_once_when_a_kid_is_absent():
    state = {"rotated": False}

    def handler(url):
        entries = (
            [active_entry(key_id="key_fresh", public_key="PEM_FRESH"), active_entry()]
            if state["rotated"] else [active_entry()]
        )
        return FakeResponse(set_body(entries))

    http_get, calls = make_http_get(handler)
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get, min_refetch_interval_seconds=0)

    assert keys.get_by_kid("key_active") == PEM_ACTIVE
    state["rotated"] = True
    assert keys.get_by_kid("key_fresh") == "PEM_FRESH"
    assert len(calls) == 2


def test_absent_kid_refetch_is_rate_limited():
    http_get, calls = make_http_get(lambda url: FakeResponse(set_body([active_entry()])))
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get, min_refetch_interval_seconds=3600)

    # Primes the set (fetch 1). The floor blocks any refetch after that.
    assert keys.get_by_kid("key_active") == PEM_ACTIVE

    for i in range(25):
        assert keys.get_by_kid(f"forged_{i}") is None
    assert len(calls) == 1


def test_absent_kid_reports_unknown():
    http_get, _ = make_http_get(lambda url: FakeResponse(set_body([active_entry()])))
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get, min_refetch_interval_seconds=3600)

    assert keys.get_state("nope") == "unknown"


def test_empty_kid_never_touches_the_network():
    http_get, calls = make_http_get(lambda url: FakeResponse(set_body([active_entry()])))
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get)

    assert keys.get_by_kid("") is None
    assert calls == []


def test_skips_entries_without_a_pem_or_with_an_untrusted_state():
    http_get, _ = make_http_get(lambda url: FakeResponse(set_body([
        active_entry(),
        {"key_id": "key_nopem", "state": "active", "algorithm": "RS256"},
        {"key_id": "key_expired", "state": "expired", "public_key": "PEM_X"},
    ])))
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get, min_refetch_interval_seconds=3600)

    assert keys.get_by_kid("key_nopem") is None
    assert keys.get_by_kid("key_expired") is None
    assert keys.get_by_kid("key_active") == PEM_ACTIVE


def test_entry_without_a_deadline_is_unbounded():
    http_get, _ = make_http_get(
        lambda url: FakeResponse(set_body([active_entry(trusted_until=None)]))
    )
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get)

    assert keys.get_by_kid("key_active") == PEM_ACTIVE


def test_set_is_refetched_after_its_ttl():
    http_get, calls = make_http_get(lambda url: FakeResponse(set_body([active_entry()])))
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get, ttl_seconds=0.01)

    assert keys.get_by_kid("key_active") == PEM_ACTIVE
    time.sleep(0.05)
    assert keys.get_by_kid("key_active") == PEM_ACTIVE
    assert len(calls) == 2


def test_invalidate_drops_the_cached_set():
    http_get, calls = make_http_get(lambda url: FakeResponse(set_body([active_entry()])))
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get)

    keys.get_by_kid("key_active")
    keys.invalidate("key_active")
    keys.get_by_kid("key_active")

    assert len(calls) == 2


# ── platform unreachable ─────────────────────────────────────────────────

def test_transport_failure_raises_instead_of_rejecting():
    def handler(url):
        raise requests.ConnectionError("ECONNREFUSED")

    http_get, _ = make_http_get(handler)
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get)

    with pytest.raises(YeriaPlatformUnreachableError):
        keys.get_by_kid("key_active")
    assert keys.get_state("key_active") == "unreachable"


def test_5xx_is_unreachable_not_a_verdict():
    http_get, _ = make_http_get(lambda url: FakeResponse({"error": "bad gateway"}, status_code=502))
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get)

    with pytest.raises(YeriaPlatformUnreachableError):
        keys.get_by_kid("key_active")


def test_unparseable_body_is_unreachable():
    http_get, _ = make_http_get(lambda url: FakeResponse(None, raise_on_json=True))
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get)

    with pytest.raises(YeriaPlatformUnreachableError):
        keys.get_by_kid("key_active")


def test_outage_is_cached_briefly_then_recovers():
    state = {"down": True}

    def handler(url):
        if state["down"]:
            return FakeResponse({}, status_code=503)
        return FakeResponse(set_body([active_entry()]))

    http_get, calls = make_http_get(handler)
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get, error_ttl_seconds=0.01)

    with pytest.raises(YeriaPlatformUnreachableError):
        keys.get_by_kid("key_active")
    # Second call inside the error TTL is served from cache — no new request.
    with pytest.raises(YeriaPlatformUnreachableError):
        keys.get_by_kid("key_active")
    assert len(calls) == 1

    state["down"] = False
    time.sleep(0.05)
    assert keys.get_by_kid("key_active") == PEM_ACTIVE


# ── pre-trusted-set platform ─────────────────────────────────────────────

def test_falls_back_to_the_per_kid_endpoint():
    def handler(url):
        if url == SET_URL:
            # Old Yeria: active key only, no `keys` array.
            return FakeResponse(envelope({"public_key": PEM_ACTIVE, "key_id": "key_active"}))
        return FakeResponse(envelope({
            "state": "active",
            "key_id": "key_active",
            "public_key": PEM_ACTIVE,
            "expires_at": iso_in(1800),
        }))

    http_get, calls = make_http_get(handler)
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get)

    assert keys.get_by_kid("key_active") == PEM_ACTIVE
    assert calls == [SET_URL, kid_url("key_active")]

    # The set endpoint is not probed again — the fallback is latched.
    assert keys.get_by_kid("key_active") == PEM_ACTIVE
    assert len(calls) == 2  # second lookup served from the per-kid cache


def test_per_kid_cache_is_clamped_to_the_trust_deadline():
    state = {"key": "rotating"}

    def handler(url):
        if url == SET_URL:
            return FakeResponse(envelope({"public_key": PEM_ACTIVE}))
        if state["key"] == "rotating":
            return FakeResponse(envelope({
                "state": "rotating",
                "key_id": "key_rotating",
                "public_key": PEM_ROTATING,
                # Trust ends in 10 ms; the cache TTL is 10 minutes.
                "trusted_until": iso_in(0.01),
            }))
        return FakeResponse(envelope({"state": "expired", "key_id": "key_rotating"}))

    http_get, calls = make_http_get(handler)
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get)

    assert keys.get_by_kid("key_rotating") == PEM_ROTATING

    time.sleep(0.05)
    state["key"] = "expired"

    # Cache entry expired with the key, so the store asks again and Yeria now
    # refuses the PEM. Without the clamp this stayed cached ~10 min.
    assert keys.get_by_kid("key_rotating") is None
    assert len([u for u in calls if u == kid_url("key_rotating")]) == 2


def test_per_kid_404_is_unknown():
    def handler(url):
        if url == SET_URL:
            return FakeResponse(envelope({"public_key": PEM_ACTIVE}))
        return FakeResponse({"state": "unknown", "key_id": "nope"}, status_code=404)

    http_get, _ = make_http_get(handler)
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get)

    assert keys.get_state("nope") == "unknown"


def test_stateless_404_rejects_rather_than_answering_503():
    # Shape emitted by a Yeria whose error envelope drops unknown fields:
    # {success, status, error:{status, message}} — no `state` anywhere.
    def handler(url):
        if url == SET_URL:
            return FakeResponse(envelope({"public_key": PEM_ACTIVE}))
        return FakeResponse(
            {"success": False, "status": 404, "error": {"status": 404, "message": "Key not found"}},
            status_code=404,
        )

    http_get, _ = make_http_get(handler)
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get)

    assert keys.get_state("nope") == "unknown"
    assert keys.get_by_kid("nope") is None


def test_stateless_200_body_is_still_unreachable():
    # Only 404 is authoritative-by-status. A 200 that fails the contract stays
    # "cannot verify" — it may be a proxy page, not Yeria.
    def handler(url):
        if url == SET_URL:
            return FakeResponse(envelope({"public_key": PEM_ACTIVE}))
        return FakeResponse({"hello": "world"}, status_code=200)

    http_get, _ = make_http_get(handler)
    keys = YeriaPublicKeys(base_url=BASE_URL, http_get=http_get)

    with pytest.raises(YeriaPlatformUnreachableError):
        keys.get_by_kid("nope")
