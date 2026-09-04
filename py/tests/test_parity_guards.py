"""
Garde-fous de parite reperes par la revue comparative JS/Python.

Chaque cas ci-dessous corrige un endroit ou les deux SDK refusaient — ou
acceptaient — des choses differentes. Les octets eux-memes sont couverts par
test_js_field_bytes_parity.py ; ici on verifie les REGLES.
"""

import pytest

from yeriasdk import YeriaUI
from yeriasdk.errors.exceptions import FieldValidationError
from yeriasdk.utils.validators import DataSanitizer
from yeriasdk.views import FormView


class TestUrlScheme:
    """Une URL que le client peut etre amene a ouvrir : http/https, rien d'autre.

    La regle etait implicite (un schema et une localisation reseau) et le SDK
    JS se contentait de `new URL(...)`, qui accepte `javascript:`.
    """

    @pytest.mark.parametrize("url", ["https://a.test/x", "http://a.test"])
    def test_accepts_http_and_https(self, url):
        assert DataSanitizer.validate_url(url) is True

    @pytest.mark.parametrize("url", [
        "javascript:alert(1)", "vbscript:msgbox", "data:text/html,x",
        "file:///etc/passwd", "ftp://h/x", "mailto:a@b.c",
        "/relative", "https://", "not-a-url",
    ])
    def test_refuses_everything_else(self, url):
        assert DataSanitizer.validate_url(url) is False


class TestNumberIsFinite:
    """Un nombre est fini, et un booleen n'est pas un nombre.

    ``inf`` passait : ``json.dumps`` l'ecrit ``Infinity``, que JSON n'admet pas
    et qu'aucun client ne peut relire. ``True`` passait aussi, ``bool`` etant
    une sous-classe de ``int``.
    """

    @pytest.mark.parametrize("value", [1, 0, -1, 1.5])
    def test_accepts_finite_numbers(self, value):
        assert DataSanitizer.validate_number(value) is True

    @pytest.mark.parametrize("value", [
        float("inf"), float("-inf"), float("nan"), True, False, "5", None,
    ])
    def test_refuses_the_rest(self, value):
        assert DataSanitizer.validate_number(value) is False

    def test_an_infinite_duration_is_refused_on_a_recording_field(self):
        form = YeriaUI.create_form_view("a", "A")
        with pytest.raises(FieldValidationError):
            form.add_audio_field("m", "M", False, max_duration=float("inf"))


