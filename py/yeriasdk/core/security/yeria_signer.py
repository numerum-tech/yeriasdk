"""YeriaSigner — holds the service Ed25519 keypair and signs payloads, views
and notifications. Mirrors js/src/core/security/yeria-signer.ts.

The provider configures only its private key; the public key is derived from it
(Ed25519 public keys are deterministic) unless one is supplied.
"""

import base64
import json
import time
from typing import Any, Dict, Optional

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

from ..yeria_protocol import SignedEnvelope
from ...utils.signing_json import dumps_for_signing
from ...types.models import SecureNotificationResponse


def _load_private_key(pem: str) -> Ed25519PrivateKey:
    return serialization.load_pem_private_key(pem.encode(), password=None, backend=default_backend())


def _load_public_key(pem: str) -> Ed25519PublicKey:
    return serialization.load_pem_public_key(pem.encode(), backend=default_backend())


def _public_pem(key: Ed25519PublicKey) -> str:
    return key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()


class YeriaSigner:
    """Ed25519 signer for a Yeria service. Holds the service's PRIVATE key and
    produces the v3 signed envelopes the platform serves to renderers.

    Signs payloads, views and notifications: the signature is Ed25519 over the
    raw payload string bytes. ``sign_view`` returns a ``{payload, signature}``
    SignedEnvelope; ``sign_notification`` returns a SecureNotificationResponse.
    ``update_key_pair()`` supports in-place key rotation. One instance is owned
    and shared by YeriaApp/YeriaUI.

    Not: this object only SIGNS -- it is distinct from YeriaEnvelopeVerifier
    (verifies provider view envelopes) and YeriaUserTokenVerifier (verifies
    Yeria-issued user JWTs).
    """

    def __init__(self, private_key: Optional[str] = None, public_key: Optional[str] = None):
        if private_key:
            self._private_key = _load_private_key(private_key)
            self._public_key = _load_public_key(public_key) if public_key else self._private_key.public_key()
            return
        self._private_key = Ed25519PrivateKey.generate()
        self._public_key = self._private_key.public_key()

    def get_service_public_key(self) -> str:
        """The service's own public key (PEM) — derived from the private key."""
        return _public_pem(self._public_key)

    def get_private_key_obj(self) -> Ed25519PrivateKey:
        return self._private_key

    def update_key_pair(self, private_key: str, public_key: str) -> None:
        """Replace the keypair in place -- supports key rotation without a new instance."""
        self._private_key = _load_private_key(private_key)
        self._public_key = _load_public_key(public_key)

    def sign_payload(self, payload: str) -> str:
        """Sign a raw string; returns the base64 Ed25519 signature over its UTF-8 bytes."""
        return base64.b64encode(self._private_key.sign(payload.encode("utf-8"))).decode()

    def sign_view(self, view: Dict[str, Any], app_id: str, timestamp: Optional[int] = None) -> SignedEnvelope:
        """Wrap a view in a v3 ``{payload, signature}`` envelope signed over the payload bytes."""
        if timestamp is None:
            timestamp = int(time.time() * 1000)
        # Compact separators to byte-match JS JSON.stringify (parity: identical
        # signed bytes across SDKs).
        payload = dumps_for_signing({"appId": app_id, "timestamp": timestamp, "view": view})
        return SignedEnvelope(payload=payload, signature=self.sign_payload(payload))

    def sign_notification(self, notification: Any, app_id: str, timestamp: Optional[int] = None) -> SecureNotificationResponse:
        """Sign a notification into a SecureNotificationResponse (signature over the payload bytes)."""
        if timestamp is None:
            timestamp = int(time.time() * 1000)
        notification_json = notification.to_json()
        # Mirror JS notification.toJSON(): {userId, message:{title, body[, link]}}.
        # JS drops `link` when undefined (JSON.stringify omits it); do the same
        # so the signed bytes match — otherwise Python would emit "link":null.
        message = {
            "title": notification_json.message.title,
            "body": notification_json.message.body,
        }
        if notification_json.message.link is not None:
            message["link"] = notification_json.message.link
        notification_dict = {
            "userId": notification_json.user_id,
            "message": message,
        }
        # Compact separators to byte-match JS JSON.stringify.
        payload = dumps_for_signing(
            {"notification": notification_dict, "timestamp": timestamp, "appId": app_id}
        )
        return SecureNotificationResponse(
            app_id=app_id,
            signature=self.sign_payload(payload),
            timestamp=timestamp,
            notification=notification_json,
        )
