"""
FormView - A view for displaying forms with various field types
"""

from typing import Optional, Dict, Any, List, Union
from datetime import datetime
import re

from ..core.base_view import BaseView
from ..types.models import (
    FormFieldParams,
    SubmitAction,
    FieldValidation,
    ValidationResult,
    HttpMethod,
    CaptureSource,
    VideoQuality,
)
from ..utils.validators import FieldValidator, FormValidator, validate_stored_media_paths
from ..utils.file_formats import FileFormatManager
from ..errors.exceptions import (
    MissingRequiredParameterError,
    InvalidParameterError,
    FieldValidationError,
    FieldNotFoundError,
    EmptyCollectionError,
)


#: Field types that display something instead of collecting it. They occupy a
#: slot in ``fields`` because that list carries ORDER, but they hold no value,
#: are never submitted, and are skipped by validation.
DISPLAY_ONLY_TYPES = ("separator", "paragraph", "spacer")

# L'ordre d'emission des clefs d'un champ.
#
# La signature porte sur le JSON compact : l'ordre des clefs fait partie du
# contrat de fil, pas de la mise en forme. Cette liste est l'ordre canonique ;
# elle reflete la sequence des insertions `field[...]` de `add_field` et le
# tableau FIELD_KEY_ORDER du SDK JS (js/src/core/form-view.ts). Les trois se
# modifient ensemble.
FIELD_KEY_ORDER = (
    "value", "required", "pattern", "min", "max", "minLength", "maxLength",
    "options", "display", "accept", "live", "altitude", "maxAccuracy",
    "precision", "placeholder", "helpText", "disabled", "readonly",
    "size", "bold", "italic", "minDate", "maxDate", "multiple", "maxCount",
    "maxDuration", "minDuration", "source", "quality", "maxSize",
)

_FIELD_IDENTITY_KEYS = ("fieldType", "fieldId", "fieldLabel")


def order_field_keys(field: Dict[str, Any]) -> Dict[str, Any]:
    """Reconstruit un champ avec ses clefs dans FIELD_KEY_ORDER.

    Une clef inconnue de la liste est conservee, a la fin et dans son ordre
    d'origine : mieux vaut une clef mal placee qu'une clef perdue en silence.
    """
    ordered = {k: field[k] for k in _FIELD_IDENTITY_KEYS if k in field}
    for key in FIELD_KEY_ORDER:
        if key in field:
            ordered[key] = field[key]
    for key, value in field.items():
        if key not in ordered:
            ordered[key] = value
    # Un motif compile n'a pas de representation JSON : `add_field` le
    # convertissait, mais un `update_field` tardif le stockait tel quel et
    # `json.dumps` levait au build. Le JS convertit ici, au point par lequel
    # passe tout champ ; meme chose de ce cote.
    pattern = ordered.get("pattern")
    if isinstance(pattern, re.Pattern):
        ordered["pattern"] = pattern.pattern
    return ordered



