"""
Tests for intro field support across all views
"""

import pytest
from yeriasdk import YeriaApp, YeriaAppConfig
from yeriasdk.errors import InvalidParameterError
from yeriasdk.views import (
    ActionListView,
    ActionGridView,
    CardView,
    CarouselView,
    FormView,
    IconGridView,
    MapView,
    ReaderView,
    QRDisplayView,
    QRScanView,
    MessageView,
    TimelineView,
    MediaView,
)


class TestIntroFields:
    """Test intro field support across views"""

    def test_action_list_view_intro(self):
        """Test ActionListView intro support"""
        view = ActionListView("test-list", "Test List")
        view.set_intro("Select an option")
        assert view.content["intro"] == "Select an option"

    def test_action_grid_view_intro(self):
        """Test ActionGridView intro support"""
        view = ActionGridView("test-grid", "Test Grid")
        view.set_intro("Choose an action")
        assert view.content["intro"] == "Choose an action"

    def test_map_view_intro(self):
        """Test MapView intro support"""
        view = MapView("test-map", "Test Map")
        view.set_intro("Find locations on the map")
        assert view.content["intro"] == "Find locations on the map"

    def test_reader_view_intro(self):
        """Test ReaderView intro support"""
        view = ReaderView("test-reader", "Test Reader")
        view.set_intro("Read the content below")
        assert view.content["intro"] == "Read the content below"

    def test_qr_scan_view_intro(self):
        """Test QRScanView intro support"""
        view = QRScanView("test-scan", "Test Scanner")
        view.set_intro("Point camera at QR code")
        assert view.content["intro"] == "Point camera at QR code"

    def test_message_view_intro(self):
        """Test MessageView intro support"""
        view = MessageView("test-msg", "Test Message")
        view.set_intro("Welcome message")
        assert view.content["intro"] == "Welcome message"

    def test_timeline_view_intro(self):
        """Test TimelineView intro support"""
        view = TimelineView("test-timeline", "Test Timeline")
        view.set_intro("View your timeline")
        assert view.content["intro"] == "View your timeline"

    def test_media_view_intro(self):
        """Test MediaView intro support"""
        view = MediaView("test-media", "Test Media")
        view.set_intro("Browse media")
        assert view.content["intro"] == "Browse media"




class TestHeaderTextContract:
    """Un texte d'en-tete se pose ou n'existe pas.

    Emettre `"intro": ""` faisait reserver au renderer mobile la bande d'une
    ligne absente (mesure sur ReaderView : premier element a 135 px au lieu de
    84 px). Les deux regles ci-dessous suppriment la cause a la source.
    """

    # (constructeur, nom du setter, cle de contenu)
    SETTERS = [
        (lambda: ActionListView("v", "T"), "set_intro", "intro"),
        (lambda: ActionGridView("v", "T"), "set_intro", "intro"),
        (lambda: MapView("v", "T"), "set_intro", "intro"),
        (lambda: ReaderView("v", "T"), "set_intro", "intro"),
        (lambda: QRScanView("v", "T"), "set_intro", "intro"),
        (lambda: QRDisplayView("v", "T", "data"), "set_intro", "intro"),
        (lambda: MessageView("v", "T"), "set_intro", "intro"),
        (lambda: TimelineView("v", "T"), "set_intro", "intro"),
        (lambda: MediaView("v", "T"), "set_intro", "intro"),
        (lambda: IconGridView("v", "T"), "set_intro", "intro"),
        (lambda: FormView("v", "T"), "set_intro", "intro"),
        (lambda: CarouselView("v", "T"), "set_intro", "intro"),
        (lambda: CardView("v", "T"), "set_intro", "intro"),
        (lambda: CarouselView("v", "T"), "set_subtitle", "intro"),
        (lambda: CardView("v", "T"), "set_subtitle", "intro"),
        (lambda: CardView("v", "T"), "set_description", "description"),
        (lambda: CardView("v", "T"), "set_stats_heading", "statsHeading"),
    ]

    @pytest.mark.parametrize("make,setter,key", SETTERS)
    def test_key_absent_until_set(self, make, setter, key):
        assert key not in make().content

    @pytest.mark.parametrize("make,setter,key", SETTERS)
    def test_refuses_blank(self, make, setter, key):
        # CardView divergeait : il stockait '' sans broncher.
        for blank in ("", "   "):
            with pytest.raises(InvalidParameterError):
                getattr(make(), setter)(blank)

    @pytest.mark.parametrize("make,setter,key", SETTERS)
    def test_trims(self, make, setter, key):
        view = make()
        getattr(view, setter)("  texte  ")
        assert view.content[key] == "texte"


class TestSubtitleAlias:
    """Le nom historique reste interchangeable.

    Sans cela, les fournisseurs qui appellent set_subtitle verraient leur
    ligne disparaitre du rendu.
    """

    def test_card_alias_matches_set_intro(self):
        # Card exige une description, une stat ou une section pour etre valide.
        by_subtitle = CardView("c", "T").set_subtitle("Ligne de contexte").add_stat("a", "1")
        by_intro = CardView("c", "T").set_intro("Ligne de contexte").add_stat("a", "1")
        assert by_subtitle.content == by_intro.content

    def test_carousel_alias_matches_set_intro(self):
        slide = {"id": "s", "title": "Slide"}
        by_subtitle = CarouselView("c", "T").set_subtitle("Ligne de contexte").add_slide(slide)
        by_intro = CarouselView("c", "T").set_intro("Ligne de contexte").add_slide(slide)
        assert by_subtitle.content == by_intro.content

    def test_no_subtitle_key_is_emitted(self):
        for view in (CardView("c", "T"), CarouselView("c", "T")):
            view.set_subtitle("x")
            assert "subtitle" not in view.content
            assert view.content["intro"] == "x"
