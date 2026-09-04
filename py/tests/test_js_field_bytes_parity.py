"""
Parité d'octets au niveau du champ, ordre des clefs compris.

Les goldens structurels (test_js_structural_parity.py) trient les clefs : ils
attrapent une clef manquante ou en trop, jamais un ordre différent. Or c'est
précisément l'ordre dont dépend la signature, prise sur le JSON compact. Un
champ isolé ne porte aucune métadonnée volatile, son JSON compact se compare
donc tel quel entre les deux SDK.

Les octets de référence sont produits par le SDK JS construit, dans
`fieldBytes` du vecteur golden — voir js/scripts/gen-parity-vector.js. Garder
les appels ci-dessous alignés sur ceux du générateur, et régénérer le vecteur
avec `npm run gen:parity-vector` après toute modification d'un builder.
"""

import json
import os

import pytest

from yeriasdk import YeriaUI
from yeriasdk.utils.signing_json import dumps_for_signing
from yeriasdk.types import (
    ActionConfirm, ActionRef, CardAction, CardImage, CarouselSlide, GeoPoint,
    HeatmapPoint, MapControls, MapLayer, MapMarker, MapPickConfig, MapShape,
    MapShapeStyle, MapViewport, MarkerPopup, MediaItem, MediaSource,
)

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "js_parity_vector.json")


@pytest.fixture(scope="module")
def golden():
    with open(FIXTURE) as fh:
        return json.load(fh)["fieldBytes"]


def _compact_field(form, field_type):
    # Le serialiseur du signer lui-meme : ce sont les octets reellement signes
    # qu'on compare, pas une representation approchante. `json.dumps` ecrirait
    # `1.0` la ou JS ecrit `1`, et echapperait les accents.
    field = next(
        f for f in form.to_json()["content"]["fields"] if f["fieldType"] == field_type
    )
    return dumps_for_signing(field)


def _build(name):
    if name == "date-bounded":
        form = YeriaUI.create_form_view("d", "D")
        form.add_date_field("birth", "Birth", True, "1900-01-01", "2010-12-31")
        return _compact_field(form, "date")
    if name == "date-min-only":
        form = YeriaUI.create_form_view("d", "D")
        form.add_date_field("from", "From", False, "2020-01-01")
        return _compact_field(form, "date")
    if name == "date-max-only":
        form = YeriaUI.create_form_view("d", "D")
        form.add_date_field("until", "Until", False, None, "2030-12-31")
        return _compact_field(form, "date")
    if name == "date-unbounded":
        form = YeriaUI.create_form_view("d", "D")
        form.add_date_field("day", "Day")
        return _compact_field(form, "date")
    if name == "gps-full":
        form = YeriaUI.create_form_view("g", "G")
        form.add_gps_field("loc", "Loc", True, False,
                           altitude=True, max_accuracy=25, precision=True)
        return _compact_field(form, "gps")
    if name == "gps-plain":
        form = YeriaUI.create_form_view("g", "G")
        form.add_gps_field("loc", "Loc")
        return _compact_field(form, "gps")
    if name == "photo":
        form = YeriaUI.create_form_view("p", "P")
        form.add_photo_field("img", "Img", False, ["jpeg"], False,
                             multiple=True, max_count=3, source="record")
        return _compact_field(form, "photo")
    if name == "file":
        form = YeriaUI.create_form_view("p", "P")
        form.add_file_field("doc", "Doc", False, ["application/pdf"],
                            multiple=True, max_count=2)
        return _compact_field(form, "file")
    if name == "audio":
        form = YeriaUI.create_form_view("a", "A")
        form.add_audio_field("m", "M", False, max_duration=30, min_duration=2,
                             source="record", max_size=1000)
        return _compact_field(form, "audio")
    if name == "video":
        form = YeriaUI.create_form_view("v", "V")
        form.add_video_field("c", "C", False, max_duration=60, source="record",
                             quality="high", max_size=5000)
        return _compact_field(form, "video")
    if name == "late-value":
        form = YeriaUI.create_form_view("f", "F")
        form.add_text_field("name", "Name", True)
        form.set_field_value("name", "Ada")
        return _compact_field(form, "text")
    if name == "media-value-cleared":
        form = YeriaUI.create_form_view("p", "P")
        form.add_photo_field("img", "Img", False)
        form.set_field_value("img", "a.jpg")
        form.set_field_value("img", None)
        return _compact_field(form, "photo")
    if name == "gps-floats":
        form = YeriaUI.create_form_view("g", "G")
        form.add_gps_field("loc", "Coordonnées à ±5 m", False, False,
                           max_accuracy=5.0, precision=True)
        return _compact_field(form, "gps")
    if name == "email-pattern":
        form = YeriaUI.create_form_view("e", "E")
        form.add_email_field("m", "M", True)
        return _compact_field(form, "email")
    if name == "photo-stored":
        form = YeriaUI.create_form_view("p", "P")
        form.add_photo_field("img", "Img", False, ["jpeg"], False,
                             multiple=True, value=["a.jpg", "b.jpg"], readonly=True)
        return _compact_field(form, "photo")
    if name == "video-stored":
        form = YeriaUI.create_form_view("v", "V")
        form.add_video_field("c", "C", False, max_duration=60,
                             value="c.mp4", readonly=True)
        return _compact_field(form, "video")
    raise AssertionError(f"cas inconnu : {name}")


