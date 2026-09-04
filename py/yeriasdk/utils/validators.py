"""
Validation utilities for Yeria SDK
"""

import math
import re
import json
from typing import Dict, Any, List, Optional, Callable, Pattern
from urllib.parse import urlparse
from datetime import datetime

from ..types.models import (
    FieldValidation,
    FormFieldParams,
    ValidationResult,
    ValidationError,
    create_validation_error,
)
# InvalidParameterError is not used in this file, removed import


# Un chemin de media est RELATIF a la base du service du fournisseur.
#
# Le renderer le resout contre cette base et refuse tout ce qui est absolu :
# `http(s)://` et `//host` (aucun hote externe arbitraire, pas de clair),
# `file://` (lirait les fichiers de l'appareil) et `data:` (charge utile
# inline non fiable). Il refuse en n'affichant RIEN, la pire facon pour un
# fournisseur d'apprendre la regle ; les SDK refusent donc ici, a la
# construction de la vue. Un CDN se joint en repondant a l'URL relative par
# une 3xx.
#
# La regle est « ni schema, ni chemin reseau », pas une liste de schemas :
# `javascript:`, `mailto:` ou un schema auquel personne n'a pense s'eloignent
# de la base du service tout autant. Et un antislash vaut un slash, parce que
# le renderer web resout selon la semantique WHATWG, ou `\\hote/a.jpg` et
# `https:\\hote` sont absolus.
_SCHEME_PREFIX = re.compile(r"^[a-z][a-z0-9+.-]*:")
# WHATWG retire les controles C0 en tete et en queue et TOUT tab ou saut de
# ligne avant d'analyser : `\x01https://hote` et `ht\ntps://hote` sont absolus
# dans un navigateur quand un simple prefixe les lit relatifs. Un chemin de
# media ne porte jamais legitimement un caractere de controle : refus net.
_CONTROL_CHARACTER = re.compile(r"[\x00-\x1f\x7f]")

MEDIA_FIELD_TYPES = ("photo", "file", "audio", "video")


def is_relative_asset_path(value: str) -> bool:
    if _CONTROL_CHARACTER.search(value):
        return False
    trimmed = value.strip().lower().replace("\\", "/")
    if not trimmed:
        return False
    if trimmed.startswith("//"):
        return False
    return _SCHEME_PREFIX.match(trimmed) is None


def validate_stored_media_paths(field_type: str, field_id: str, value: Any) -> list:
    """La regle du chemin de media stocke, isolee pour que chaque chemin par
    lequel passe une ``value`` la fasse tourner : ``add_field`` a la
    construction, et ``update_field`` — donc ``set_field_value`` et
    ``inject_data`` — quand la valeur est posee apres coup. Rien a dire pour
    un champ qui n'est pas un media, ou qui n'a pas de valeur."""
    errors: list = []
    if field_type not in MEDIA_FIELD_TYPES or value is None:
        return errors
    paths = value if isinstance(value, list) else [value]
    for path in paths:
        if not isinstance(path, str) or not is_relative_asset_path(path):
            errors.append(
                create_validation_error(
                    f"Stored media path '{path}' must be relative to the "
                    "service base (a scheme, a //host and their backslash "
                    "forms are refused)",
                    field_id,
                )
            )
    return errors


def _is_finite_number(value: Any) -> bool:
    """Un nombre fini, booleens exclus — l'equivalent de `Number.isFinite`."""
    if isinstance(value, bool):
        return False
    return isinstance(value, (int, float)) and math.isfinite(value)