class FormView(BaseView):
    """Builds a Form SGUI view — an interactive data-entry form.

    Fields are appended via ``add_field`` and the typed helpers
    (``add_text_field``, ``add_email_field``, ``add_select_field``,
    ``add_photo_field``, ``add_audio_field``, ``add_video_field``,
    ``add_gps_field``, ...); ``submit_button`` /
    ``update_button`` / ``delete_button`` define the submit action, and
    ``inject_data`` / ``set_field_value`` pre-fill existing fields.

    Extends ``BaseView``; instantiated by the YeriaApp/YeriaUI factory,
    populated with these builders, then serialized to a JSON view description
    and signed into a v3 envelope by ``serve()``.
    """
    @classmethod
    def from_json(cls, json_view):
        """Rehydrate a Form view from a wire JSON payload."""
        return cls.from_json_as('Form', json_view)


    def __init__(self, form_id: str, title: str, process_id: Optional[str] = None):
        super().__init__(
            {
                "id": form_id,
                "type": "Form",
                "process_id": process_id,
                "metadata": {
                    "version": "1.0.0",
                    "created_at": datetime.now(),
                },
            }
        )

        self.content = {
            "title": title,
            "submit": None,
            "fields": [],
        }

        self._field_validations: Dict[str, FieldValidation] = {}

    def set_intro(self, intro: str) -> "FormView":
        """Set form introduction text (like ActionList/ActionGrid/etc.)"""
        return self._set_intro_text("intro", intro)

    def set_note(self, note: str) -> "FormView":
        """Small print under the intro — a caveat, a legal mention, a count.

        The mobile app has always rendered it; it simply had no setter.
        """
        if not isinstance(note, str):
            raise InvalidParameterError("note", note, "note must be a string")
        self.content["note"] = note
        return self

    def add_paragraph(
        self,
        text: str,
        size: str = "md",
        bold: bool = False,
        italic: bool = False,
    ) -> "FormView":
        """Displayed text placed among the fields.

        Not an input: it carries no value, is never submitted, and is skipped
        by validation. Deliberately poor — four sizes, bold, italic. Anything
        richer belongs in a ReaderView, not in the middle of a form.

        The sizes are sizes, not roles: nothing here says a block is a heading.
        What a given size means is the provider's call.

        Args:
            text: the text to display
            size: 'xl' (24px), 'lg' (18px), 'md' (14px, default) or 'sm' (12px)
            bold: render bold
            italic: render italic
        """
        if not isinstance(text, str) or not text.strip():
            raise InvalidParameterError(
                "text", text, "paragraph text must be a non-empty string"
            )
        if size not in ("xl", "lg", "md", "sm"):
            raise InvalidParameterError(
                "size", size, "size must be 'xl', 'lg', 'md' or 'sm'"
            )

        params = FormFieldParams(
            value=text,
            size=size,
            bold=True if bold else None,
            italic=True if italic else None,
        )

        # Goes through add_field like everything else: one insertion path.
        return self.add_field(
            "paragraph",
            f"paragraph-{len(self.content['fields'])}",
            "",
            params,
        )

    def secondary_button(
        self,
        text: str,
        url: str,
        mode: str = "navigate",
        method: Optional[str] = None,
        validate: Optional[bool] = None,
        confirm_message: Optional[str] = None,
    ) -> "FormView":
        """Second action of the form, rendered under the submit button.

        `mode` decides what happens to what the user typed, and it is explicit
        on purpose — guessing would be a bug:
            'navigate': call `url`, render the view that comes back. Entered
                        values are DISCARDED. This is "Skip", "Cancel".
            'submit':   send the current values to `url`. A second destination
                        for the same data.

        `validate` defaults to False for 'navigate' (a Skip blocked by an empty
        required field would be absurd) and True for 'submit'.
        """
        if not isinstance(text, str) or not text.strip():
            raise InvalidParameterError("text", text, "secondary button text is required")
        if not isinstance(url, str) or not url.strip():
            raise InvalidParameterError("url", url, "secondary button url is required")
        if mode not in ("navigate", "submit"):
            raise InvalidParameterError("mode", mode, "mode must be 'navigate' or 'submit'")

        action: Dict[str, Any] = {
            "text": text,
            "url": url,
            "mode": mode,
            "validate": validate if validate is not None else (mode == "submit"),
        }
        if mode == "submit":
            action["method"] = method or "POST"
        if confirm_message:
            action["confirmMessage"] = confirm_message

        self.content["secondary"] = action
        return self

    def belongs_to_process(
        self,
        process_id: str,
        process_name: Optional[str] = None,
        current_step: Optional[int] = None,
        total_steps: Optional[int] = None,
        step_name: Optional[str] = None,
        can_go_back: Optional[bool] = None,
        can_skip: Optional[bool] = None,
    ) -> "FormView":
        """Helper method to associate this form with a process"""
        context = {}
        if process_name:
            context["processName"] = process_name
        if current_step is not None:
            context["currentStep"] = current_step
        if total_steps is not None:
            context["totalSteps"] = total_steps
        if step_name:
            context["stepName"] = step_name
        if can_go_back is not None:
            context["canGoBack"] = can_go_back
        if can_skip is not None:
            context["canSkip"] = can_skip

        self.set_process(process_id, context)
        return self

    def add_field(
        self,
        field_type: str,
        field_id: str,
        field_label: str,
        params: Optional[FormFieldParams] = None,
    ) -> "FormView":
        """Add a field with validation"""
        # Display-only entries carry no label: `separator` draws a rule,
        # `paragraph` carries its text in `value`. Neither is an input.
        if not field_id or not field_type or (
            field_type not in DISPLAY_ONLY_TYPES and not field_label
        ):
            raise MissingRequiredParameterError("fieldId, fieldLabel, and fieldType")

        # Validate the field
        validation = FieldValidator.validate_field(
            field_type, field_id, field_label, params
        )
        if not validation.is_valid:
            error_messages = [e.message for e in validation.errors]
            raise FieldValidationError(field_id, field_type, error_messages)

        field = {
            "fieldType": field_type,
            "fieldId": field_id,
            "fieldLabel": field_label,
        }

        if params:
            # Add all params to field
            if params.value is not None:
                field["value"] = params.value
            if params.required is not None:
                field["required"] = params.required
            if params.pattern:
                # Convert regex pattern to string representation
                field["pattern"] = params.pattern.pattern
            if params.min is not None:
                field["min"] = params.min
            if params.max is not None:
                field["max"] = params.max
            if params.min_length is not None:
                field["minLength"] = params.min_length
            if params.max_length is not None:
                field["maxLength"] = params.max_length
            if params.options:
                field["options"] = [
                    {
                        "label": opt.label,
                        "value": opt.value,
                        "selected": opt.selected,
                    }
                    for opt in params.options
                ]
            # Juste apres `options` : le SDK JS etale `{required, options,
            # display}` dans cet ordre, et la signature porte sur le JSON
            # compact — un rang different casserait la parite d'octets.
            if params.display is not None:
                field["display"] = params.display
            if params.accept:
                field["accept"] = params.accept
            if params.live is not None:
                field["live"] = params.live
            if params.altitude is not None:
                field["altitude"] = params.altitude
            if params.max_accuracy is not None:
                field["maxAccuracy"] = params.max_accuracy
            if params.precision is not None:
                field["precision"] = params.precision
            if params.placeholder:
                field["placeholder"] = params.placeholder
            if params.help_text:
                field["helpText"] = params.help_text
            if params.disabled is not None:
                field["disabled"] = params.disabled
            if params.readonly is not None:
                field["readonly"] = params.readonly
            # Mise en forme d'un bloc `paragraph`. L'ordre d'insertion compte :
            # la signature porte sur le JSON compact, et le SDK JS place ces
            # clefs ici — toute divergence casserait la parité d'octets.
            if params.size is not None:
                field["size"] = params.size
            if params.bold is not None:
                field["bold"] = params.bold
            if params.italic is not None:
                field["italic"] = params.italic
            if params.min_date:
                field["minDate"] = params.min_date
            if params.max_date:
                field["maxDate"] = params.max_date
            if params.multiple is not None:
                field["multiple"] = params.multiple
            if params.max_count is not None:
                field["maxCount"] = params.max_count
            if params.max_duration is not None:
                field["maxDuration"] = params.max_duration
            if params.min_duration is not None:
                field["minDuration"] = params.min_duration
            if params.source is not None:
                field["source"] = params.source
            if params.quality is not None:
                field["quality"] = params.quality
            if params.max_size is not None:
                field["maxSize"] = params.max_size

            # Store validation for this field
            self._field_validations[field_id] = params

        self.content["fields"].append(field)
        return self

    def submit_button(
        self, text: str, method: HttpMethod = "POST", confirm_message: Optional[str] = None
    ) -> "FormView":
        """Define the method/button used to submit back to the URL that returned the form."""
        self.content["submit"] = {
            "text": text,
            "method": method,
            "confirmMessage": confirm_message,
        }
        return self

    def update_button(
        self, text: str, confirm_message: Optional[str] = None
    ) -> "FormView":
        """Convenience method for update actions (PUT)"""
        return self.submit_button(text, "PUT", confirm_message)

    def delete_button(
        self, text: str, confirm_message: str = "Are you sure you want to delete this?"
    ) -> "FormView":
        """Convenience method for delete actions (DELETE with confirmation)"""
        return self.submit_button(text, "DELETE", confirm_message)

    # Convenience methods for different field types
    def add_text_field(
        self, field_id: str, field_label: str, is_required: bool = False, max_length: Optional[int] = None
    ) -> "FormView":
        params = FormFieldParams(required=is_required, max_length=max_length)
        return self.add_field("text", field_id, field_label, params)

    def add_email_field(
        self, field_id: str, field_label: str, is_required: bool = False
    ) -> "FormView":
        params = FormFieldParams(required=is_required, pattern=re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$"))
        return self.add_field("email", field_id, field_label, params)

    def add_password_field(
        self, field_id: str, field_label: str, min_length: int = 8
    ) -> "FormView":
        params = FormFieldParams(required=True, min_length=min_length)
        return self.add_field("password", field_id, field_label, params)

    def add_number_field(
        self,
        field_id: str,
        field_label: str,
        is_required: bool = False,
        min_val: Optional[float] = None,
        max_val: Optional[float] = None,
    ) -> "FormView":
        params = FormFieldParams(required=is_required, min=min_val, max=max_val)
        return self.add_field("number", field_id, field_label, params)

    def add_date_field(
        self,
        field_id: str,
        field_label: str,
        is_required: bool = False,
        min_date: Optional[str] = None,
        max_date: Optional[str] = None,
    ) -> "FormView":
        params = FormFieldParams(required=is_required, min_date=min_date, max_date=max_date)
        return self.add_field("date", field_id, field_label, params)

    def add_select_field(
        self,
        field_id: str,
        field_label: str,
        is_required: bool = False,
        options: Optional[List[Dict[str, Any]]] = None,
        display: Optional[str] = None,
    ) -> "FormView":
        """One choice among several.

        ``display`` est une preference de presentation, pas un autre champ :
        ``radio`` pose toutes les options a plat dans le formulaire,
        ``dropdown`` (defaut) ouvre une feuille de selection. Choisir
        ``radio`` pour une poignee d'options que l'utilisateur doit pouvoir
        comparer d'un coup d'oeil, ``dropdown`` quand elles sont nombreuses.
        Un client qui ignore la cle retombe sur la feuille.
        """
        if not options or len(options) == 0:
            raise EmptyCollectionError(
                "Select field options", "Select field must have at least one option"
            )
        if display is not None and display not in ("dropdown", "radio"):
            raise InvalidParameterError(
                "display", display, "display must be 'dropdown' or 'radio'"
            )

        from ..types.models import FormFieldOption
        field_options = [
            FormFieldOption(
                label=opt["label"],
                value=opt["value"],
                # None (not False) when unset: JS only adds `selected` once a
                # value is applied (set_value); unset options omit the key.
                selected=opt.get("selected", None),
            )
            for opt in options
        ]

        # `display` omise quand elle n'est pas posee : le client applique son
        # defaut, et les octets restent identiques a ceux du SDK JS.
        params = FormFieldParams(
            required=is_required, options=field_options, display=display
        )
        return self.add_field("select", field_id, field_label, params)

    def add_photo_field(
        self,
        field_id: str,
        field_label: str,
        is_required: bool = False,
        formats: Optional[List[str]] = None,
        live: bool = False,
        multiple: Optional[bool] = None,
        max_count: Optional[int] = None,
        source: Optional[CaptureSource] = None,
        value: Optional[Union[str, List[str]]] = None,
        readonly: Optional[bool] = None,
        disabled: Optional[bool] = None,
    ) -> "FormView":
        """Add a photo field.

        ``multiple``/``max_count`` accept more than one photo. ``source`` is
        ``record`` (camera only), ``library`` (gallery only) or ``both``
        (default) — use ``record`` when the photo must have been taken now
        rather than picked from the gallery.

        ``value`` est le chemin d'un fichier que le fournisseur detient DEJA,
        relatif a la base du service (une liste quand ``multiple``). Avec
        ``readonly`` le champ devient un visualiseur de ce contenu : la
        lecture fonctionne, les commandes d'ajout et de suppression
        disparaissent. ``disabled`` grise le champ et l'exclut de l'envoi.
        """
        if not formats:
            formats = ["jpeg", "png"]
        if len(formats) == 0:
            raise EmptyCollectionError(
                "Photo field formats", "Photo field must specify at least one format"
            )

        accepted_formats = [f"image/{f.lower()}" for f in formats]
        params = FormFieldParams(
            value=value,
            required=is_required,
            accept=accepted_formats,
            live=live,
            disabled=disabled,
            readonly=readonly,
            multiple=multiple,
            max_count=max_count,
            source=source,
        )
        return self.add_field("photo", field_id, field_label, params)

    def add_file_field(
        self,
        field_id: str,
        field_label: str,
        is_required: bool = False,
        formats: Optional[List[str]] = None,
        multiple: Optional[bool] = None,
        max_count: Optional[int] = None,
        value: Optional[Union[str, List[str]]] = None,
        readonly: Optional[bool] = None,
        disabled: Optional[bool] = None,
    ) -> "FormView":
        """Add a file field.

        ``value`` est le chemin d'un fichier que le fournisseur detient DEJA,
        relatif a la base du service (une liste quand ``multiple``). Avec
        ``readonly`` le champ devient un visualiseur de ce contenu : la
        lecture fonctionne, les commandes d'ajout et de suppression
        disparaissent. ``disabled`` grise le champ et l'exclut de l'envoi.
        """
        if not formats or len(formats) == 0:
            raise EmptyCollectionError(
                "File field formats", "File field must specify at least one format"
            )

        params = FormFieldParams(
            value=value,
            required=is_required,
            accept=formats,
            disabled=disabled,
            readonly=readonly,
            multiple=multiple,
            max_count=max_count,
        )
        return self.add_field("file", field_id, field_label, params)

    def add_audio_field(
        self,
        field_id: str,
        field_label: str,
        is_required: bool = False,
        max_duration: Optional[float] = None,
        min_duration: Optional[float] = None,
        source: Optional[CaptureSource] = None,
        multiple: Optional[bool] = None,
        max_count: Optional[int] = None,
        max_size: Optional[int] = None,
        formats: Optional[List[str]] = None,
        value: Optional[Union[str, List[str]]] = None,
        readonly: Optional[bool] = None,
        disabled: Optional[bool] = None,
    ) -> "FormView":
        """Add a voice-recording field.

        The captured file travels back inside the normal multipart form
        submission under this ``field_id`` — there is no separate upload
        endpoint.

        ``max_duration`` (seconds) is recommended: it is the only thing that
        bounds how large the upload gets. Voice at the renderer's default
        encoding runs roughly 0.5 MB per minute. ``min_duration`` rejects an
        accidental tap-and-release. ``source`` is ``record`` (microphone only),
        ``library`` or ``both`` (default). ``formats`` defaults to what iOS and
        Android record natively.

        ``value`` est le chemin d'un fichier que le fournisseur detient DEJA,
        relatif a la base du service (une liste quand ``multiple``). Avec
        ``readonly`` le champ devient un visualiseur de ce contenu : la
        lecture fonctionne, les commandes d'ajout et de suppression
        disparaissent. ``disabled`` grise le champ et l'exclut de l'envoi.
        """
        if formats is None:
            formats = ["m4a", "mp3", "wav", "aac"]
        if len(formats) == 0:
            raise EmptyCollectionError(
                "Audio field formats", "Audio field must specify at least one format"
            )

        params = FormFieldParams(
            value=value,
            required=is_required,
            accept=FileFormatManager.get_mime_types(formats),
            disabled=disabled,
            readonly=readonly,
            max_duration=max_duration,
            min_duration=min_duration,
            source=source,
            multiple=multiple,
            max_count=max_count,
            max_size=max_size,
        )
        return self.add_field("audio", field_id, field_label, params)

    def add_video_field(
        self,
        field_id: str,
        field_label: str,
        is_required: bool = False,
        max_duration: Optional[float] = None,
        min_duration: Optional[float] = None,
        quality: Optional[VideoQuality] = None,
        source: Optional[CaptureSource] = None,
        multiple: Optional[bool] = None,
        max_count: Optional[int] = None,
        max_size: Optional[int] = None,
        formats: Optional[List[str]] = None,
        value: Optional[Union[str, List[str]]] = None,
        readonly: Optional[bool] = None,
        disabled: Optional[bool] = None,
    ) -> "FormView":
        """Add a video-recording field.

        Like audio, the captured file rides the normal multipart submission
        under this ``field_id``.

        ``max_duration`` (seconds) is REQUIRED here. Video is the one field type
        that can produce a payload large enough to fail the provider's request
        body limit, and duration x quality is what bounds it — see
        :data:`VideoQuality` for the per-minute sizes each setting implies.

        ``quality`` defaults to ``medium``. ``max_size`` (bytes) makes the
        renderer refuse to upload a file past that and report a field error
        instead of failing mid-request.

        ``value`` est le chemin d'un fichier que le fournisseur detient DEJA,
        relatif a la base du service (une liste quand ``multiple``). Avec
        ``readonly`` le champ devient un visualiseur de ce contenu : la
        lecture fonctionne, les commandes d'ajout et de suppression
        disparaissent. ``disabled`` grise le champ et l'exclut de l'envoi.
        """
        if formats is None:
            formats = ["mp4", "mov", "webm"]
        if len(formats) == 0:
            raise EmptyCollectionError(
                "Video field formats", "Video field must specify at least one format"
            )

        params = FormFieldParams(
            value=value,
            required=is_required,
            accept=FileFormatManager.get_mime_types(formats),
            disabled=disabled,
            readonly=readonly,
            max_duration=max_duration,
            min_duration=min_duration,
            quality=quality if quality is not None else "medium",
            source=source,
            multiple=multiple,
            max_count=max_count,
            max_size=max_size,
        )
        return self.add_field("video", field_id, field_label, params)

    def add_gps_field(
        self,
        field_id: str,
        field_label: str,
        is_required: bool = False,
        live_data: bool = False,
        altitude: Optional[bool] = None,
        max_accuracy: Optional[float] = None,
        precision: Optional[bool] = None,
    ) -> "FormView":
        """``max_accuracy`` (metres) = the coarsest fix accepted, i.e. the
        minimum required precision; the app captures until the reading is within
        that radius. ``precision`` is the legacy boolean flag, superseded by it."""
        params = FormFieldParams(
            required=is_required,
            live=live_data,
            altitude=altitude,
            max_accuracy=max_accuracy,
            precision=precision,
        )
        return self.add_field("gps", field_id, field_label, params)

    def add_plus_code_field(
        self,
        field_id: str,
        field_label: str,
        is_required: bool = False,
        live_data: bool = False,
    ) -> "FormView":
        params = FormFieldParams(required=is_required, live=live_data)
        return self.add_field("pluscode", field_id, field_label, params)

    def add_hidden_field(
        self, field_id: str, field_label: str, value: str
    ) -> "FormView":
        params = FormFieldParams(value=value)
        return self.add_field("hidden", field_id, field_label, params)

    def add_text_area_field(
        self,
        field_id: str,
        field_label: str,
        is_required: bool = False,
        min_length: Optional[int] = None,
        max_length: Optional[int] = None,
    ) -> "FormView":
        params = FormFieldParams(
            required=is_required, min_length=min_length, max_length=max_length
        )
        return self.add_field("textarea", field_id, field_label, params)

    def add_phone_field(
        self, field_id: str, field_label: str, is_required: bool = False
    ) -> "FormView":
        params = FormFieldParams(required=is_required, pattern=re.compile(r"^[\+]?[1-9][\d]{0,15}$"))
        return self.add_field("phone", field_id, field_label, params)

    def add_url_field(
        self, field_id: str, field_label: str, is_required: bool = False
    ) -> "FormView":
        params = FormFieldParams(required=is_required)
        return self.add_field("url", field_id, field_label, params)

    def add_checkbox_field(
        self, field_id: str, field_label: str, is_required: bool = False
    ) -> "FormView":
        params = FormFieldParams(required=is_required)
        return self.add_field("checkbox", field_id, field_label, params)

    def add_spacer(self, size: str = "md") -> "FormView":
        """Vertical breathing space between fields - nothing is drawn.

        Complements :meth:`add_separator`, which draws a rule: use a separator
        to say "a new group starts here", a spacer to let an existing group
        breathe without claiming a boundary.

        Three steps only, so a form cannot drift into arbitrary spacing. What
        each one measures is the client's business - a provider asks for a gap,
        not for a number of pixels.

        Carries no value, is never submitted, and is skipped by validation.

        Args:
            size: 'sm', 'md' (default) or 'lg'
        """
        if size not in ("sm", "md", "lg"):
            raise InvalidParameterError(
                "size", size, "size must be 'sm', 'md' or 'lg'"
            )

        # Id derive de la position, comme add_paragraph : un horodatage ferait
        # signer differemment deux formulaires identiques.
        return self.add_field(
            "spacer",
            f"spacer-{len(self.content['fields'])}",
            "",
            FormFieldParams(size=size),
        )

    def add_separator(self, field_id: Optional[str] = None, label: str = "") -> "FormView":
        """Add a visual separator to group form fields

        Separators are rendered as gaps or lines by the mobile app renderer.

        Args:
            field_id: Optional field ID. If not provided, auto-generates a unique ID.
            label: Optional label. Empty by default; the mobile renderer may
                display it once separator-label rendering lands.

        Returns:
            self for chaining

        Example:
            form.add_text_field('name', 'Name', True)
                .add_separator()
                .add_email_field('email', 'Email', True)
        """
        import time
        import random
        separator_id = field_id or f"separator-{int(time.time() * 1000)}-{random.randint(1000, 9999)}"
        return self.add_field("separator", separator_id, label, None)

    def inject_data(self, data: Dict[str, Any]) -> List[str]:
        """Inject data into existing form fields"""
        errors: List[str] = []

        for field_id, value in data.items():
            field = self.get_field(field_id)
            if not field:
                errors.append(f"Field not found: {field_id}")
                continue

            # Auto-detect: fields with options (select, radio, checkbox with options)
            if field.get("options") and field.get("fieldType") == "select":
                updated_options = [
                    {**opt, "selected": opt["value"] == value}
                    for opt in field["options"]
                ]
                self.update_field(field_id, {"options": updated_options})
            elif field.get("options") and field.get("fieldType") == "radio":
                updated_options = [
                    {**opt, "selected": opt["value"] == value}
                    for opt in field["options"]
                ]
                self.update_field(field_id, {"options": updated_options})
            elif field.get("options") and field.get("fieldType") == "checkbox":
                selected_values = value if isinstance(value, list) else [value]
                updated_options = [
                    {**opt, "selected": opt["value"] in selected_values}
                    for opt in field["options"]
                ]
                self.update_field(field_id, {"options": updated_options})
            else:
                try:
                    self.update_field(field_id, {"value": value})
                except FieldValidationError as e:
                    # Une valeur refusee est une erreur parmi celles que cette
                    # methode rapporte, pas une exception hors de la boucle.
                    errors.append(str(e))

        return errors

    def set_field_value(self, field_id: str, value: Any) -> "FormView":
        """Set the value of a specific field"""
        field = self.get_field(field_id)
        if not field:
            raise FieldNotFoundError(field_id, self.id)

        self.update_field(field_id, {"value": value})
        return self

    def validate_form_data(self, form_data: Dict[str, Any]) -> ValidationResult:
        """Validate form data"""
        return FormValidator.validate_form_data(form_data, self._field_validations)

    def get_field(self, field_id: str) -> Optional[Dict[str, Any]]:
        """Get a field by its ID"""
        return next(
            (f for f in self.content["fields"] if f.get("fieldId") == field_id), None
        )

    def remove_field(self, field_id: str) -> bool:
        """Remove a field by its ID"""
        fields = self.content["fields"]
        index = next(
            (i for i, f in enumerate(fields) if f.get("fieldId") == field_id), -1
        )

        if index != -1:
            fields.pop(index)
            if field_id in self._field_validations:
                del self._field_validations[field_id]
            return True

        return False

    def build(self) -> Dict[str, Any]:
        """Remet chaque champ dans l'ordre canonique avant serialisation.

        Ordonner a l'ecriture ne suffit pas : ``get_field`` rend le dict
        stocke, donc un appelant peut y poser une clef directement et
        l'installer en fin de champ. L'ordre etant un contrat de fil, il se
        tranche ici, au seul point par lequel passe tout payload, quel que
        soit le chemin emprunte par le champ.
        """
        fields = self.content.get("fields")
        if isinstance(fields, list):
            for i, field in enumerate(fields):
                if isinstance(field, dict):
                    field = order_field_keys(field)
                    fields[i] = field
                    # Meme raisonnement que l'ordre : une valeur posee
                    # directement sur le dict rendu par `get_field` a
                    # contourne `update_field`, donc la regle du chemin de
                    # media se verifie une fois de plus ici.
                    field_type = field.get("fieldType", "")
                    problems = validate_stored_media_paths(
                        field_type, field.get("fieldId", ""), field.get("value")
                    )
                    if problems:
                        raise FieldValidationError(
                            field.get("fieldId", ""), field_type, [e.message for e in problems]
                        )
        return super().build()

    def update_field(self, field_id: str, updates: Dict[str, Any]) -> bool:
        """Update an existing field"""
        field = self.get_field(field_id)
        if not field:
            return False

        # Reconstruction plutot que mutation : `dict.update` ajoute une clef
        # absente A LA FIN, alors qu'un `set_field_value` tardif doit poser
        # `value` en tete, la ou `add_field` l'emet.
        fields = self.content["fields"]
        merged = order_field_keys({**field, **updates})

        # Une valeur posee apres coup prend la meme route qu'une valeur posee
        # a la construction : `add_field` refusait un chemin de media absolu,
        # et cette methode le laissait passer — `set_field_value` et
        # `inject_data` aboutissent toutes deux ici.
        if "value" in updates:
            field_type = merged.get("fieldType", "")
            problems = validate_stored_media_paths(field_type, field_id, merged.get("value"))
            if problems:
                raise FieldValidationError(field_id, field_type, [e.message for e in problems])
        fields[fields.index(field)] = merged

        # Update validation
        if field_id in self._field_validations:
            existing_validation = self._field_validations[field_id]
            # Merge updates into validation
            for key, value in updates.items():
                if hasattr(existing_validation, key):
                    setattr(existing_validation, key, value)

        return True

    def get_fields(self) -> List[Dict[str, Any]]:
        """Get all fields"""
        return list(self.content["fields"])

    def get_field_count(self, exclude_separators: bool = False) -> int:
        """Get field count

        Args:
            exclude_separators: If True, excludes separator fields from count (default: False)

        Returns:
            Number of fields
        """
        if exclude_separators:
            return len([
                f for f in self.content["fields"]
                if f.get("fieldType") != "separator"
            ])
        return len(self.content["fields"])

    def has_required_fields(self) -> bool:
        """Check if form has required fields"""
        return any(f.get("required") for f in self.content["fields"])

    def get_required_fields(self) -> List[str]:
        """Get required field IDs"""
        return [
            f["fieldId"] for f in self.content["fields"] if f.get("required")
        ]
