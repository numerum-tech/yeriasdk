"""YeriaApp — the provider's SECRET-HOLDING half of the SDK.
Mirrors js/src/core/yeria-app.ts.

It owns the Ed25519 keypair and does everything that needs it:

  * ``app.serve(view)``             — sign a view into a v3 SignedEnvelope
  * ``app.verify_integrity(env)``   — verify an envelope this app signed
  * ``app.verify_user_token(bearer)``— verify an inbound Yeria user token
  * ``app.notify(...)`` / ``sign_notification`` / ``rotate_key`` /
    ``fetch_user_details``

The KEYLESS other half is the ``YeriaUI`` factory
(``YeriaUI.create_form_view(...)``), imported separately — it builds views with
no credential. Typical flow::

    v = YeriaUI.create_form_view(id, title)
    ...
    return app.serve(v)

Construct once with ``YeriaAppConfig(app_id, private_key, base_url, ...)``: the
parsed private key is held in memory, so a YeriaApp is a process-wide
singleton. The signer, envelope verifier, kid key cache, and Yeria HTTP client
are all internal — the methods above are the whole surface.
"""

from dataclasses import dataclass
from typing import Any, Dict, Optional

from .base_view import BaseView
from .yeria_protocol import (
    SignedEnvelope,
    DecodedPayload,
    YeriaTokenClaims,
    UserDetails,
    YeriaPublicKey,
    PublicKeyResolver,
)
from .security.yeria_signer import YeriaSigner
from .security.yeria_envelope_verifier import YeriaEnvelopeVerifier
from .security.yeria_user_token_verifier import YeriaUserTokenVerifier
from .platform.yeria_platform import YeriaPlatform
from ..types.models import SecureNotificationResponse


@dataclass
class YeriaAppConfig:
    """Configuration for YeriaApp."""

    app_id: str
    private_key: Optional[str] = None  # Ed25519 private key (PEM); public derived if omitted
    public_key: Optional[str] = None
    allowed_domains: Optional[list] = None
    view_expiration_minutes: int = 60
    base_url: Optional[str] = None  # Yeria platform base URL (e.g. https://yeria.app)
    notification_timeout: int = 5