class DataSanitizer:
    """Sanitizes user input to prevent injection attacks"""

    @staticmethod
    def sanitize_input(input_str: str, allow_html: bool = False) -> str:
        """Sanitize user input"""
        if not isinstance(input_str, str):
            return ""

        sanitized = input_str.strip()

        # Remove null bytes
        sanitized = sanitized.replace("\0", "")

        # Normalize Unicode (Python's unicodedata.normalize)
        try:
            import unicodedata

            sanitized = unicodedata.normalize("NFC", sanitized)
        except Exception:
            pass  # Fallback if unicodedata not available

        # HTML encoding unless explicitly allowed
        if not allow_html:
            sanitized = (
                sanitized.replace("&", "&amp;")  # Must be first
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace('"', "&quot;")
                .replace("'", "&#x27;")
                .replace("/", "&#x2F;")
            )

        return sanitized

    @staticmethod
    def validate_coordinates(lat: float, lon: float) -> bool:
        """Validate GPS coordinates"""
        return -90 <= lat <= 90 and -180 <= lon <= 180

    @staticmethod
    def validate_email(email: str) -> bool:
        """Validate email format"""
        email_regex = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
        return bool(email_regex.match(email))

    @staticmethod
    def validate_url(url: str) -> bool:
        """Valide une URL que le client pourra etre amene a ouvrir.

        Seuls ``http`` et ``https`` sont acceptes. La regle etait auparavant
        implicite — un schema et une localisation reseau — ce qui refusait bien
        ``javascript:`` mais par accident, et acceptait ``ftp://``. Le SDK JS,
        lui, se contentait de ``new URL(...)`` et laissait passer
        ``javascript:``. Les deux enoncent desormais la meme regle.
        """
        try:
            result = urlparse(url)
            return result.scheme in ("http", "https") and bool(result.netloc)
        except Exception:
            return False

    @staticmethod
    def validate_phone_number(phone: str) -> bool:
        """Validate phone number format"""
        phone_regex = re.compile(r"^[\+]?[1-9][\d]{0,15}$")
        return bool(phone_regex.match(phone.replace(" ", "")))

    @staticmethod
    def validate_date(date_string: str) -> bool:
        """Validate ISO 8601 date format (YYYY-MM-DD)"""
        date_regex = re.compile(r"^\d{4}-\d{2}-\d{2}$")
        if not date_regex.match(date_string):
            return False

        try:
            date_obj = datetime.strptime(date_string, "%Y-%m-%d")
            return date_obj.strftime("%Y-%m-%d") == date_string
        except ValueError:
            return False

    @staticmethod
    def validate_number(value: Any) -> bool:
        """Valide une valeur numerique : un nombre FINI, et pas un booleen.

        Deux ecarts avec le SDK JS, qui refusait deja les deux cas. ``inf`` et
        ``-inf`` passaient : ``json.dumps`` les ecrit ``Infinity``, que JSON
        n'admet pas et que ``JSON.parse`` refuse — un payload signe qu'aucun
        client ne peut relire. Et ``True`` passait pour un nombre, ``bool``
        etant une sous-classe de ``int`` en Python.
        """
        if isinstance(value, bool):
            return False
        return isinstance(value, (int, float)) and math.isfinite(value)

    @staticmethod
    def validate_plus_code(plus_code: str) -> bool:
        """Validate Plus Code format"""
        plus_code_regex = re.compile(
            r"^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,3}$"
        )
        return bool(plus_code_regex.match(plus_code.replace(" ", "").upper()))

    @staticmethod
    def validate_password(password: str, min_length: int = 8) -> Dict[str, Any]:
        """Validate password strength"""
        if len(password) < min_length:
            return {
                "valid": False,
                "error": f"Password must be at least {min_length} characters long",
            }

        # Check for at least one lowercase letter
        if not re.search(r"[a-z]", password):
            return {
                "valid": False,
                "error": "Password must contain at least one lowercase letter",
            }

        # Check for at least one uppercase letter
        if not re.search(r"[A-Z]", password):
            return {
                "valid": False,
                "error": "Password must contain at least one uppercase letter",
            }

        # Check for at least one digit
        if not re.search(r"\d", password):
            return {"valid": False, "error": "Password must contain at least one digit"}

        return {"valid": True}