CASES = [
    "date-bounded", "date-min-only", "date-max-only", "date-unbounded",
    "gps-full", "gps-plain", "photo", "file", "audio", "video", "late-value",
    "media-value-cleared", "gps-floats", "email-pattern", "photo-stored",
    "video-stored",
]


@pytest.mark.parametrize("name", CASES)
def test_field_bytes_match_js(golden, name):
    assert _build(name) == golden[name]


def test_every_golden_case_is_covered(golden):
    """Un cas ajouté au générateur JS sans contrepartie ici passerait inaperçu."""
    assert sorted(golden) == sorted(CASES)


# ── Parites d'octets hors formulaire ────────────────────────────────────
#
# Les autres constructeurs de vues etalaient eux aussi l'objet de l'appelant
# dans un contenu signe. Chaque objet ci-dessous est ecrit dans un ordre qui
# n'est PAS l'ordre d'emission, si bien qu'un retour a l'etalement changerait
# les octets. Garder ces appels alignes sur ceux du generateur JS.

@pytest.fixture(scope="module")
def part_golden():
    with open(FIXTURE) as fh:
        return json.load(fh)["partBytes"]


def _compact(value):
    return dumps_for_signing(value)


def _build_part(name):
    if name == "timeline-item":
        view = YeriaUI.create_timeline_view("t", "T")
        view.add_event("a", "A", "2026-01-01", status="completed", icon="check")
        return _compact(view.to_json()["content"]["items"][0])
    if name == "media-item":
        view = YeriaUI.create_media_view("m", "M")
        view.add_media_item(MediaItem(
            id="a", kind="audio", poster="p.jpg", loop=True, controls=False,
            sources=[MediaSource(src="/s.mp3", type="audio/mpeg")],
        ))
        return _compact(view.to_json()["content"]["items"][0])
    if name == "media-item-bare":
        view = YeriaUI.create_media_view("m", "M")
        view.add_media_item(MediaItem(
            id="a", kind="audio",
            sources=[MediaSource(src="/s.mp3", type="audio/mpeg")],
        ))
        return _compact(view.to_json()["content"]["items"][0])
    if name == "media-item-created":
        view = YeriaUI.create_media_view("m", "M")
        view.add_media_item(view.create_media(
            "a", "video", "/v.mp4", poster="p.jpg", loop=True, type="video/mp4",
        ))
        return _compact(view.to_json()["content"]["items"][0])
    if name == "carousel-settings":
        view = YeriaUI.create_carousel_view("c", "C")
        view.add_slide({"id": "s", "title": "S"})
        view.set_settings({"autoplay": True, "loop": False, "showIndicators": False})
        return _compact(view.to_json()["content"]["settings"])
    if name == "map-layer":
        view = YeriaUI.create_map_view("m", "M")
        view.add_layer(MapLayer(
            id="stores", type="markers", name="Stores", toggleable=True, z_index=2,
            markers=[MapMarker(id="a", location=GeoPoint(lat=1, lon=2), color="#fff")],
            cluster=False,
        ))
        return _compact(view.to_json()["content"]["layers"][0])
    if name == "map-heatmap":
        view = YeriaUI.create_map_view("m", "M")
        view.add_layer(MapLayer(
            id="h", type="heatmap", points=[HeatmapPoint(lat=1, lon=1, intensity=0.5)],
            radius=30, color_ramp=["#000", "#fff"],
        ))
        return _compact(view.to_json()["content"]["layers"][0])
    if name == "map-marker":
        view = YeriaUI.create_map_view("m", "M")
        view.add_marker(MapMarker(
            id="a", location=GeoPoint(lat=1, lon=2, precision=5), title=" A ",
            selected=True, meta={"k": 1},
            action=ActionRef(url="/act", confirm=ActionConfirm(title="T", message="M")),
            popup=MarkerPopup(title="P", actions=[ActionRef(url="/go", method="POST")]),
        ))
        return _compact(view.to_json()["content"]["layers"][0]["markers"][0])
    if name == "map-shape":
        view = YeriaUI.create_map_view("m", "M")
        view.add_shape(MapShape(
            id="z", type="Polygon",
            points=[GeoPoint(lat=0, lon=0), GeoPoint(lat=0, lon=1), GeoPoint(lat=1, lon=1)],
            config=MapShapeStyle(fill_color="#fff", stroke_color="#000"),
            action=ActionRef(url="/s"),
        ))
        return _compact(view.to_json()["content"]["layers"][0]["shapes"][0])
    if name == "map-viewport":
        view = YeriaUI.create_map_view("m", "M")
        view.set_empty_message("-")
        view.set_viewport(MapViewport(center=GeoPoint(lat=1, lon=2), zoom=12, bearing=90, pitch=10))
        return _compact(view.to_json()["content"]["viewport"])
    if name == "map-controls":
        view = YeriaUI.create_map_view("m", "M")
        view.set_empty_message("-")
        view.set_controls(MapControls(zoom=False, scale=True, attribution="X"))
        return _compact(view.to_json()["content"]["controls"])
    if name == "carousel-bare":
        view = YeriaUI.create_carousel_view("c", "C")
        view.add_slide({"id": "s", "title": "S"})
        return _compact(view.to_json()["content"])
    if name == "carousel-slide":
        view = YeriaUI.create_carousel_view("c", "C")
        view.add_slide(CarouselSlide(
            id="s", title=" S ", description="D", badge="New",
            image=CardImage(url="/i.jpg", alt="A"),
            actions=[CardAction(text="Go", method="GET", href="/x", variant="primary")],
            meta={"k": 1},
        ))
        return _compact(view.to_json()["content"]["slides"][0])
    if name == "map-pick":
        view = YeriaUI.create_map_view("m", "M")
        view.set_pick_mode(MapPickConfig(
            submit_url="/submit", prompt="Pick", submit_method="POST",
            submit_label="Go", snap_to_markers=True,
        ))
        return _compact(view.to_json()["content"]["pick"])
    raise AssertionError(f"cas inconnu : {name}")


PART_CASES = [
    "timeline-item", "media-item", "media-item-bare", "media-item-created",
    "carousel-settings", "carousel-bare", "carousel-slide", "map-pick", "map-layer", "map-heatmap",
    "map-marker", "map-shape", "map-viewport", "map-controls",
]


@pytest.mark.parametrize("name", PART_CASES)
def test_part_bytes_match_js(part_golden, name):
    assert _build_part(name) == part_golden[name]


def test_every_part_case_is_covered(part_golden):
    assert sorted(part_golden) == sorted(PART_CASES)
