"""
Tests for FormView - Critical functionality including separators and intro field
"""

import json

import pytest
from yeriasdk import YeriaApp, YeriaAppConfig
from yeriasdk.views import FormView
from yeriasdk.types import FormFieldParams
from yeriasdk.errors import (
    MissingRequiredParameterError,
    FieldValidationError,
    FieldNotFoundError,
    InvalidParameterError,
)


class TestFormView:
    """Test FormView basic functionality"""

    def test_create_form_view(self):
        """Test creating a basic form view"""
        form = FormView("test-form", "Test Form")
        assert form.id == "test-form"
        assert form.type == "Form"
        assert form.content["title"] == "Test Form"
        # Une intro non posée est absente, et non vide : la clé vide
        # faisait réserver une bande blanche par le renderer mobile.
        assert "intro" not in form.content
        assert form.content["fields"] == []

    def test_set_intro(self):
        """Test setting intro field"""
        form = FormView("test-form", "Test Form")
        form.set_intro("Please fill in the form")
        assert form.content["intro"] == "Please fill in the form"

    def test_add_text_field(self):
        """Test adding a text field"""
        form = FormView("test-form", "Test Form")
        form.add_text_field("name", "Full Name", is_required=True)
        assert len(form.content["fields"]) == 1
        field = form.content["fields"][0]
        assert field["fieldType"] == "text"
        assert field["fieldId"] == "name"
        assert field["fieldLabel"] == "Full Name"
        assert field["required"] is True

    def test_add_separator(self):
        """Test adding a separator field"""
        form = FormView("test-form", "Test Form")
        form.add_text_field("name", "Name")
        form.add_separator()
        form.add_email_field("email", "Email")
        
        assert len(form.content["fields"]) == 3
        separator = form.content["fields"][1]
        assert separator["fieldType"] == "separator"
        assert separator["fieldLabel"] == ""
        assert "fieldId" in separator

    def test_add_separator_with_id(self):
        """Test adding a separator with explicit ID"""
        form = FormView("test-form", "Test Form")
        form.add_separator("custom-separator")

        separator = form.content["fields"][0]
        assert separator["fieldType"] == "separator"
        assert separator["fieldId"] == "custom-separator"

    def test_add_separator_with_label(self):
        """Test adding a separator that carries an optional label"""
        form = FormView("test-form", "Test Form")
        form.add_separator("sep-1", "Contact details")

        separator = form.content["fields"][0]
        assert separator["fieldType"] == "separator"
        assert separator["fieldId"] == "sep-1"
        assert separator["fieldLabel"] == "Contact details"

    def test_get_field_count(self):
        """Test get_field_count() method"""
        form = FormView("test-form", "Test Form")
        form.add_text_field("name", "Name")
        form.add_separator()
        form.add_email_field("email", "Email")
        
        assert form.get_field_count() == 3
        assert form.get_field_count(exclude_separators=True) == 2

    def test_submit_button(self):
        """Test setting submit button"""
        form = FormView("test-form", "Test Form")
        form.add_text_field("name", "Name")
        form.submit_button("Submit", "POST")
        
        assert form.content["submit"] is not None
        assert form.content["submit"]["text"] == "Submit"
        assert form.content["submit"]["method"] == "POST"

    def test_validation_requires_field(self):
        """Test that form validation requires at least one non-separator field"""
        form = FormView("test-form", "Test Form")
        form.add_separator()
        
        result = form._validate()
        assert result.is_valid is False
        assert any("non-separator field" in str(e.message) for e in result.errors)

    def test_validation_with_real_fields(self):
        """Test that form with real fields passes validation"""
        form = FormView("test-form", "Test Form")
        form.add_text_field("name", "Name")
        form.add_separator()
        form.add_email_field("email", "Email")
        
        result = form._validate()
        assert result.is_valid is True

    def test_get_field(self):
        """Test getting a field by ID"""
        form = FormView("test-form", "Test Form")
        form.add_text_field("name", "Name")
        
        field = form.get_field("name")
        assert field is not None
        assert field["fieldId"] == "name"

    def test_get_field_not_found(self):
        """Test getting a non-existent field"""
        form = FormView("test-form", "Test Form")
        field = form.get_field("nonexistent")
        assert field is None

    def test_remove_field(self):
        """Test removing a field"""
        form = FormView("test-form", "Test Form")
        form.add_text_field("name", "Name")
        form.add_email_field("email", "Email")
        
        result = form.remove_field("name")
        assert result is True
        assert len(form.content["fields"]) == 1
        assert form.content["fields"][0]["fieldId"] == "email"

    def test_inject_data(self):
        """Test injecting data into form fields"""
        form = FormView("test-form", "Test Form")
        form.add_text_field("name", "Name")
        form.add_email_field("email", "Email")
        
        errors = form.inject_data({"name": "John Doe", "email": "john@example.com"})
        assert len(errors) == 0
        
        name_field = form.get_field("name")
        assert name_field["value"] == "John Doe"