class FieldValidator:
    """Validates form field configurations"""

    @staticmethod
    def validate_field(
        field_type: str,
        field_id: str,
        field_label: str,
        params: Optional[FormFieldParams] = None,
    ) -> ValidationResult:
        """Validate a form field configuration"""
        errors: List[ValidationError] = []
        warnings: List[ValidationError] = []

        # Basic validation
        if not field_id or not field_id.strip():
            errors.append(create_validation_error("Field ID is required", field_id))

        # Separator fields don't require a label
        # Display-only fields (separator, paragraph, spacer) carry no label.
        if field_type not in ("separator", "paragraph", "spacer") and (
            not field_label or not field_label.strip()
        ):
            errors.append(create_validation_error("Field label is required", field_id))

        if not field_type or not field_type.strip():
            errors.append(create_validation_error("Field type is required", field_id))

        # Skip validation rules for display-only fields (visual elements only)
        if field_type in ("separator", "paragraph", "spacer"):
            return ValidationResult(
                is_valid=len(errors) == 0,
                errors=errors,
                warnings=warnings
            )

        # Parameter validation
        if params:
            # Length validation
            if params.min_length is not None and params.min_length < 0:
                errors.append(
                    create_validation_error("minLength must be non-negative", field_id)
                )

            if params.max_length is not None and params.max_length < 0:
                errors.append(
                    create_validation_error("maxLength must be non-negative", field_id)
                )

            if (
                params.min_length is not None
                and params.max_length is not None
                and params.min_length > params.max_length
            ):
                errors.append(
                    create_validation_error(
                        "minLength cannot be greater than maxLength", field_id
                    )
                )

            # Numeric value validation
            if (
                params.min is not None
                and params.max is not None
                and params.min > params.max
            ):
                errors.append(
                    create_validation_error(
                        "min value cannot be greater than max value", field_id
                    )
                )

            # Options validation for select fields
            if params.options and (
                not isinstance(params.options, list) or len(params.options) == 0
            ):
                errors.append(
                    create_validation_error(
                        "Options must be a non-empty array for select fields", field_id
                    )
                )

            # MIME type validation
            if params.accept and (
                not isinstance(params.accept, list) or len(params.accept) == 0
            ):
                errors.append(
                    create_validation_error(
                        "Accept must be a non-empty array for file fields", field_id
                    )
                )

            # Multi-capture validation (photo / file / audio / video)
            if params.max_count is not None:
                # bool is an int subclass in Python — reject it explicitly, since
                # passing the `multiple` flag here by mistake is the likely slip.
                if (
                    isinstance(params.max_count, bool)
                    or not isinstance(params.max_count, int)
                    or params.max_count < 1
                ):
                    errors.append(
                        create_validation_error(
                            "maxCount must be a positive integer", field_id
                        )
                    )
                elif params.max_count > 1 and params.multiple is not True:
                    warnings.append(
                        create_validation_error(
                            "maxCount is ignored unless multiple is true", field_id
                        )
                    )

            # Dependencies validation
            if params.dependencies and (
                not isinstance(params.dependencies, list)
                or any(not dep or not dep.strip() for dep in params.dependencies)
            ):
                errors.append(
                    create_validation_error(
                        "Dependencies must be a non-empty array of valid field IDs",
                        field_id,
                    )
                )

        # Un chemin de media stocke doit etre relatif a la base du service.
        if params:
            errors.extend(validate_stored_media_paths(field_type, field_id, params.value))

        # Type-specific validation
        if field_type == "email":
            if params and params.value and not DataSanitizer.validate_email(
                str(params.value)
            ):
                errors.append(
                    create_validation_error("Invalid email format", field_id)
                )

        elif field_type == "url":
            if params and params.value and not DataSanitizer.validate_url(
                str(params.value)
            ):
                errors.append(create_validation_error("Invalid URL format", field_id))

        elif field_type == "phone":
            if params and params.value and not DataSanitizer.validate_phone_number(
                str(params.value)
            ):
                errors.append(
                    create_validation_error("Invalid phone number format", field_id)
                )

        elif field_type == "gps":
            if params and params.value:
                try:
                    coords = json.loads(str(params.value))
                    if not DataSanitizer.validate_coordinates(
                        coords.get("lat"), coords.get("lon")
                    ):
                        errors.append(
                            create_validation_error("Invalid GPS coordinates", field_id)
                        )
                except Exception:
                    errors.append(
                        create_validation_error(
                            "Invalid GPS coordinates format", field_id
                        )
                    )

        elif field_type == "password":
            if params and params.min_length is not None and params.min_length < 8:
                warnings.append(
                    create_validation_error(
                        "Password minimum length should be at least 8 characters for security",
                        field_id,
                    )
                )
            if params and params.value:
                password_result = DataSanitizer.validate_password(
                    str(params.value), params.min_length or 8
                )
                if not password_result.get("valid") and password_result.get("error"):
                    errors.append(
                        create_validation_error(
                            password_result["error"], field_id
                        )
                    )

        elif field_type == "number":
            if params and params.value is not None:
                if not DataSanitizer.validate_number(params.value):
                    errors.append(
                        create_validation_error("Invalid number value", field_id)
                    )
            if params and params.min is not None:
                if not DataSanitizer.validate_number(params.min):
                    errors.append(create_validation_error("Invalid min value", field_id))
            if params and params.max is not None:
                if not DataSanitizer.validate_number(params.max):
                    errors.append(create_validation_error("Invalid max value", field_id))

        elif field_type == "date":
            if params and params.value and isinstance(params.value, str):
                if not DataSanitizer.validate_date(params.value):
                    errors.append(
                        create_validation_error(
                            "Invalid date format (expected YYYY-MM-DD)", field_id
                        )
                    )
            if params and params.min_date and isinstance(params.min_date, str):
                if not DataSanitizer.validate_date(params.min_date):
                    errors.append(
                        create_validation_error(
                            "Invalid minDate format (expected YYYY-MM-DD)", field_id
                        )
                    )
            if params and params.max_date and isinstance(params.max_date, str):
                if not DataSanitizer.validate_date(params.max_date):
                    errors.append(
                        create_validation_error(
                            "Invalid maxDate format (expected YYYY-MM-DD)", field_id
                        )
                    )
            # Validate date range logic
            if (
                params
                and params.min_date
                and params.max_date
                and isinstance(params.min_date, str)
                and isinstance(params.max_date, str)
            ):
                min_date = datetime.strptime(params.min_date, "%Y-%m-%d")
                max_date = datetime.strptime(params.max_date, "%Y-%m-%d")
                if min_date > max_date:
                    errors.append(
                        create_validation_error(
                            "minDate cannot be after maxDate", field_id
                        )
                    )

        elif field_type == "pluscode":
            if params and params.value and isinstance(params.value, str):
                if not DataSanitizer.validate_plus_code(params.value):
                    errors.append(
                        create_validation_error(
                            "Invalid Plus Code format (expected format: 8FVC9G8F+6W)",
                            field_id,
                        )
                    )

        elif field_type == "textarea":
            if params and params.max_length and params.max_length < 10:
                warnings.append(
                    create_validation_error(
                        "Textarea maxLength is very small, consider using text field instead",
                        field_id,
                    )
                )

        elif field_type == "checkbox":
            if params and params.value is not None and not isinstance(
                params.value, bool
            ):
                errors.append(
                    create_validation_error("Checkbox value must be boolean", field_id)
                )


        elif field_type == "select":

            if not params or not params.options or len(params.options) == 0:
                errors.append(

                    create_validation_error("Select fields must have options", field_id)

                )

            # Validate option structure

            if params and params.options and isinstance(params.options, list):

                for index, option in enumerate(params.options):

                    # ✅ CORRECTION: Accepter à la fois dict et objets FormFieldOption

                    if isinstance(option, dict):

                        # C'est un dictionnaire

                        if "label" not in option or "value" not in option:
                            errors.append(

                                create_validation_error(

                                    f"Option at index {index} must have 'label' and 'value' properties",

                                    field_id,

                                )

                            )

                    elif hasattr(option, 'label') and hasattr(option, 'value'):

                        # C'est un objet FormFieldOption (ou similaire)

                        if not option.label or not option.value:
                            errors.append(

                                create_validation_error(

                                    f"Option at index {index} must have non-empty 'label' and 'value'",

                                    field_id,

                                )

                            )

                    else:

                        errors.append(

                            create_validation_error(

                                f"Option at index {index} must be an object with label and value",

                                field_id,

                            )

                        )

        elif field_type in ("file", "photo"):
            if not params or not params.accept or len(params.accept) == 0:
                errors.append(
                    create_validation_error(
                        "File fields must specify accepted types", field_id
                    )
                )
            # Validate file format specifications
            if params and params.accept and isinstance(params.accept, list):
                for index, format_str in enumerate(params.accept):
                    if not isinstance(format_str, str) or not format_str.strip():
                        errors.append(
                            create_validation_error(
                                f"File format at index {index} must be a non-empty string",
                                field_id,
                            )
                        )

        elif field_type in ("audio", "video"):
            if not params or not params.accept or len(params.accept) == 0:
                errors.append(
                    create_validation_error(
                        "Recording fields must specify accepted types", field_id
                    )
                )

            # Duration is what bounds the upload size. Video can realistically
            # exceed a provider's request body limit, so there it is mandatory;
            # for audio a missing bound is only worth a warning.
            max_duration = params.max_duration if params else None
            if max_duration is None:
                if field_type == "video":
                    errors.append(
                        create_validation_error(
                            "Video fields must specify maxDuration (seconds) — "
                            "it is what bounds the upload size",
                            field_id,
                        )
                    )
                else:
                    warnings.append(
                        create_validation_error(
                            "Audio field has no maxDuration; a recording can then "
                            "grow unbounded",
                            field_id,
                        )
                    )
            elif not _is_finite_number(max_duration) or max_duration <= 0:
                errors.append(
                    create_validation_error(
                        "maxDuration must be a positive number of seconds", field_id
                    )
                )

            min_duration = params.min_duration if params else None
            if min_duration is not None:
                if not _is_finite_number(min_duration) or min_duration < 0:
                    errors.append(
                        create_validation_error(
                            "minDuration must be a non-negative number of seconds",
                            field_id,
                        )
                    )
                elif max_duration is not None and min_duration > max_duration:
                    errors.append(
                        create_validation_error(
                            "minDuration cannot be greater than maxDuration", field_id
                        )
                    )

            if params and params.source is not None and params.source not in (
                "record",
                "library",
                "both",
            ):
                errors.append(
                    create_validation_error(
                        f"Invalid source '{params.source}' "
                        "(expected 'record', 'library' or 'both')",
                        field_id,
                    )
                )

            if params and params.max_size is not None and (
                not _is_finite_number(params.max_size) or params.max_size <= 0
            ):
                errors.append(
                    create_validation_error(
                        "maxSize must be a positive number of bytes", field_id
                    )
                )

            if params and params.quality is not None:
                if field_type == "audio":
                    warnings.append(
                        create_validation_error(
                            "quality only applies to video fields and is ignored here",
                            field_id,
                        )
                    )
                elif params.quality not in ("low", "medium", "high"):
                    errors.append(
                        create_validation_error(
                            f"Invalid quality '{params.quality}' "
                            "(expected 'low', 'medium' or 'high')",
                            field_id,
                        )
                    )

        elif field_type == "hidden":
            if params and (params.value is None or params.value == ""):
                errors.append(
                    create_validation_error("Hidden fields must have a value", field_id)
                )

        elif field_type != "text":
            warnings.append(
                create_validation_error(f"Unknown field type: {field_type}", field_id)
            )

        # Warnings
        if len(field_id) > 50:
            warnings.append(
                create_validation_error(
                    "Field ID is quite long, consider using a shorter identifier",
                    field_id,
                )
            )

        if len(field_label) > 100:
            warnings.append(
                create_validation_error(
                    "Field label is quite long, consider using a shorter label", field_id
                )
            )

        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings if warnings else None,
        )