class TestStoredMediaPathIsRelative:
    """Un chemin de media est relatif a la base du service.

    Le renderer refuse l'absolu en n'affichant RIEN ; le SDK ne disait rien du
    tout, si bien que le fournisseur decouvrait la regle devant un champ vide.
    """

    @pytest.mark.parametrize("path", ["api/media/a.jpg", "/api/media/a.jpg", "a.jpg"])
    def test_accepts_a_relative_path(self, path):
        form = YeriaUI.create_form_view("p", "P")
        form.add_photo_field("img", "Img", False, ["jpeg"], False, value=path)

    @pytest.mark.parametrize("path", [
        "https://cdn.test/a.jpg", "http://cdn.test/a.jpg", "//cdn.test/a.jpg",
        "file:///x", "data:image/png;base64,AA",
        # WHATWG lit un antislash comme un slash : absolus dans un navigateur.
        "\\\\cdn.test/a.jpg", "https:\\\\cdn.test\\\\a.jpg", "/\\\\cdn.test/a.jpg",
        # N'importe quel schema, pas une liste.
        "javascript:alert(1)", "mailto:x@y.test", "blob:https://x",
        # WHATWG les retire avant d'analyser ; un navigateur voit un absolu.
        "\x01https://cdn.test/a.jpg", "ht\ntps://cdn.test/a.jpg", "\thttps://cdn.test/a.jpg",
        "\x00https://cdn.test/a.jpg", "\x01//cdn.test/a.jpg",
    ])
    def test_refuses_an_absolute_path(self, path):
        form = YeriaUI.create_form_view("p", "P")
        with pytest.raises(FieldValidationError):
            form.add_photo_field("img", "Img", False, ["jpeg"], False, value=path)

    def test_refuses_an_absolute_path_set_after_the_fact(self):
        form = YeriaUI.create_form_view("f", "F")
        form.add_photo_field("p", "P", False)

        with pytest.raises(FieldValidationError, match="relative to the service base"):
            form.set_field_value("p", "https://cdn.test/a.jpg")
        with pytest.raises(FieldValidationError, match="relative to the service base"):
            form.update_field("p", {"value": "data:image/png;base64,AAAA"})
        with pytest.raises(FieldValidationError, match="relative to the service base"):
            form.update_field("p", {"value": ["a.jpg", "//host/b.jpg"]})

        errors = form.inject_data({"p": "file:///etc/a.jpg"})
        assert errors and "relative to the service base" in errors[0]
        assert "value" not in form.to_json()["content"]["fields"][0]

        form.set_field_value("p", "a.jpg")
        assert form.to_json()["content"]["fields"][0]["value"] == "a.jpg"

    def test_refuses_an_absolute_path_written_onto_the_dict_get_field_returned(self):
        form = YeriaUI.create_form_view("f", "F")
        form.add_photo_field("p", "P", False)
        form.get_field("p")["value"] = "https://cdn.test/a.jpg"
        with pytest.raises(FieldValidationError, match="relative to the service base"):
            form.to_json()

        other = YeriaUI.create_form_view("f", "F")
        other.add_photo_field("p", "P", False)
        other.get_fields()[0]["value"] = ["a.jpg", "data:image/png;base64,AAAA"]
        with pytest.raises(FieldValidationError, match="relative to the service base"):
            other.to_json()

    def test_a_value_cleared_with_none_is_a_value_removed(self):
        form = YeriaUI.create_form_view("f", "F")
        form.add_photo_field("p", "P", False)
        form.set_field_value("p", "a.jpg")
        form.set_field_value("p", None)
        assert "value" not in form.to_json()["content"]["fields"][0]

    def test_refuses_an_absolute_path_inside_a_list(self):
        form = YeriaUI.create_form_view("p", "P")
        with pytest.raises(FieldValidationError):
            form.add_photo_field("img", "Img", False, ["jpeg"], False,
                                 multiple=True, value=["a.jpg", "https://cdn.test/b.jpg"])


class TestMediaFieldsAcceptStoredFiles:
    """``value`` / ``readonly`` / ``disabled` sur les quatre champs media.

    La fonctionnalite 1.3.2 « Media fields accept a stored file » n'existait
    que dans le SDK JS : les methodes Python n'avaient aucun de ces trois
    parametres.
    """

    @staticmethod
    def _field(form, field_type):
        return next(f for f in form.to_json()["content"]["fields"]
                    if f["fieldType"] == field_type)

    def test_photo(self):
        form = FormView("p", "P")
        form.add_photo_field("img", "Img", False, ["jpeg"], False,
                             value="a.jpg", readonly=True, disabled=False)
        field = self._field(form, "photo")
        assert field["value"] == "a.jpg"
        assert field["readonly"] is True
        assert field["disabled"] is False

    def test_file(self):
        form = FormView("p", "P")
        form.add_file_field("doc", "Doc", False, ["application/pdf"],
                            value="d.pdf", readonly=True)
        field = self._field(form, "file")
        assert field["value"] == "d.pdf"
        assert field["readonly"] is True

    def test_audio(self):
        form = FormView("a", "A")
        form.add_audio_field("m", "M", False, max_duration=30,
                             value="s.m4a", readonly=True)
        field = self._field(form, "audio")
        assert field["value"] == "s.m4a"
        assert field["readonly"] is True

    def test_video(self):
        form = FormView("v", "V")
        form.add_video_field("c", "C", False, max_duration=60,
                             value="c.mp4", readonly=True)
        field = self._field(form, "video")
        assert field["value"] == "c.mp4"
        assert field["readonly"] is True


class TestPatternTravelsAsSource:
    """Un motif compile n'a pas de representation JSON : sa source voyage."""

    def test_an_email_field_carries_the_regex_source(self):
        form = YeriaUI.create_form_view("f", "F")
        form.add_email_field("m", "M", True)
        field = form.to_json()["content"]["fields"][0]
        assert field["pattern"] == r"^[^\s@]+@[^\s@]+\.[^\s@]+$"

    def test_a_pattern_set_after_the_fact_travels_the_same_way(self):
        import re

        form = YeriaUI.create_form_view("f", "F")
        form.add_email_field("m", "M", True)
        form.update_field("m", {"pattern": re.compile(r"^x$")})
        field = form.to_json()["content"]["fields"][0]
        assert field["pattern"] == "^x$"