class TestSpacer:
    """Complète le séparateur : le trait dit « nouveau groupe », l'espace
    laisse seulement respirer. Miroir de js/tests/form-view.test.ts."""

    def _form(self) -> FormView:
        view = FormView("f", "F")
        view.add_text_field("a", "A", True)
        return view

    def test_emits_a_display_only_field_with_its_size(self):
        view = self._form().add_spacer("lg")
        spacer = view.to_json()["content"]["fields"][1]
        assert spacer["fieldType"] == "spacer"
        assert spacer["size"] == "lg"
        assert spacer["fieldLabel"] == ""

    def test_defaults_to_md(self):
        view = self._form().add_spacer()
        assert view.to_json()["content"]["fields"][1]["size"] == "md"

    def test_refuses_a_size_outside_the_three_steps(self):
        view = self._form()
        for size in ["xl", "MD", "", "large"]:
            with pytest.raises(InvalidParameterError):
                view.add_spacer(size)

    def test_id_derives_from_position(self):
        # Un horodatage ferait signer différemment deux formulaires identiques.
        def build() -> str:
            view = FormView("f", "F")
            view.add_text_field("a", "A", True).add_spacer("sm")
            return json.dumps(view.to_json()["content"], sort_keys=False)

        assert build() == build()

    def test_does_not_count_as_a_field_on_its_own(self):
        view = FormView("empty", "F")
        view.add_spacer("md")
        with pytest.raises(Exception):
            view.build()


class TestSelectDisplay:
    """`display` est une preference de presentation, pas un autre champ.

    Miroir de js/tests/form-view.test.ts. Un client qui ignore la cle doit
    retomber sur la feuille de selection : la cle est donc OMISE quand elle
    n'est pas posee, jamais emise vide.
    """

    OPTS = [{"label": "Oui", "value": "y"}, {"label": "Non", "value": "n"}]

    def _field(self, **kwargs):
        form = FormView("f", "F")
        form.add_select_field("choix", "Choix", False, self.OPTS, **kwargs)
        return form.content["fields"][0]

    def test_key_absent_when_not_declared(self):
        assert "display" not in self._field()

    def test_carries_radio(self):
        assert self._field(display="radio")["display"] == "radio"

    def test_carries_dropdown(self):
        assert self._field(display="dropdown")["display"] == "dropdown"

    def test_rejects_anything_else(self):
        for bad in ("Radio", "list", "", "inline"):
            with pytest.raises(InvalidParameterError):
                self._field(display=bad)