class FormValidator:
    """Validates form data against field validations"""

    @staticmethod
    def validate_form_data(
        form_data: Dict[str, Any],
        field_validations: Dict[str, FieldValidation],
    ) -> ValidationResult:
        """Validate form data against field validations"""
        errors: List[ValidationError] = []
        warnings: List[ValidationError] = []

        for field_id, validation in field_validations.items():
            value = form_data.get(field_id)

            # Required field validation
            if validation.required and (value is None or value == ""):
                errors.append(
                    create_validation_error(f"Field '{field_id}' is required", field_id)
                )
                continue

            # Dependencies validation
            if validation.dependencies:
                for dependency in validation.dependencies:
                    if not form_data.get(dependency):
                        errors.append(
                            create_validation_error(
                                f"Field '{field_id}' depends on '{dependency}' which is not filled",
                                field_id,
                            )
                        )
                        break

            # Conditional validation
            if validation.conditional and not validation.conditional(form_data):
                continue  # Skip validation if condition is not met

            # Pattern validation
            if validation.pattern and isinstance(value, str):
                if not validation.pattern.match(value):
                    errors.append(
                        create_validation_error(
                            f"Field '{field_id}' does not match required pattern",
                            field_id,
                        )
                    )

            # Length validation
            if isinstance(value, str):
                if (
                    validation.min_length is not None
                    and len(value) < validation.min_length
                ):
                    errors.append(
                        create_validation_error(
                            f"Field '{field_id}' must be at least {validation.min_length} characters long",
                            field_id,
                        )
                    )

                if (
                    validation.max_length is not None
                    and len(value) > validation.max_length
                ):
                    errors.append(
                        create_validation_error(
                            f"Field '{field_id}' must be at most {validation.max_length} characters long",
                            field_id,
                        )
                    )

            # Numeric value validation
            if isinstance(value, (int, float)):
                if validation.min is not None and value < validation.min:
                    errors.append(
                        create_validation_error(
                            f"Field '{field_id}' must be at least {validation.min}",
                            field_id,
                        )
                    )

                if validation.max is not None and value > validation.max:
                    errors.append(
                        create_validation_error(
                            f"Field '{field_id}' must be at most {validation.max}",
                            field_id,
                        )
                    )

            # Custom validation
            if validation.custom_validator:
                try:
                    result = validation.custom_validator(value)
                    if isinstance(result, str):
                        errors.append(
                            create_validation_error(
                                f"Field '{field_id}': {result}", field_id
                            )
                        )
                    elif not result:
                        errors.append(
                            create_validation_error(
                                f"Field '{field_id}' failed custom validation", field_id
                            )
                        )
                except Exception as error:
                    error_msg = (
                        str(error) if isinstance(error, Exception) else "Unknown error"
                    )
                    errors.append(
                        create_validation_error(
                            f"Field '{field_id}' custom validation error: {error_msg}",
                            field_id,
                        )
                    )

        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings if warnings else None,
        )