class TestNoInventedDefaults:
    """Un defaut documente appartient au client, pas a la charge utile."""

    def test_a_bare_media_item_carries_no_controls_key(self):
        from yeriasdk.types import MediaItem, MediaSource

        view = YeriaUI.create_media_view("m", "M")
        view.add_media_item(MediaItem(
            id="a", kind="audio",
            sources=[MediaSource(src="/s.mp3", type="audio/mpeg")],
        ))
        assert "controls" not in view.to_json()["content"]["items"][0]

    def test_an_item_built_through_create_media_carries_no_controls_key_either(self):
        view = YeriaUI.create_media_view("m", "M")
        view.add_media_item(view.create_media("a", "audio", "/s.mp3"))
        item = view.to_json()["content"]["items"][0]
        assert "controls" not in item
        assert item["sources"] == [{"src": "/s.mp3"}]

    def test_a_bare_carousel_carries_no_settings_key(self):
        view = YeriaUI.create_carousel_view("c", "C")
        view.add_slide({"id": "s", "title": "S"})
        assert "settings" not in view.to_json()["content"]

        view.set_settings({})
        assert "settings" not in view.to_json()["content"]

    def test_carousel_settings_carry_only_what_was_set(self):
        view = YeriaUI.create_carousel_view("c", "C")
        view.add_slide({"id": "s", "title": "S"})
        view.set_settings({"loop": False})

        assert view.to_json()["content"]["settings"] == {"loop": False}


class TestDictSlideTakesTheDataclassRoad:
    """Un slide ecrit en dict perdait `actions` et `meta` : sa branche
    s'arretait a `image`. Memes octets que le dataclass desormais."""

    def test_a_dict_slide_emits_the_same_bytes_as_the_dataclass(self):
        import json
        from yeriasdk.types import CardAction, CardImage, CarouselSlide

        a = YeriaUI.create_carousel_view("c", "C")
        b = YeriaUI.create_carousel_view("c", "C")
        a.add_slide({
            "meta": {"k": 1},
            "actions": [{"variant": "primary", "text": "Go", "href": "/x", "method": "GET"}],
            "image": {"alt": "A", "url": "/i.jpg"}, "badge": "New",
            "title": " S ", "id": "s", "description": "D",
        })
        b.add_slide(CarouselSlide(
            id="s", title=" S ", description="D", badge="New",
            image=CardImage(url="/i.jpg", alt="A"),
            actions=[CardAction(text="Go", method="GET", href="/x", variant="primary")],
            meta={"k": 1},
        ))
        assert json.dumps(a.to_json()["content"]["slides"][0]) \
            == json.dumps(b.to_json()["content"]["slides"][0])


