"""
Navigation: sequence targets (next/prev) and stack entry directive.

Mirrors js/tests/base-view.test.ts — both SDKs must refuse and emit the same
things, or a provider porting code between them gets different behaviour.
"""

import pytest
from yeriasdk.errors.exceptions import InvalidParameterError
from yeriasdk.views import FormView
from yeriasdk import YeriaUI


BARE_IDS = ["step-two", "orders_list", "view42"]


def a_form() -> FormView:
    """A form with one field — to_json() refuses an empty one."""
    view = FormView("test-form", "Test Form")
    view.add_text_field("name", "Name", True)
    return view


class TestSequenceTargets:
    """A bare token is indistinguishable from a relative path on the wire, so
    the SDK refuses it: the client has no registry of view ids and a provider
    writing one would get a silent 404 instead of an error."""

    def test_set_next_rejects_bare_view_id(self):
        view = a_form()
        for bare in BARE_IDS:
            with pytest.raises(InvalidParameterError):
                view.set_next(bare)

    def test_set_prev_rejects_bare_view_id(self):
        view = a_form()
        for bare in BARE_IDS:
            with pytest.raises(InvalidParameterError):
                view.set_prev(bare)

    def test_accepts_a_path_relative_to_the_service_base(self):
        view = a_form()
        view.set_next("/orders/page/2")
        view.set_prev("/orders/page/1")
        nav = view.to_json()["nav"]
        assert nav["next"] == "/orders/page/2"
        assert nav["prev"] == "/orders/page/1"


class TestEntry:
    def test_writes_nav_entry(self):
        view = a_form()
        view.set_entry("replace")
        assert view.to_json()["nav"]["entry"] == "replace"

    def test_key_absent_when_never_called(self):
        # The default is 'push'. Emitting it would change the signed bytes of
        # every existing view for no behavioural gain.
        view = a_form()
        view.set_next("/next")
        assert "entry" not in view.to_json()["nav"]

    def test_rejects_anything_but_push_or_replace(self):
        view = a_form()
        for value in ["root", "REPLACE", "", "pop"]:
            with pytest.raises(InvalidParameterError):
                view.set_entry(value)

    def test_survives_a_round_trip_through_from_json(self):
        view = a_form()
        view.set_entry("replace").set_next("/orders/page/2")
        rehydrated = FormView.from_json(view.to_json())
        nav = rehydrated.to_json()["nav"]
        assert nav["entry"] == "replace"
        assert nav["next"] == "/orders/page/2"


class TestSerializationOrder:
    """Le SDK JS reconstruit `nav` clé par clé pour émettre le même ordre :
    mêmes appels, mêmes octets, dans les deux langages."""

    def test_nav_keys_follow_a_fixed_order(self):
        view = a_form()
        view.set_prev("/p/1").set_next("/p/3").set_entry("replace")
        assert list(view.to_json()["nav"].keys()) == ["next", "prev", "entry"]



class TestPagePosition:
    """`nav.page` dit OU l'on est, il ne deplace rien.

    Des nombres et non une phrase : le client les met en forme dans sa langue.
    Miroir de js/tests/base-view.test.ts.
    """

    def test_writes_current_and_total(self):
        view = a_form()
        view.set_page(1, 2)
        assert view.to_json()["nav"]["page"] == {"current": 1, "total": 2}

    def test_total_is_optional_for_an_open_sequence(self):
        view = a_form()
        view.set_page(3)
        assert view.to_json()["nav"]["page"] == {"current": 3}

    def test_key_absent_when_never_called(self):
        view = a_form()
        view.set_next("/page-2")
        assert "page" not in view.to_json()["nav"]

    def test_rejects_a_position_below_one(self):
        for bad in (0, -1):
            with pytest.raises(InvalidParameterError):
                a_form().set_page(bad)

    def test_rejects_a_non_integer(self):
        for bad in (1.5, "2", True, None):
            with pytest.raises(InvalidParameterError):
                a_form().set_page(bad)

    def test_rejects_a_total_smaller_than_current(self):
        with pytest.raises(InvalidParameterError):
            a_form().set_page(3, 2)


class TestNumericEntry:
    """Un recul plus profond qu'un simple remplacement.

    Le nombre compte des ecrans DU FOURNISSEUR, jamais une profondeur absolue :
    celle-ci depend du chemin par lequel l'utilisateur est arrive.
    Miroir de js/tests/base-view.test.ts.
    """

    def test_accepts_zero_and_negatives(self):
        for value in (1, 0, -1, -5):
            view = a_form()
            view.set_entry(value)
            assert view.to_json()["nav"]["entry"] == value

    def test_still_accepts_the_two_words(self):
        for word in ("push", "replace"):
            view = a_form()
            view.set_entry(word)
            assert view.to_json()["nav"]["entry"] == word

    def test_refuses_above_one(self):
        # Empiler est empiler : au-dela, rien de plus ne se dirait.
        for value in (2, 7):
            with pytest.raises(InvalidParameterError):
                a_form().set_entry(value)

    def test_refuses_a_non_integer(self):
        for value in (1.5, "0", True, None):
            with pytest.raises(InvalidParameterError):
                a_form().set_entry(value)


class TestRehydrationKeepsPage:
    """``from_json`` doit rendre la config de navigation ENTIERE.

    Garde-fou : la reconstruction listait ``next``, ``prev`` et ``entry`` et
    oubliait ``page``. Une vue reservie apres un aller-retour perdait donc son
    indicateur de pagination en silence, et ne signait plus comme la charge
    dont elle venait.
    """

    def test_round_trip_is_byte_identical(self):
        import json
        from yeriasdk.views import ReaderView

        view = YeriaUI.create_reader_view("r", "R")
        view.add_paragraph("x")
        view.set_page(2, 4)
        view.set_entry("push")

        original = view.to_json()
        rehydrated = ReaderView.from_json(original).to_json()

        assert json.dumps(rehydrated, separators=(",", ":")) == json.dumps(
            original, separators=(",", ":")
        )

    def test_page_survives_the_round_trip(self):
        from yeriasdk.views import ReaderView

        view = YeriaUI.create_reader_view("r", "R")
        view.add_paragraph("x")
        view.set_page(2, 4)

        rehydrated = ReaderView.from_json(view.to_json())
        assert rehydrated.to_json()["nav"]["page"] == {"current": 2, "total": 4}