# URL validation configuration
class URLValidationConfig:
    """Configuration for secure URL validation"""

    def __init__(
        self,
        allowed_domains: Optional[List[str]] = None,
        allowed_protocols: Optional[List[str]] = None,
        block_private_ips: bool = True,
        block_localhost: bool = True,
        max_url_length: Optional[int] = None,
    ):
        self.allowed_domains = allowed_domains or []
        self.allowed_protocols = allowed_protocols or ["https:"]
        self.block_private_ips = block_private_ips
        self.block_localhost = block_localhost
        self.max_url_length = max_url_length


DEFAULT_URL_CONFIG = URLValidationConfig(
    allowed_protocols=["https:"],
    block_private_ips=True,
    block_localhost=True,
    max_url_length=2048,
)


def validate_submission_url(
    url: str, config: Optional[URLValidationConfig] = None
) -> ValidationResult:
    """Validate a submission URL securely"""
    if config is None:
        config = DEFAULT_URL_CONFIG

    errors: List[ValidationError] = []
    warnings: List[ValidationError] = []

    try:
        parsed = urlparse(url)

        # 1. Length validation
        if config.max_url_length and len(url) > config.max_url_length:
            errors.append(
                create_validation_error(
                    f"URL too long (max {config.max_url_length} characters)"
                )
            )

        # 2. Protocol validation
        allowed_protocols = config.allowed_protocols or ["https:", "http:"]
        if parsed.scheme and f"{parsed.scheme}:" not in allowed_protocols:
            errors.append(
                create_validation_error(
                    f"Protocol '{parsed.scheme}:' not allowed. Allowed: {', '.join(allowed_protocols)}"
                )
            )

        # 3. Block private IPs
        if config.block_private_ips:
            hostname = parsed.hostname or ""
            private_ip_patterns = [
                re.compile(r"^10\."),
                re.compile(r"^172\.(1[6-9]|2[0-9]|3[0-1])\."),
                re.compile(r"^192\.168\."),
                re.compile(r"^127\."),
                re.compile(r"^169\.254\."),
                re.compile(r"^fc00:"),
                re.compile(r"^fe80:"),
            ]

            if any(pattern.match(hostname) for pattern in private_ip_patterns):
                errors.append(
                    create_validation_error(
                        "Private/local IP addresses are not allowed"
                    )
                )

        # 4. Block localhost
        if config.block_localhost:
            hostname = parsed.hostname or ""
            if hostname in ("localhost", "127.0.0.1"):
                errors.append(create_validation_error("Localhost is not allowed"))

        # 5. Allowed domains validation
        if config.allowed_domains and len(config.allowed_domains) > 0:
            hostname = (parsed.hostname or "").lower()
            is_allowed = any(
                hostname == domain.lower() or hostname.endswith("." + domain.lower())
                for domain in config.allowed_domains
            )

            if not is_allowed:
                errors.append(
                    create_validation_error(
                        f"Domain '{hostname}' not in allowed list: {', '.join(config.allowed_domains)}"
                    )
                )

        # 6. Dangerous ports validation
        dangerous_ports = [21, 22, 23, 25, 53, 80, 110, 143, 993, 995, 3306, 5432, 6379, 27017]
        if parsed.port and parsed.port in dangerous_ports:
            warnings.append(
                create_validation_error(
                    f"Using potentially dangerous port: {parsed.port}"
                )
            )

        # 7. Suspicious patterns validation
        suspicious_patterns = [
            re.compile(r"\.\."),  # Directory traversal
            re.compile(r"javascript:", re.IGNORECASE),  # JavaScript protocol
            re.compile(r"data:", re.IGNORECASE),  # Data URLs
            re.compile(r"vbscript:", re.IGNORECASE),  # VBScript protocol
            re.compile(r"file:", re.IGNORECASE),  # File protocol
        ]

        if any(pattern.search(url) for pattern in suspicious_patterns):
            errors.append(
                create_validation_error("URL contains suspicious patterns")
            )

    except Exception:
        errors.append(create_validation_error("Invalid URL format"))

    return ValidationResult(
        is_valid=len(errors) == 0,
        errors=errors,
        warnings=warnings if warnings else None,
    )