class TestSigningBytesAreJavaScriptBytes:
    """Une chaine JS est en UTF-16, une chaine Python en points de code ; un
    entier JS s'arrete a 2^53-1. Le backend reconstruit la charge utile d'une
    notification avec `JSON.stringify` avant de verifier : les octets doivent
    etre les memes des deux cotes."""

    def test_a_hand_written_surrogate_pair_becomes_its_astral_character(self):
        from yeriasdk.utils.signing_json import dumps_for_signing

        paired = chr(0xD83D) + chr(0xDE00)  # un seul caractere pour JS
        assert dumps_for_signing({"s": paired}) == dumps_for_signing({"s": "\U0001F600"})
        # Et surtout : la charge utile s'encode, donc elle peut etre signee.
        assert dumps_for_signing({"s": paired}).encode("utf-8").hex() == "7b2273223a22f09f9880227d"

    def test_a_lone_surrogate_stays_escaped(self):
        from yeriasdk.utils.signing_json import dumps_for_signing

        assert dumps_for_signing({"s": "x" + chr(0xD800) + "y"}) == '{"s":"x\\ud800y"}'

    def test_accents_travel_as_themselves_not_as_escapes(self):
        from yeriasdk.utils.signing_json import dumps_for_signing

        assert dumps_for_signing({"t": "Réservation confirmée"}) == '{"t":"Réservation confirmée"}'

    @pytest.mark.parametrize("value,expected", [
        (1.0, "1"), (1e-7, "1e-7"), (1e-6, "0.000001"), (1e21, "1e+21"),
        (1e20, "100000000000000000000"), (-0.0, "0"), (6.1319, "6.1319"),
    ])
    def test_numbers_are_written_the_javascript_way(self, value, expected):
        from yeriasdk.utils.signing_json import dumps_for_signing

        assert dumps_for_signing({"n": value}) == '{"n":%s}' % expected

    def test_integer_like_keys_come_first_as_a_javascript_object_emits_them(self):
        from yeriasdk.utils.signing_json import dumps_for_signing

        assert dumps_for_signing({"b": 1, "8": 2, "a": 3, "2": 4}) == '{"2":4,"8":2,"b":1,"a":3}'

    def test_an_integer_javascript_cannot_represent_is_refused(self):
        from yeriasdk.errors.exceptions import InvalidParameterError
        from yeriasdk.utils.signing_json import dumps_for_signing

        # `JSON.parse` arrondirait 2^53+1 : le backend reverifierait d'autres
        # octets que ceux signes.
        with pytest.raises(InvalidParameterError, match="safe range"):
            dumps_for_signing({"n": 2**53 + 1})
        with pytest.raises(InvalidParameterError, match="safe range"):
            dumps_for_signing({"n": 10**400})
        assert dumps_for_signing({"n": 2**53 - 1}) == '{"n":9007199254740991}'
        # Exactement representable : JS l'ecrit, donc nous aussi — a sa maniere.
        assert dumps_for_signing({"n": 10**20}) == '{"n":100000000000000000000}'
        assert dumps_for_signing({"n": 2**60}) == '{"n":1152921504606847000}'


class TestNoPayloadCarriesANonFiniteNumber:
    """Filet sous tous les constructeurs : `json.dumps` ecrirait `NaN`."""

    def test_a_nan_carousel_interval_is_refused_when_the_view_is_built(self):
        from yeriasdk.errors.exceptions import ViewValidationError

        view = YeriaUI.create_carousel_view("c", "C")
        view.add_slide({"id": "s", "title": "S"})
        view.set_settings({"intervalMs": float("nan")})
        with pytest.raises(ViewValidationError, match=r"non-finite number at content\.settings\.intervalMs"):
            view.to_json()

    def test_a_nan_in_view_state_is_refused_too(self):
        from yeriasdk.errors.exceptions import ViewValidationError

        form = YeriaUI.create_form_view("f", "F")
        form.add_text_field("t", "T", True)
        form.set_state("score", float("nan"))
        with pytest.raises(ViewValidationError, match=r"non-finite number at state\.score"):
            form.to_json()

    def test_a_non_finite_number_inside_an_opaque_map_field_is_refused_when_the_view_is_built(self):
        from yeriasdk.errors.exceptions import ViewValidationError
        from yeriasdk.types import ActionRef, GeoPoint, MapMarker, MapShape

        view = YeriaUI.create_map_view("m", "M")
        view.add_marker(MapMarker(id="a", location=GeoPoint(lat=1, lon=2), meta={"score": float("nan")}))
        with pytest.raises(ViewValidationError, match=r"content\.layers\[0\]\.markers\[0\]\.meta\.score"):
            view.to_json()

        other = YeriaUI.create_map_view("m", "M")
        other.add_shape(MapShape(id="c", type="Circle", center=GeoPoint(lat=1, lon=2), radius=5,
                                 action=ActionRef(url="/a", body={"weight": float("inf")})))
        with pytest.raises(ViewValidationError, match=r"content\.layers\[0\]\.shapes\[0\]\.action\.body\.weight"):
            other.to_json()

    def test_the_signer_refuses_a_raw_view_carrying_a_non_finite_number(self):
        from yeriasdk.core.security.yeria_signer import YeriaSigner
        from yeriasdk.errors.exceptions import InvalidParameterError

        with pytest.raises(InvalidParameterError, match="non-finite"):
            YeriaSigner().sign_view({"id": "v", "type": "Form", "content": {"x": float("nan")}}, "app")

    def test_a_non_int_provider_error_status_falls_back_to_the_advisory_400(self):
        from yeriasdk.core.provider_error import build_provider_error

        assert build_provider_error("x.y", "m", True)["error"]["status"] == 400
        assert build_provider_error("x.y", "m", float("nan"))["error"]["status"] == 400
        assert build_provider_error("x.y", "m", 503)["error"]["status"] == 503

    def test_a_nan_max_length_set_after_the_fact_is_refused_when_the_form_is_built(self):
        from yeriasdk.errors.exceptions import ViewValidationError

        form = YeriaUI.create_form_view("f", "F")
        form.add_text_field("t", "T", False)
        form.update_field("t", {"maxLength": float("inf")})
        with pytest.raises(ViewValidationError, match=r"non-finite number at content\.fields\[0\]\.maxLength"):
            form.to_json()


