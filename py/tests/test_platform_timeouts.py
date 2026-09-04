"""Les deux appels plateforme qui ignoraient le delai configure le prennent
desormais, comme send_notification ; un `timeout` par appel prime.
Miroir de js/tests/platform-timeout.test.ts."""

import base64
import json

import requests

from yeriasdk.core.platform.yeria_platform import YeriaPlatform
from yeriasdk.core.security.yeria_signer import YeriaSigner
from yeriasdk.core.yeria_app import YeriaApp, YeriaAppConfig


class _Res:
    status_code = 200

    def json(self):
        return {"result": {"public_key": "PEM", "key_id": "k", "user_id": "u"}}


def _token(aud):
    def b64(s):
        return base64.urlsafe_b64encode(s.encode()).decode().rstrip("=")
    return f'{b64("{}")}.{b64(json.dumps({"aud": aud}))}.sig'


def _capture(monkeypatch):
    seen = {}

    def fake_get(url, **kw):
        seen["get"] = kw.get("timeout")
        return _Res()

    def fake_post(url, **kw):
        seen["post"] = kw.get("timeout")
        return _Res()

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(requests, "post", fake_post)
    return seen


def test_the_configured_timeout_reaches_both_calls(monkeypatch):
    seen = _capture(monkeypatch)
    platform = YeriaPlatform(app_id="p", signer=YeriaSigner(),
                             base_url="https://yeria.test", notification_timeout=9)
    platform.get_yeria_public_key()
    platform.fetch_user_details(_token("svc"))
    assert seen == {"get": 9, "post": 9}


def test_a_per_call_timeout_wins_over_the_configured_one(monkeypatch):
    seen = _capture(monkeypatch)
    platform = YeriaPlatform(app_id="p", signer=YeriaSigner(),
                             base_url="https://yeria.test", notification_timeout=9)
    platform.get_yeria_public_key(timeout=2)
    platform.fetch_user_details(_token("svc"), timeout=3)
    assert seen == {"get": 2, "post": 3}


def test_the_app_config_timeout_reaches_fetch_user_details(monkeypatch):
    seen = _capture(monkeypatch)
    app = YeriaApp(YeriaAppConfig(app_id="p", base_url="https://yeria.test",
                                  notification_timeout=7))
    app.fetch_user_details(_token("svc"))
    assert seen["post"] == 7
