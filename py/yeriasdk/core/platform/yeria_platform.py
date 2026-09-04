"""YeriaPlatform — provider-backend <-> Yeria-backend exchanges.
Mirrors js/src/core/platform/yeria-platform-client.ts.

Owns notifications, key rotation, token verification (rotation-aware via an
internal YeriaPublicKeys), user-details fetch, and Yeria public-key retrieval.
"""

import base64
import json
import os
import time
from typing import Any, Optional

from ..yeria_protocol import UserDetails, YeriaTokenClaims, YeriaPublicKey
from ..security.yeria_signer import YeriaSigner
from ..security.yeria_user_token_verifier import YeriaUserTokenVerifier, _b64url_decode
from ..key_store import YeriaPublicKeys
from ...types.models import SecureNotificationResponse
from ...errors.exceptions import ConfigurationError, ExternalError
from ...utils.signing_json import dumps_for_signing


def _decode_aud(token: str) -> Optional[str]:
    """Decode a JWT's ``aud`` WITHOUT verifying — used only to route the
    request. The backend verifies the token."""
    parts = token.split(".")
    if len(parts) != 3 or not parts[1]:
        return None
    try:
        claims = json.loads(_b64url_decode(parts[1]).decode("utf-8"))
        aud = claims.get("aud")
        return str(aud) if aud is not None else None
    except Exception:
        return None