class YeriaApp:
    """The secret-holding half of the SDK — see module docstring.

    Owns the Ed25519 keypair and exposes sign / verify / verify-user-token /
    notify / rotate. View building is keyless and lives on the ``YeriaUI``
    factory. The signer, envelope verifier, Yeria HTTP client, and kid key
    cache are internal; the public methods below are the whole surface.
    """

    def __init__(self, config: YeriaAppConfig):
        self.config = config
        view_exp = config.view_expiration_minutes or 60

        self._signer = YeriaSigner(private_key=config.private_key, public_key=config.public_key)
        self._envelope_verifier = YeriaEnvelopeVerifier(
            app_id=config.app_id,
            public_key=self._signer.get_service_public_key(),
            view_expiration_minutes=view_exp,
        )
        # Provider-to-Yeria-backend flow. Internal — reach it through
        # verify_user_token / notify / rotate_key / fetch_user_details.
        self._platform = YeriaPlatform(
            app_id=config.app_id,
            signer=self._signer,
            base_url=config.base_url,
            notification_timeout=config.notification_timeout,
        )

    # ── Views: sign / verify ────────────────────────────────────────────
    def serve(self, view: BaseView) -> SignedEnvelope:
        """Sign a view (built via ``YeriaUI.create_form_view(...)`` etc.) into a
        v3 SignedEnvelope ``{ payload, signature }`` — send it as-is. Single
        signing path; view building is keyless and lives on ``YeriaUI``."""
        return self._signer.sign_view(view.build(), self.config.app_id)

    def serve_error(self, code: str, message: str, status: int = 400, invalid_params=None) -> SignedEnvelope:
        """Sign a provider error into a v3 SignedEnvelope whose payload is
        ``{"appId", "timestamp", "error": {...}}`` (parallel to ``serve``, which
        carries ``view``). Return it to the mobile client on the failing
        request. When you cannot sign (no key / app), use the keyless
        ``YeriaUI.error(...)`` instead — the mobile accepts an unsigned
        ``{"error": {...}}`` body too."""
        import time as _time
        from .provider_error import build_provider_error
        from ..utils.signing_json import dumps_for_signing
        body = build_provider_error(code, message, status, invalid_params)
        decoded = {"appId": self.config.app_id, "timestamp": int(_time.time() * 1000), **body}
        payload = dumps_for_signing(decoded)
        return SignedEnvelope(payload=payload, signature=self._signer.sign_payload(payload))

    def verify_integrity(self, envelope: SignedEnvelope) -> bool:
        """Verify the integrity of an envelope this app produced (signature +
        appId + expiration)."""
        return self._envelope_verifier.verify_integrity(envelope)

    def get_service_public_key(self) -> str:
        """The service's own public key (derived from the private key)."""
        return self._signer.get_service_public_key()

    # ── Yeria backend ───────────────────────────────────────────────────
    def verify_user_token(self, bearer_token: str, expected_audience: Optional[Any] = None) -> YeriaTokenClaims:
        """Verify an inbound Yeria-issued user token (the bearer a mobile client
        sends). The signing ``kid`` is resolved against Yeria (rotation-aware)
        via an internal key cache — you never wire a resolver or hold PEMs.
        Raises ``YeriaPlatformUnreachableError`` when Yeria is unreachable
        (surface 503); an expired/unknown key surfaces as a verification error
        (401). ``expected_audience`` optionally pins the token to this service."""
        return self._platform.verify_yeria_token(bearer_token, expected_audience)

    def sign_notification(self, notification: Any) -> SecureNotificationResponse:
        """Sign a notification without sending it (returns the signed payload)."""
        return self._platform.sign_notification(notification)

    def notify(self, notification: Any) -> None:
        """Sign and POST a notification to the Yeria backend."""
        return self._platform.send_notification(notification)

    def rotate_key(self, yeria_api_base_url: str, service_id: Any, new_keys: Dict[str, str]) -> Dict[str, Any]:
        """Rotate the service's signing key on the Yeria registry, then refresh
        the local integrity check so freshly-signed envelopes still verify."""
        rotated = self._platform.rotate_key(yeria_api_base_url, service_id, new_keys)
        self._envelope_verifier.set_public_key(self._signer.get_service_public_key())
        return rotated

    def fetch_user_details(self, user_service_token: str, timeout: Optional[int] = None) -> UserDetails:
        """Fetch a Yeria user's details, authorized by the user's own live
        service token."""
        return self._platform.fetch_user_details(user_service_token, timeout=timeout)

    # ── Static view-signing utilities ───────────────────────────────────
    @staticmethod
    def verify_signature(public_key: str, payload: str, signature: str, on_error: Optional[Any] = None) -> bool:
        """Verify a raw Ed25519 signature over the payload string against a PEM."""
        return YeriaEnvelopeVerifier.verify_signature(public_key, payload, signature, on_error)

    @staticmethod
    def sign_view(view: Dict[str, Any], app_id: str, private_key: str, timestamp: Optional[int] = None) -> SignedEnvelope:
        """Sign a view into a v3 SignedEnvelope from a one-off private key."""
        return YeriaSigner(private_key=private_key).sign_view(view, app_id, timestamp)

    # ── Static token verification (escape hatch) ────────────────────────
    @staticmethod
    def verify_yeria_token(jwt_token: str, yeria_public_key: str, expected_audience: Optional[Any] = None) -> YeriaTokenClaims:
        """Verify a Yeria-issued user token against a known PEM (pure, no
        network). Prefer the instance method ``app.verify_user_token(bearer,
        aud?)``, which resolves the ``kid`` for you."""
        return YeriaUserTokenVerifier.verify_yeria_token(jwt_token, yeria_public_key, expected_audience)

    @staticmethod
    def verify_yeria_token_with_resolver(jwt_token: str, resolver: PublicKeyResolver, expected_audience: Optional[Any] = None) -> YeriaTokenClaims:
        """Same verify, but resolve the signing key by ``kid`` instead of a fixed PEM."""
        return YeriaUserTokenVerifier.verify_yeria_token_with_resolver(jwt_token, resolver, expected_audience)