class TestMapCarriesFiniteNumbersOnly:
    """`nan` passe toute comparaison de plage ; `json.dumps` l'ecrit `NaN`,
    illisible. `True` passait pour une latitude, `bool` etant un `int`."""

    @pytest.mark.parametrize("lat", [float("nan"), float("inf"), float("-inf"), True])
    def test_refuses_a_non_finite_marker_latitude(self, lat):
        from yeriasdk.errors.exceptions import InvalidGeoPointError
        from yeriasdk.types import GeoPoint, MapMarker

        view = YeriaUI.create_map_view("m", "M")
        with pytest.raises(InvalidGeoPointError, match="finite"):
            view.add_marker(MapMarker(id="a", location=GeoPoint(lat=lat, lon=2)))

    def test_refuses_a_non_finite_coordinate_inside_a_layer_handed_to_add_layer(self):
        from yeriasdk.errors.exceptions import InvalidGeoPointError, InvalidParameterError
        from yeriasdk.types import GeoPoint, HeatmapPoint, MapLayer, MapMarker

        view = YeriaUI.create_map_view("m", "M")
        with pytest.raises(InvalidGeoPointError, match="finite"):
            view.add_layer(MapLayer(id="l", type="markers",
                                    markers=[MapMarker(id="a", location=GeoPoint(lat=1, lon=float("nan")))]))
        with pytest.raises(InvalidParameterError, match="finite"):
            view.add_layer(MapLayer(id="h", type="heatmap",
                                    points=[HeatmapPoint(lat=1, lon=1, intensity=float("inf"))]))

    def test_refuses_a_non_finite_number_anywhere_inside_geojson_data(self):
        from yeriasdk.errors.exceptions import InvalidParameterError
        from yeriasdk.types import MapLayer

        view = YeriaUI.create_map_view("m", "M")
        with pytest.raises(InvalidParameterError, match="finite"):
            view.add_layer(MapLayer(id="g", type="geojson",
                                    data={"type": "Point", "coordinates": [float("nan"), 1]}))
        with pytest.raises(InvalidParameterError, match="finite"):
            view.add_layer(MapLayer(id="g", type="geojson",
                                    data={"type": "FeatureCollection", "bbox": [0, 0, float("inf"), 1],
                                          "features": []}))
        view.add_layer(MapLayer(id="g", type="geojson", data={
            "type": "Feature", "geometry": {"type": "Point", "coordinates": [1, 1]},
            "properties": {"open": True, "n": 3},
        }))

    def test_refuses_a_nan_viewport_zoom_which_every_range_check_lets_through(self):
        from yeriasdk.errors.exceptions import InvalidViewportError
        from yeriasdk.types import MapViewport

        view = YeriaUI.create_map_view("m", "M")
        with pytest.raises(InvalidViewportError, match="finite"):
            view.set_viewport(MapViewport(zoom=float("nan")))

    def test_refuses_a_nan_circle_radius_and_a_nan_stroke_width(self):
        from yeriasdk.errors.exceptions import InvalidParameterError
        from yeriasdk.types import GeoPoint, MapShapeStyle

        view = YeriaUI.create_map_view("m", "M")
        with pytest.raises(InvalidParameterError, match="finite"):
            view.add_circle("c", GeoPoint(lat=1, lon=2), float("nan"))
        with pytest.raises(InvalidParameterError, match="finite"):
            view.add_circle("c", GeoPoint(lat=1, lon=2), 5, MapShapeStyle(stroke_width=float("nan")))


class TestMapViewHasGetContent:
    """``get_content`` existait sur quatre vues Python et manquait sur MapView."""

    def test_map_view_exposes_its_content(self):
        view = YeriaUI.create_map_view("m", "M")
        assert set(view.get_content()) == {"title", "layers", "controls"}