class YeriaPlatform:
    """Provider-backend <-> Yeria-backend flow: everything network-facing. Owns
    notifications (sign/send), key rotation on the Yeria registry, user-details
    fetch, Yeria public-key retrieval, and rotation-aware user-token
    verification — resolving the JWT ``kid`` via an internal, lazily-created
    YeriaPublicKeys (the kid->PEM resolver + cache). Shares the service
    YeriaSigner with the app. INTERNAL -- reached through app.verify_user_token / notify / rotate_key / fetch_user_details.

    Not: it does not build or sign views — that is YeriaUI.
    """

    def __init__(
        self,
        app_id: str,
        signer: YeriaSigner,
        base_url: Optional[str] = None,
        notification_timeout: int = 5,
        key_store: Optional[YeriaPublicKeys] = None,
    ):
        self._app_id = app_id
        self._signer = signer
        self._base_url = base_url
        self._notification_timeout = notification_timeout
        self._key_store = key_store

    def set_base_url(self, base_url: Optional[str]) -> None:
        self._base_url = base_url

    # ── Notifications ───────────────────────────────────────────────────
    def sign_notification(self, notification: Any) -> SecureNotificationResponse:
        """Sign a notification without sending it (returns the signed payload)."""
        return self._signer.sign_notification(notification, self._app_id)

    def send_notification(self, notification: Any) -> None:
        """Sign and POST a notification to ``POST /api/v1/user/notifications``."""
        import requests

        signed = self.sign_notification(notification)
        if not self._base_url:
            raise ConfigurationError(
                "Yeria base_url required for sending notifications. Set base_url in YeriaAppConfig."
            )
        url = self._base_url.rstrip("/") + "/api/v1/user/notifications"
        payload = {
            "appId": signed.app_id,
            "signature": signed.signature,
            "timestamp": signed.timestamp,
            "notification": {
                "userId": signed.notification.user_id,
                "message": {
                    "title": signed.notification.message.title,
                    "body": signed.notification.message.body,
                    "link": signed.notification.message.link,
                },
            },
        }
        try:
            res = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=self._notification_timeout)
            res.raise_for_status()
        except requests.exceptions.RequestException as e:
            raise ExternalError(f"Failed to send notification: {e}")

    # ── Key rotation ────────────────────────────────────────────────────
    def rotate_key(self, yeria_api_base_url: str, service_id: Any, new_keys: dict) -> dict:
        """Rotate the service signing key on the Yeria registry (signed request)."""
        import requests

        priv = new_keys.get("privateKey") or new_keys.get("private_key")
        pub = new_keys.get("publicKey") or new_keys.get("public_key")
        if not priv or not pub:
            raise ConfigurationError("rotate_key requires both privateKey and publicKey in PEM format")

        envelope = {"serviceId": str(service_id), "newPublicKey": pub, "timestamp": int(time.time() * 1000)}
        # Same serializer as every signed byte: compact, byte-matches JS.
        signature = self._signer.sign_payload(dumps_for_signing(envelope))
        url = f"{yeria_api_base_url.rstrip('/')}/api/v1/services/{service_id}/keys/rotate"
        try:
            res = requests.post(
                url,
                json={"envelope": envelope, "signature": signature, "currentPublicKey": self._signer.get_service_public_key()},
                headers={"Content-Type": "application/json"},
                timeout=self._notification_timeout,
            )
            res.raise_for_status()
        except requests.exceptions.RequestException as e:
            raise ExternalError(f"Key rotation request failed: {e}")

        body = res.json() or {}
        data = body.get("data") or {}
        key = data.get("key") or {}
        self._signer.update_key_pair(priv, pub)
        return {
            "key_id": key.get("id"),
            "expires_at": key.get("expires_at"),
            "grace_period_minutes": data.get("grace_period_minutes", 5),
        }

    # ── Token verification (rotation-aware, internal key store) ──────────
    def verify_yeria_token(self, jwt: str, expected_audience: Optional[Any] = None) -> YeriaTokenClaims:
        """Verify a Yeria user token, resolving the signing key by its ``kid``
        header via the internal YeriaPublicKeys (rotation-aware, no PEM to pass)."""
        ks = self._ensure_key_store()
        return YeriaUserTokenVerifier.verify_yeria_token_with_resolver(jwt, ks.get_by_kid, expected_audience)

    def _ensure_key_store(self) -> YeriaPublicKeys:
        if self._key_store is None:
            if not self._base_url:
                raise ConfigurationError("verify_yeria_token requires base_url (or a key_store) in config.")
            self._key_store = YeriaPublicKeys(base_url=self._base_url)
        return self._key_store

    # ── Yeria active public key ─────────────────────────────────────────
    def get_yeria_public_key(self, timeout: Optional[int] = None) -> YeriaPublicKey:
        """Pull Yeria's active backend signing key (RS256) from
        ``GET /api/v1/public/registry/public-key``. Cache it, then verify tokens
        locally with ``YeriaApp.verify_yeria_token``."""
        import requests

        if not self._base_url:
            raise ConfigurationError("get_yeria_public_key requires base_url in config.")
        url = self._base_url.rstrip("/") + "/api/v1/public/registry/public-key"
        try:
            # The configured budget first, as send_notification does; a
            # per-call `timeout` wins over it.
            res = requests.get(url, timeout=timeout if timeout is not None else self._notification_timeout)
        except requests.RequestException as e:
            raise ExternalError(f"get_yeria_public_key request failed: {e}")
        try:
            data = res.json()
        except ValueError:
            data = None
        if res.status_code != 200:
            raise ExternalError(f"get_yeria_public_key failed: HTTP {res.status_code}")
        result = data.get("result", data) if isinstance(data, dict) else None
        if not isinstance(result, dict) or not isinstance(result.get("public_key"), str):
            raise ExternalError("get_yeria_public_key: unexpected response shape")
        return YeriaPublicKey(
            public_key=result["public_key"],
            key_id=str(result.get("key_id", "")),
            algorithm=result.get("algorithm"),
            expires_at=result.get("expires_at"),
        )

    # ── User details (token-authorized) ─────────────────────────────────
    def fetch_user_details(self, user_service_token: str, timeout: Optional[int] = None) -> UserDetails:
        """Fetch a Yeria user's details, authorized by the user's own live
        service token. The token is the only credential; the backend verifies
        the provider signature AND the token, and identifies the user by the
        token's ``sub``. POSTs to
        ``/api/v1/provider/services/{service_id}/users/details``."""
        import requests

        if not self._base_url:
            raise ConfigurationError("fetch_user_details: base_url is required (set base_url in YeriaAppConfig)", parameter="base_url")
        if not isinstance(user_service_token, str) or not user_service_token:
            raise ConfigurationError("fetch_user_details: user_service_token is required")

        service_id = _decode_aud(user_service_token)
        if not service_id:
            raise ConfigurationError("fetch_user_details: user token missing aud (service id)")

        envelope = {
            "service_id": service_id,
            "user_token": user_service_token,
            "timestamp": int(time.time() * 1000),
            "nonce": base64.b16encode(os.urandom(16)).decode().lower(),
        }
        payload_str = dumps_for_signing(envelope)
        signature = self._signer.sign_payload(payload_str)

        url = self._base_url.rstrip("/") + f"/api/v1/provider/services/{service_id}/users/details"
        try:
            res = requests.post(
                url,
                json={"envelope": envelope, "signature": signature},
                timeout=timeout if timeout is not None else self._notification_timeout,
            )
        except requests.RequestException as e:
            raise ExternalError(f"Yeria user details fetch transport error: {e}")

        try:
            data = res.json()
        except ValueError:
            data = None
        if res.status_code != 200:
            msg = _extract_error_message(data) or f"HTTP {res.status_code}"
            raise ExternalError(f"Yeria user details fetch failed: {msg}")

        result = data.get("result", data) if isinstance(data, dict) else None
        if not isinstance(result, dict):
            raise ExternalError("Yeria user details fetch: unexpected response shape")

        return UserDetails(
            user_id=str(result.get("user_id", "")),
            first_name=result.get("first_name"),
            last_name=result.get("last_name"),
            country_code=result.get("country_code"),
            email=result.get("email"),
        )


def _extract_error_message(body: Any) -> Optional[str]:
    if not isinstance(body, dict):
        return None
    if isinstance(body.get("message"), str):
        return body["message"]
    err = body.get("error")
    if isinstance(err, dict) and isinstance(err.get("message"), str):
        return err["message"]
    if isinstance(err, str):
        return err
    return None