def validate_navigation_target(
    target: str,
    config: Optional[URLValidationConfig] = None,
    *,
    allow_relative: bool = True,
    allow_view_id: bool = False,
) -> ValidationResult:
    """Validate a provider navigation target.

    Accepts secure absolute URLs, safe relative paths, and optional view IDs.
    """
    if config is None:
        config = URLValidationConfig(
            allowed_domains=DEFAULT_URL_CONFIG.allowed_domains,
            allowed_protocols=list(DEFAULT_URL_CONFIG.allowed_protocols),
            block_private_ips=DEFAULT_URL_CONFIG.block_private_ips,
            block_localhost=DEFAULT_URL_CONFIG.block_localhost,
            max_url_length=DEFAULT_URL_CONFIG.max_url_length,
        )

    errors: List[ValidationError] = []
    warnings: List[ValidationError] = []
    trimmed = target.strip()

    if not trimmed:
        errors.append(create_validation_error("Navigation target cannot be empty"))
        return ValidationResult(is_valid=False, errors=errors, warnings=None)

    if config.max_url_length and len(trimmed) > config.max_url_length:
        errors.append(
            create_validation_error(
                f"URL too long (max {config.max_url_length} characters)"
            )
        )

    suspicious_patterns = [
        re.compile(r"\.\."),
        re.compile(r"javascript:", re.IGNORECASE),
        re.compile(r"data:", re.IGNORECASE),
        re.compile(r"vbscript:", re.IGNORECASE),
        re.compile(r"file:", re.IGNORECASE),
        re.compile(r"[\x00-\x1F\x7F]"),
    ]
    if any(pattern.search(trimmed) for pattern in suspicious_patterns):
        errors.append(create_validation_error("URL contains suspicious patterns"))

    if re.search(r"\s", trimmed):
        errors.append(create_validation_error("Navigation target cannot contain whitespace"))

    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", trimmed):
        absolute_validation = validate_submission_url(trimmed, config)
        return ValidationResult(
            is_valid=len(errors) == 0 and absolute_validation.is_valid,
            errors=[*errors, *absolute_validation.errors],
            warnings=absolute_validation.warnings or (warnings if warnings else None),
        )

    if trimmed.startswith("//"):
        errors.append(create_validation_error("Protocol-relative URLs are not allowed"))

    looks_like_path = (
        trimmed.startswith("/")
        or trimmed.startswith("?")
        or trimmed.startswith("#")
        or "/" in trimmed
    )
    safe_relative_token = bool(re.fullmatch(r"[A-Za-z0-9._~\-]+", trimmed))
    is_accepted = (
        (allow_relative and looks_like_path)
        or (allow_view_id and safe_relative_token)
        or (allow_relative and safe_relative_token)
    )

    if not is_accepted:
        errors.append(
            create_validation_error(
                "Navigation target must be an absolute https/http URL, a safe relative path, or an allowed viewId"
            )
        )

    return ValidationResult(
        is_valid=len(errors) == 0,
        errors=errors,
        warnings=warnings if warnings else None,
    )

