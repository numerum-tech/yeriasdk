"""MessageView : boutons et issues.

Miroir de js/tests/message-view.test.ts. Le modele suit les boites de dialogue
classiques ; la seule difference tient a la distance : le fournisseur n'est pas
la au moment du clic, l'issue voyage donc avec le bouton.
"""

import pytest
from yeriasdk.errors import InvalidParameterError
from yeriasdk.views import MessageView


def a_message() -> MessageView:
    return MessageView("m", "Titre").set_body("Corps")


class TestActions:
    def test_starts_with_none(self):
        assert a_message().to_json()["content"]["actions"] == []

    def test_action_without_go_closes(self):
        v = a_message().add_action("OK")
        assert v.content["actions"] == [{"label": "OK"}]

    def test_action_with_go_carries_its_target(self):
        v = a_message().add_action("Voir la commande", go="/orders/4718")
        assert v.content["actions"] == [
            {"label": "Voir la commande", "go": "/orders/4718"}
        ]

    def test_method_only_alongside_a_target(self):
        v = a_message().add_action("Supprimer", go="/items/1", method="DELETE")
        assert v.content["actions"][0]["method"] == "DELETE"
        with pytest.raises(InvalidParameterError):
            a_message().add_action("OK", method="POST")

    def test_refuses_a_third_action(self):
        v = a_message().add_action("Un").add_action("Deux")
        with pytest.raises(InvalidParameterError):
            v.add_action("Trois")

    def test_refuses_an_empty_label(self):
        for bad in ("", "   "):
            with pytest.raises(InvalidParameterError):
                a_message().add_action(bad)

    def test_refuses_a_bare_view_id(self):
        with pytest.raises(InvalidParameterError):
            a_message().add_action("Suite", go="step-two")

    def test_clear_actions(self):
        v = a_message().add_action("Un").add_action("Deux").clear_actions()
        assert v.content["actions"] == []


class TestLegacyNames:
    def test_primary_maps_confirm_message_onto_go(self):
        v = a_message().set_primary_action("Retour", "GET", "api/forms")
        assert v.content["actions"] == [
            {"label": "Retour", "go": "api/forms", "method": "GET"}
        ]

    def test_primary_without_target_closes(self):
        assert a_message().set_primary_action("OK").content["actions"] == [
            {"label": "OK"}
        ]

    def test_secondary_adds_the_second_button(self):
        v = a_message().set_primary_action("Aller", "GET", "/x").set_secondary_action("OK")
        assert [a["label"] for a in v.content["actions"]] == ["Aller", "OK"]

    def test_clear_secondary_keeps_the_first(self):
        v = a_message().add_action("Un").add_action("Deux").clear_secondary_action()
        assert [a["label"] for a in v.content["actions"]] == ["Un"]


class TestContent:
    def test_no_more_confirm_cancel_or_can_dismiss(self):
        c = a_message().add_action("OK").to_json()["content"]
        for key in ("confirm", "cancel", "canDismiss"):
            assert key not in c

    def test_severity(self):
        assert a_message().to_json()["content"]["severity"] == "info"
        assert a_message().set_severity("success").content["severity"] == "success"


class TestBack:
    """Reculer ne recharge rien : l'ecran vise est deja dans la pile."""

    def test_carries_the_number_of_screens(self):
        v = a_message().add_action("Retour à la liste", back=1)
        assert v.content["actions"] == [{"label": "Retour à la liste", "back": 1}]

    def test_accepts_root(self):
        v = a_message().add_action("Accueil", back="root")
        assert v.content["actions"][0]["back"] == "root"

    def test_refuses_zero_negative_or_fraction(self):
        for bad in (0, -1, 1.5):
            with pytest.raises(InvalidParameterError):
                a_message().add_action("X", back=bad)

    def test_refuses_both_go_and_back(self):
        with pytest.raises(InvalidParameterError):
            a_message().add_action("X", go="/a", back=1)

    def test_refuses_a_method_alongside_back(self):
        with pytest.raises(InvalidParameterError):
            a_message().add_action("X", back=1, method="POST")


class TestTheThreeTexts:
    """`title` nomme la fenetre, `intro` est la premiere ligne — un
    sous-titre — et `body` est ce que le message DIT."""

    def test_refuses_a_message_with_no_body(self):
        from yeriasdk.errors import ViewValidationError
        with pytest.raises(ViewValidationError):
            MessageView("m", "Titre").build()
        with pytest.raises(ViewValidationError):
            MessageView("m", "Titre").set_intro("Une ligne").build()

    def test_accepts_a_body_on_its_own(self):
        c = MessageView("m", "Titre").set_body("Corps").to_json()["content"]
        assert c["body"] == "Corps"
        assert "intro" not in c

    def test_intro_stays_optional(self):
        c = (
            MessageView("m", "Titre")
            .set_body("Corps")
            .set_intro("Ligne")
            .to_json()["content"]
        )
        assert [c["title"], c["intro"], c["body"]] == ["Titre", "Ligne", "Corps"]
