"""YeriaUserTokenVerifier — verifies Yeria-issued RS256 user tokens.
Mirrors js/src/core/security/yeria-user-token-verifier.ts.

`verify_yeria_token(jwt, pem, expected_audience?)` is pure/local (you supply the
key). `verify_yeria_token_with_resolver(jwt, resolver, expected_audience?)`
pulls the key by the token's `kid` via a resolver (e.g. YeriaPublicKeys).
"""

import base64
import json
import time
from typing import Any, Optional

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.backends import default_backend

from ..yeria_protocol import YeriaTokenClaims, PublicKeyResolver
from ...errors.exceptions import SignatureVerificationError, ViewExpiredError


def _b64url_decode(data: str) -> bytes:
    padded = data + "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode(padded)


def _render(value: Any) -> str:
    """Rend une valeur pour un message d'erreur, comme le fait le SDK JS.

    `!r` l'entourait de guillemets, si bien que les deux SDK rapportaient le
    meme rejet dans deux formulations differentes. Une clef absente s'ecrit
    `undefined` des deux cotes plutot que `None` d'un cote et `undefined` de
    l'autre — le message est un diagnostic partage, pas de la prose Python.
    """
    return "undefined" if value is None else str(value)


class YeriaUserTokenVerifier:
    """Verifies a Yeria-ISSUED USER JWT (RS256): enforces ``iss='yeria'``, an
    optional ``aud=<serviceId>``, and ``exp > now``. Static-only helper.

    ``verify_yeria_token(jwt, pem, expected_audience?)`` verifies against a PEM
    you supply; ``verify_yeria_token_with_resolver(jwt, resolver,
    expected_audience?)`` resolves the key from the token's ``kid`` header via a
    resolver (e.g. YeriaPublicKeys). Raises SignatureVerificationError /
    ViewExpiredError on any failure.

    Not: this verifies Yeria user JWTs only -- it is distinct from YeriaSigner
    (signs), YeriaEnvelopeVerifier (verifies provider view envelopes) and
    YeriaPublicKeys (which only resolves keys).
    """

    @staticmethod
    def verify_yeria_token(
        jwt_token: str,
        yeria_public_key: str,
        expected_audience: Optional[Any] = None,
    ) -> YeriaTokenClaims:
        """Verify a Yeria user JWT against a PEM you supply; returns the claims."""
        if not isinstance(jwt_token, str) or not jwt_token:
            raise SignatureVerificationError("yeria", "missing jwt")

        parts = jwt_token.split(".")
        if len(parts) != 3 or not all(parts):
            raise SignatureVerificationError("yeria", "malformed jwt")
        header_b64, payload_b64, signature_b64 = parts

        try:
            header = json.loads(_b64url_decode(header_b64).decode("utf-8"))
            claims_raw = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        except Exception:
            raise SignatureVerificationError("yeria", "invalid base64 / json")

        if header.get("alg") != "RS256":
            raise SignatureVerificationError("yeria", f"unsupported alg: {_render(header.get('alg'))}")

        signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
        public_key_obj = serialization.load_pem_public_key(yeria_public_key.encode(), backend=default_backend())
        try:
            public_key_obj.verify(_b64url_decode(signature_b64), signing_input, padding.PKCS1v15(), SHA256())
        except Exception:
            raise SignatureVerificationError("yeria", "signature mismatch")

        if claims_raw.get("iss") != "yeria":
            raise SignatureVerificationError("yeria", f"unexpected issuer: {_render(claims_raw.get('iss'))}")
        if expected_audience is not None and claims_raw.get("aud") != str(expected_audience):
            raise SignatureVerificationError(
                "yeria",
                f"audience mismatch: token aud={_render(claims_raw.get('aud'))}, "
                f"expected={expected_audience}",
            )

        now_sec = int(time.time())
        exp = claims_raw.get("exp")
        if not isinstance(exp, int) or exp <= now_sec:
            raise ViewExpiredError("user-token", (now_sec - (exp or 0)) * 1000, 0)

        return YeriaTokenClaims(
            sub=str(claims_raw.get("sub", "")),
            aud=str(claims_raw.get("aud", "")),
            iss=str(claims_raw.get("iss", "")),
            exp=int(exp),
            iat=int(claims_raw["iat"]) if "iat" in claims_raw else None,
            kid=str(header["kid"]) if isinstance(header.get("kid"), str) else None,
        )

    @staticmethod
    def verify_yeria_token_with_resolver(
        jwt_token: str,
        resolver: PublicKeyResolver,
        expected_audience: Optional[Any] = None,
    ) -> YeriaTokenClaims:
        """Verify a Yeria user JWT, resolving the key from its ``kid`` header via ``resolver``."""
        if not isinstance(jwt_token, str) or not jwt_token:
            raise SignatureVerificationError("yeria", "missing jwt")

        parts = jwt_token.split(".")
        if len(parts) != 3 or not all(parts):
            raise SignatureVerificationError("yeria", "malformed jwt")

        try:
            header = json.loads(_b64url_decode(parts[0]).decode("utf-8"))
        except Exception:
            raise SignatureVerificationError("yeria", "invalid header")

        kid = header.get("kid")
        if not isinstance(kid, str) or not kid:
            raise SignatureVerificationError("yeria", "jwt header missing kid")

        pem = resolver(kid)
        if not pem:
            raise SignatureVerificationError("yeria", f"no trusted key for kid={kid}")

        return YeriaUserTokenVerifier.verify_yeria_token(jwt_token, pem, expected_audience)