class TestDateFieldBounds:
    """Les bornes d'un champ date voyagent en ``minDate`` / ``maxDate``, au
    format ``YYYY-MM-DD``.

    Garde-fou de parité : le SDK JS convertissait les bornes en millisecondes
    et émettait ``min`` / ``max``. Le renderer type les deux clefs en chaîne,
    il ne lisait donc rien et toute borne était perdue en silence ; Python
    émettait déjà la forme documentée, si bien que les deux SDK signaient le
    même formulaire différemment.
    """

    @staticmethod
    def _date_field(form):
        # Aller-retour par le JSON : la signature porte sur le JSON, donc c'est
        # ce qui y survit qui doit s'accorder avec le SDK JS et le client.
        payload = json.loads(json.dumps(form.to_json()))
        return next(f for f in payload["content"]["fields"] if f["fieldType"] == "date")

    def test_bounds_travel_as_min_date_max_date(self):
        form = FormView("f", "F")
        form.add_date_field("birth", "Birth", True, "1900-01-01", "2010-12-31")

        field = self._date_field(form)
        assert field["minDate"] == "1900-01-01"
        assert field["maxDate"] == "2010-12-31"

    def test_never_emits_epoch_min_max_keys(self):
        form = FormView("f", "F")
        form.add_date_field("birth", "Birth", True, "1900-01-01", "2010-12-31")

        field = self._date_field(form)
        assert "min" not in field
        assert "max" not in field

    def test_omits_both_keys_without_bounds(self):
        form = FormView("f", "F")
        form.add_date_field("day", "Day")

        field = self._date_field(form)
        assert "minDate" not in field
        assert "maxDate" not in field

    def test_rejects_a_bound_that_is_not_iso(self):
        form = FormView("f", "F")

        with pytest.raises(FieldValidationError):
            form.add_date_field("birth", "Birth", True, "01/01/1900")


class TestFieldKeyOrder:
    """``add_field`` et ``update_field`` doivent poser les clefs dans le même
    ordre, celui de ``FIELD_KEY_ORDER``.

    La signature porte sur le JSON compact : un champ complété après coup qui
    range ses clefs autrement qu'un champ complet dès l'appel ne signe pas
    pareil, alors qu'il décrit la même chose.
    """

    def test_add_field_follows_the_canonical_order(self):
        from yeriasdk.views.form_view import FIELD_KEY_ORDER

        form = FormView("f", "F")
        form.add_field(
            "photo",
            "img",
            "Img",
            FormFieldParams(
                value="a/b.jpg", required=True, accept=["image/jpeg"], live=False,
                placeholder="p", help_text="h", disabled=False, readonly=True,
                multiple=True, max_count=3, source="record", max_size=100,
            ),
        )
        emitted = [k for k in form.to_json()["content"]["fields"][0]
                   if k not in ("fieldType", "fieldId", "fieldLabel")]

        assert emitted == [k for k in FIELD_KEY_ORDER if k in emitted]

    def test_a_late_value_lands_where_an_upfront_one_would(self):
        late = FormView("f", "F")
        late.add_text_field("name", "Name", True)
        late.set_field_value("name", "Ada")

        upfront = FormView("f", "F")
        upfront.add_field("text", "name", "Name",
                          FormFieldParams(required=True, value="Ada"))

        assert (json.dumps(late.to_json()["content"]["fields"][0], separators=(",", ":"))
                == json.dumps(upfront.to_json()["content"]["fields"][0], separators=(",", ":")))


class TestOrderingAtSerialization:
    """L'ordre se tranche à la sérialisation, pas seulement à l'écriture.

    ``get_field`` rend le dict stocké : un appelant peut y poser une clef
    directement, et c'est ainsi qu'une clef tardive atterrissait en fin de
    champ et changeait la signature d'un formulaire décrivant la même chose.
    """

    @staticmethod
    def _bytes(form):
        return json.dumps(form.to_json()["content"]["fields"][0], separators=(",", ":"))

    def test_a_value_set_on_the_stored_field_lands_canonically(self):
        mutated = FormView("f", "F")
        mutated.add_text_field("name", "Name", True)
        mutated.get_field("name")["value"] = "Ada"

        upfront = FormView("f", "F")
        upfront.add_field("text", "name", "Name",
                          FormFieldParams(required=True, value="Ada"))

        assert self._bytes(mutated) == self._bytes(upfront)

    def test_serializing_twice_does_not_drift(self):
        form = FormView("f", "F")
        form.add_text_field("name", "Name", True)
        form.get_field("name")["value"] = "Ada"

        assert self._bytes(form) == self._bytes(form)
