"""
Base view class for all Yeria views
"""

import json
import copy
import math
import re
from typing import Dict, Any, Optional, List, Union
from abc import ABC

from ..types.models import (
    BaseViewConfig,
    ViewType,
    ValidationResult,
    ViewState,
    NavigationConfig,
    ProcessContext,
    ViewMetadata,
    create_validation_error,
)
from ..errors.exceptions import (
    ViewValidationError,
    NoProcessContextError,
    InvalidParameterError,
)
from typing import Dict, Any, Optional, List, Union
from ..utils.validators import (
    URLValidationConfig,
    validate_navigation_target,
    DEFAULT_URL_CONFIG,
)


class BaseView(ABC):
    """Abstract base for every Yeria SGUI view (Form, Reader, Card, Map, ...).

    Holds the state common to all views: identity (id / type / process_id),
    navigation (set_next / set_prev / set_entry / set_page), metadata, and the serialization
    (build / to_json) that produces the view's JSON description. Concrete views
    are created via the YeriaApp / YeriaUI factory methods, populated, then
    signed by their serialized output. Instances are mutable, per-request
    builders -- not singletons.

    This class is ABSTRACT and is never instantiated directly; use a concrete
    view subclass instead.
    """

    def __init__(self, config: Union[BaseViewConfig, Dict[str, Any]]):
        if isinstance(config, dict):
            config = self._dict_to_config(config)

        self.id: str = config.id
        self.type: ViewType = config.type
        self.content: Any = None
        self._state: ViewState = {}
        self._metadata: Optional[ViewMetadata] = config.metadata
        self._navigation: Optional[NavigationConfig] = None
        self._process_context: Optional[ProcessContext] = config.process_id and ProcessContext(
            process_id=config.process_id
        ) or None

    @staticmethod
    def _dict_to_config(data: Dict[str, Any]) -> BaseViewConfig:
        """Convertir un dictionnaire en BaseViewConfig"""
        from datetime import datetime

        # Gérer la metadata
        metadata = None
        if "metadata" in data:
            meta = data["metadata"]
            if isinstance(meta, dict):
                metadata = ViewMetadata(
                    version=meta.get("version", "1.0.0"),
                    created_at=meta.get("created_at", datetime.now()),
                    author=meta.get("author"),
                    tags=meta.get("tags"),
                )
            else:
                metadata = meta

        return BaseViewConfig(
            id=data["id"],
            type=data["type"],
            process_id=data.get("process_id"),
            metadata=metadata,
        )

    def _validate(self) -> ValidationResult:
        """Validate the view before serving"""
        errors: List[Any] = []
        warnings: List[Any] = []

        if not self.id or not self.id.strip():
            errors.append(create_validation_error("View ID is required"))

        if not self.type:
            errors.append(create_validation_error("View type is required"))

        if not self.content:
            errors.append(create_validation_error("View content is required"))

        # Type-specific validation
        if self.type == "Form":
            if (
                not self.content
                or not isinstance(self.content, dict)
                or "fields" not in self.content
                or not isinstance(self.content["fields"], list)
                or len(self.content["fields"]) == 0
            ):
                errors.append(
                    create_validation_error("Form must have at least one field")
                )
            else:
                # A form made only of rules and blank space is not a form.
                # `paragraph` is deliberately NOT excluded here: it at least
                # says something, and excluding it would refuse forms that
                # providers serve today.
                non_separator_fields = [
                    f for f in self.content["fields"]
                    if f.get("fieldType") not in ("separator", "spacer")
                ]
                if len(non_separator_fields) == 0:
                    errors.append(
                        create_validation_error(
                            "Form must have at least one non-separator field"
                        )
                    )

        elif self.type in ("ActionList", "ActionGrid", "IconGrid"):
            if (
                not self.content
                or not isinstance(self.content, dict)
                or "actions" not in self.content
                or not isinstance(self.content["actions"], list)
                or len(self.content["actions"]) == 0
            ):
                errors.append(
                    create_validation_error(
                        "Action views must have at least one action"
                    )
                )
            if self.type == "IconGrid":
                shape = self.content.get("shape") if isinstance(self.content, dict) else None
                if shape is not None and shape not in ("circle", "square"):
                    errors.append(
                        create_validation_error(
                            "IconGrid 'shape' must be 'circle' or 'square'"
                        )
                    )

        elif self.type == "Reader":
            if isinstance(self.content, dict):
                reader_content = self.content
                if not reader_content.get("title") or not reader_content.get("title", "").strip():
                    errors.append(
                        create_validation_error("Reader view must have a title")
                    )
                if (
                    not reader_content.get("elements")
                    or len(reader_content.get("elements", [])) == 0
                ):
                    errors.append(
                        create_validation_error(
                            "Reader view must contain at least one element"
                        )
                    )

        elif self.type == "Message":
            if isinstance(self.content, dict):
                message_content = self.content
                # Les trois textes ont des roles distincts : `title` nomme la
                # fenetre, `intro` est la premiere ligne — un sous-titre — et
                # `body` est ce que le message DIT. Un message sans corps n'a
                # rien a dire, d'ou l'exigence ; l'intro reste facultative.
                has_body = (
                    isinstance(message_content.get("body"), str)
                    and len(message_content.get("body", "").strip()) > 0
                )
                if not has_body:
                    errors.append(
                        create_validation_error("Message view must define a body")
                    )

                # Aucune action n'est exigee : une boite sans bouton declare se
                # ferme par un « OK » que le client dessine, comme une MsgBox
                # sans jeu de boutons.
            else:
                errors.append(create_validation_error("Message view content is invalid"))

        elif self.type == "Card":
            if isinstance(self.content, dict):
                card = self.content
                has_detail = (
                    (isinstance(card.get("description"), str) and len(card.get("description", "").strip()) > 0)
                    or (isinstance(card.get("stats"), list) and len(card.get("stats", [])) > 0)
                    or (isinstance(card.get("sections"), list) and len(card.get("sections", [])) > 0)
                )

                if not has_detail:
                    errors.append(
                        create_validation_error(
                            "Card view requires at least a description, stat, or section"
                        )
                    )
            else:
                errors.append(create_validation_error("Card view content is invalid"))

        elif self.type == "Carousel":
            if (
                not self.content
                or not isinstance(self.content, dict)
                or "slides" not in self.content
                or not isinstance(self.content["slides"], list)
                or len(self.content["slides"]) == 0
            ):
                errors.append(
                    create_validation_error("Carousel view must contain at least one slide")
                )

        elif self.type == "Timeline":
            if (
                not self.content
                or not isinstance(self.content, dict)
                or "items" not in self.content
                or not isinstance(self.content["items"], list)
                or len(self.content["items"]) == 0
            ):
                errors.append(
                    create_validation_error(
                        "Timeline view must contain at least one entry"
                    )
                )

        elif self.type == "Media":
            if (
                not self.content
                or not isinstance(self.content, dict)
                or "items" not in self.content
                or not isinstance(self.content["items"], list)
                or len(self.content["items"]) == 0
            ):
                errors.append(
                    create_validation_error(
                        "Media view must contain at least one resource"
                    )
                )

        elif self.type == "Map":
            if not self.content or not isinstance(self.content, dict):
                errors.append(create_validation_error("Map view content is required"))
            else:
                layers = self.content.get("layers") if isinstance(self.content.get("layers"), list) else []

                # unique layer ids
                seen_layer_ids = set()
                for l in layers:
                    if not isinstance(l, dict):
                        continue
                    lid = l.get("id")
                    if not isinstance(lid, str) or not lid.strip():
                        errors.append(create_validation_error("Map layer must have a non-empty id"))
                    elif lid in seen_layer_ids:
                        errors.append(create_validation_error(f'Duplicate map layer id: "{lid}"'))
                    else:
                        seen_layer_ids.add(lid)

                mode = "pick" if self.content.get("mode") == "pick" else "view"

                if mode == "pick":
                    pick = self.content.get("pick")
                    submit = pick.get("submitUrl") if isinstance(pick, dict) else None
                    if not isinstance(submit, str) or not submit.strip():
                        errors.append(create_validation_error("Map pick mode requires pick.submitUrl"))
                else:
                    def _drawable(l: dict) -> bool:
                        if l.get("visible") is False:
                            return False
                        t = l.get("type")
                        if t == "markers":
                            return isinstance(l.get("markers"), list) and len(l["markers"]) > 0
                        if t == "shapes":
                            return isinstance(l.get("shapes"), list) and len(l["shapes"]) > 0
                        if t == "heatmap":
                            return isinstance(l.get("points"), list) and len(l["points"]) > 0
                        if t == "tiles":
                            return isinstance(l.get("url"), str) and l["url"]
                        if t == "geojson":
                            return l.get("data") is not None
                        return False

                    has_drawable = any(_drawable(l) for l in layers if isinstance(l, dict))
                    empty_msg = self.content.get("emptyMessage")
                    has_empty = isinstance(empty_msg, str) and empty_msg.strip()
                    if not has_drawable and not has_empty:
                        errors.append(create_validation_error(
                            "Map view must contain at least one drawable layer or an emptyMessage"
                        ))

        elif self.type == "QRDisplay":
            if (
                not self.content
                or not isinstance(self.content, dict)
                or not self.content.get("qrImage")
                or not self.content.get("qrTitle")
                or not self.content.get("qrDescription")
            ):
                errors.append(
                    create_validation_error(
                        "QRDisplay view must have a QR code with image, title, and description"
                    )
                )

        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings if warnings else None,
        )

    @staticmethod
    def _strip_none(obj: Any) -> Any:
        """Recursively drop dict keys whose value is None.

        Mirrors JS ``JSON.stringify`` which omits ``undefined`` fields: the JS
        SDK builds objects with optional keys and lets stringify drop the unset
        ones, so its wire output never contains ``null``. Python builds the same
        objects with explicit ``None`` — stripping them keeps the Python payload
        structurally identical (transparent to the mobile renderer). ``False``,
        ``0`` and ``""`` are preserved; only ``None`` is removed.
        """
        if isinstance(obj, dict):
            return {k: BaseView._strip_none(v) for k, v in obj.items() if v is not None}
        if isinstance(obj, list):
            return [BaseView._strip_none(v) for v in obj]
        return obj

    def build(self) -> Dict[str, Any]:
        """Validate the view and return its UNSIGNED JSON description (the wire
        payload). This does NOT sign — signing is ``app.serve(view)``, which
        calls this internally. Named ``build`` to avoid colliding with that."""
        validation = self._validate()

        if not validation.is_valid:
            error_messages = [e.message for e in validation.errors]
            raise ViewValidationError(self.id, self.type, error_messages)

        result: Dict[str, Any] = {
            "id": self.id,
            "type": self.type,
            "content": self.content,
        }

        # Add process context if present
        if self._process_context:
            result["process"] = {
                "processId": self._process_context.process_id,
                "processName": self._process_context.process_name,
                "currentStep": self._process_context.current_step,
                "totalSteps": self._process_context.total_steps,
                "stepName": self._process_context.step_name,
                "canGoBack": self._process_context.can_go_back,
                "canSkip": self._process_context.can_skip,
                "metadata": self._process_context.metadata,
            }

        # Add metadata if present
        if self._metadata:
            result["metadata"] = {
                "version": self._metadata.version,
                "createdAt": self._metadata.created_at.isoformat(),
                "author": self._metadata.author,
                "tags": self._metadata.tags,
            }

        # Add state if present
        if self._state:
            result["state"] = self._state

        # Add navigation if present
        if self._navigation:
            result["nav"] = {
                "next": self._navigation.next,
                "prev": self._navigation.prev,
                "entry": self._navigation.entry,
                "page": self._navigation.page,
            }

        # `nan` et `±inf` n'ont pas de forme JSON : `json.dumps` ecrit `NaN`,
        # le JS ecrit `null`, et une charge utile signee qui porte l'un ou
        # l'autre est illisible par tout client. Les constructeurs refusent
        # la ou ils connaissent le champ ; ceci est le filet sous eux tous,
        # au seul point par lequel passe toute charge utile.
        non_finite = self._find_non_finite_number(result, "")
        if non_finite is not None:
            raise ViewValidationError(
                self.id, self.type, [f"payload contains a non-finite number at {non_finite}"]
            )

        # Drop None-valued keys so the payload matches the JS SDK, whose
        # JSON.stringify omits undefined fields (see _strip_none).
        return self._strip_none(result)

    @staticmethod
    def _find_non_finite_number(value: Any, path: str) -> Optional[str]:
        """Chemin du premier nombre non fini, ou None. `bool` est un `int`
        mais n'est pas un nombre ici."""
        if isinstance(value, bool):
            return None
        if isinstance(value, float):
            return None if math.isfinite(value) else (path or "payload")
        if isinstance(value, dict):
            for k, v in value.items():
                hit = BaseView._find_non_finite_number(v, f"{path}.{k}" if path else str(k))
                if hit is not None:
                    return hit
            return None
        if isinstance(value, (list, tuple)):
            for i, v in enumerate(value):
                hit = BaseView._find_non_finite_number(v, f"{path}[{i}]")
                if hit is not None:
                    return hit
        return None

    def to_json(self) -> Dict[str, Any]:
        """Return JSON representation of the view (delegates to build())"""
        return self.build()

    @classmethod
    def from_json_as(cls, expected_type: str, json_view: Dict[str, Any]) -> "BaseView":
        """Shared rehydration: reconstruct a typed view from a wire JSON payload
        (the output of ``to_json()``), bypassing the fluent constructor. Each
        concrete view exposes a thin ``from_json(json)`` calling this with its
        class + expected type; the type guard is the per-view check, and the
        instance is run through ``validate_view()`` before being returned.

        All serialisable state lives in ``content`` (no view overrides
        ``serve()``), so restoring ``content`` + the id/type is faithful for
        re-serving. Builder-only helpers are not restored.
        """
        if not isinstance(json_view, dict):
            raise InvalidParameterError("json", json_view, "from_json expects a plain object view payload")
        vid = json_view.get("id")
        if not isinstance(vid, str) or not vid.strip():
            raise InvalidParameterError("id", vid, "from_json requires a non-empty string id")
        if json_view.get("type") != expected_type:
            raise InvalidParameterError("type", json_view.get("type"), f'expected view type "{expected_type}"')
        if "content" not in json_view or json_view.get("content") is None:
            raise InvalidParameterError("content", json_view.get("content"), "from_json requires content")

        inst = cls.__new__(cls)  # bypass __init__ (like a shallow clone)
        inst.id = vid
        inst.type = json_view["type"]
        inst.content = json_view["content"]
        state = json_view.get("state")
        inst._state = state if isinstance(state, dict) else {}

        # Restore metadata / navigation / process so re-serving is faithful.
        meta = json_view.get("metadata")
        if isinstance(meta, dict):
            from datetime import datetime as _dt
            ca = meta.get("createdAt")
            try:
                created = _dt.fromisoformat(ca) if isinstance(ca, str) else (ca or _dt.now())
            except Exception:
                created = _dt.now()
            inst._metadata = ViewMetadata(
                version=meta.get("version", "1.0.0"),
                created_at=created,
                author=meta.get("author"),
                tags=meta.get("tags"),
            )
        else:
            inst._metadata = None

        nav = json_view.get("nav")
        # Every field of the config, `page` included. Listing three of the four
        # dropped the pagination position on the way back in, so re-serving a
        # rehydrated view silently lost the indicator and did not sign the same
        # as the payload it came from.
        inst._navigation = (
            NavigationConfig(
                next=nav.get("next"),
                prev=nav.get("prev"),
                entry=nav.get("entry"),
                page=nav.get("page"),
            )
            if isinstance(nav, dict)
            else None
        )

        proc = json_view.get("process")
        if isinstance(proc, dict) and proc.get("processId"):
            inst._process_context = ProcessContext(
                process_id=proc.get("processId"),
                process_name=proc.get("processName"),
                current_step=proc.get("currentStep"),
                total_steps=proc.get("totalSteps"),
                step_name=proc.get("stepName"),
                can_go_back=proc.get("canGoBack"),
                can_skip=proc.get("canSkip"),
            )
        else:
            inst._process_context = None

        validation = inst.validate_view()
        if not validation.is_valid:
            raise ViewValidationError(inst.id, inst.type, [e.message for e in validation.errors])
        return inst

    def set_state(self, key: str, value: Any) -> None:
        """Update view state"""
        self._state[key] = value

    def get_state(self, key: str) -> Any:
        """Get a value from state"""
        return self._state.get(key)

    def clone(self) -> "BaseView":
        """Clone the view using deep copy"""
        cloned = copy.deepcopy(self)
        return cloned

    def is_valid(self) -> bool:
        """Check if the view is valid"""
        return self._validate().is_valid

    def validate_view(self) -> ValidationResult:
        """Validate the view and return the result"""
        return self._validate()

    def get_validation_errors(self) -> List[str]:
        """Get validation errors"""
        return [e.message for e in self._validate().errors]

    def get_validation_warnings(self) -> List[str]:
        """Get validation warnings"""
        warnings = self._validate().warnings
        return [e.message for e in warnings] if warnings else []

    def update_metadata(self, metadata: Dict[str, Any]) -> None:
        """Update metadata"""
        if self._metadata:
            # Merge metadata
            if "version" in metadata:
                self._metadata.version = metadata["version"]
            if "created_at" in metadata or "createdAt" in metadata:
                created_at = metadata.get("created_at") or metadata.get("createdAt")
                if isinstance(created_at, str):
                    from datetime import datetime
                    self._metadata.created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            if "author" in metadata:
                self._metadata.author = metadata.get("author")
            if "tags" in metadata:
                self._metadata.tags = metadata.get("tags")
        else:
            # Create new metadata
            from datetime import datetime
            self._metadata = ViewMetadata(
                version=metadata.get("version", "1.0.0"),
                created_at=datetime.now(),
                author=metadata.get("author"),
                tags=metadata.get("tags"),
            )

    def get_metadata(self) -> Optional[ViewMetadata]:
        """Get metadata"""
        return self._metadata

    def _set_intro_text(self, field_name: str, value: str) -> "BaseView":
        """Protected helper to set intro/note text with strict validation"""
        if not value or not value.strip():
            raise InvalidParameterError(
                field_name, value, f"{field_name} text cannot be empty"
            )

        trimmed_value = value.strip()

        if isinstance(self.content, dict):
            self.content[field_name] = trimmed_value

        return self

    def _assert_navigation_target(
        self,
        field_name: str,
        target: str,
        *,
        allow_relative: bool = True,
        allow_view_id: bool = False,
    ) -> str:
        config = URLValidationConfig(
            allowed_domains=DEFAULT_URL_CONFIG.allowed_domains,
            allowed_protocols=list(DEFAULT_URL_CONFIG.allowed_protocols),
            block_private_ips=False,
            block_localhost=False,
            max_url_length=DEFAULT_URL_CONFIG.max_url_length,
        )
        trimmed = target.strip()
        validation = validate_navigation_target(
            trimmed,
            config,
            allow_relative=allow_relative,
            allow_view_id=allow_view_id,
        )

        if not validation.is_valid:
            error_messages = "; ".join([e.message for e in validation.errors])
            raise InvalidParameterError(
                field_name,
                target,
                f"Invalid navigation target: {error_messages}",
            )

        return trimmed

    def _assert_addressable_target(self, field_name: str, target: str) -> str:
        """A sequence target must be addressable: an absolute URL, or a path the
        client can resolve against the service base.

        A bare token (``step-two``) is refused. On the wire it is
        indistinguishable from a relative path, so the validator accepts it —
        but the client has no registry of view ids to resolve it against, and a
        provider writing one would get a silent 404 instead of an error.
        """
        trimmed = self._assert_navigation_target(
            field_name, target, allow_relative=True, allow_view_id=False
        )

        addressable = bool(re.match(r"^https?://", trimmed, re.IGNORECASE)) or "/" in trimmed
        if not addressable:
            raise InvalidParameterError(
                field_name,
                target,
                'Navigation target must be a URL or a path (e.g. "/orders/page/2"), '
                "not a bare view id",
            )

        return trimmed

    def set_next(self, url: str) -> "BaseView":
        """Next view of a paginated sequence — the client draws the control.

        A sibling, not a destination for the back gesture. Moving to it
        REPLACES the current view unless the view reached declares
        ``entry='push'``: without that, leafing through forty pages stacks
        forty screens and back becomes a tunnel.
        """
        target = self._assert_addressable_target("url", url)

        if not self._navigation:
            self._navigation = NavigationConfig()
        self._navigation.next = target
        return self

    def set_prev(self, url: str) -> "BaseView":
        """Previous view of a paginated sequence — the client draws the control.

        Symmetric with :meth:`set_next`. This is NOT where the back gesture
        leads: the client always keeps the view served by the service base URL
        at the bottom of the stack, and back walks down to it.
        """
        target = self._assert_addressable_target("url", url)

        if not self._navigation:
            self._navigation = NavigationConfig()
        self._navigation.prev = target
        return self

    def set_entry(self, entry: Union[str, int]) -> "BaseView":
        """How this view enters the client's navigation stack.

        ``'push'`` (default) stacks on top of the screen that led here, and
        back returns to it. ``'replace'`` takes that screen's place, so back
        skips over it.

        Declare ``replace`` on what acknowledges a completed action — the
        receipt of a submitted form — so the user cannot walk back onto a
        screen that has already done its work. Do NOT declare it on the next
        step of a wizard: step 2 replacing step 1 would make the assistant
        impossible to walk back up. The client cannot tell those apart, which
        is why the default stays ``push``.
        """
        if isinstance(entry, bool) or not isinstance(entry, int):
            if entry not in ("push", "replace"):
                raise InvalidParameterError(
                    "entry", entry, "entry must be 'push', 'replace', or an integer <= 1"
                )
        elif entry > 1:
            # Au-dessus de 1, rien de plus ne se dirait : empiler est empiler.
            # Refuse plutot qu'accepte en silence.
            raise InvalidParameterError(
                "entry",
                entry,
                "entry must be an integer <= 1 (1 = push, 0 = replace, -n = deeper recoil)",
            )

        if not self._navigation:
            self._navigation = NavigationConfig()
        self._navigation.entry = entry
        return self

    def set_page(self, current: int, total: Optional[int] = None) -> "BaseView":
        """State where this view sits in its sequence.

        Le client dessine un indicateur de position a cote des controles
        ``next`` / ``prev``. Des NOMBRES, pas une phrase : le client les met en
        forme dans la langue du lecteur. Omettre ``total`` quand la sequence
        n'a pas de fin connue — le client n'affiche alors que la position.

        Purement informatif : le deplacement passe toujours par ``set_next`` /
        ``set_prev``.
        """
        if isinstance(current, bool) or not isinstance(current, int) or current < 1:
            raise InvalidParameterError(
                "current", current, "current must be an integer >= 1"
            )
        if total is not None:
            if isinstance(total, bool) or not isinstance(total, int) or total < 1:
                raise InvalidParameterError(
                    "total", total, "total must be an integer >= 1"
                )
            if total < current:
                raise InvalidParameterError(
                    "total", total, "total cannot be smaller than current"
                )

        if not self._navigation:
            self._navigation = NavigationConfig()
        self._navigation.page = (
            {"current": current} if total is None else {"current": current, "total": total}
        )
        return self

    def set_process(
        self, process_id: str, context: Optional[Dict[str, Any]] = None
    ) -> "BaseView":
        """Set process context for this view"""
        self._process_context = ProcessContext(
            process_id=process_id,
            process_name=context.get("processName") if context else None,
            current_step=context.get("currentStep") if context else None,
            total_steps=context.get("totalSteps") if context else None,
            step_name=context.get("stepName") if context else None,
            can_go_back=context.get("canGoBack") if context else None,
            can_skip=context.get("canSkip") if context else None,
            metadata=context.get("metadata") if context else None,
        )
        return self

    def get_process_context(self) -> Optional[ProcessContext]:
        """Get process context"""
        return self._process_context

    def get_process_id(self) -> Optional[str]:
        """Get process ID (shortcut)"""
        return self._process_context.process_id if self._process_context else None

    def has_process(self) -> bool:
        """Check if this view is part of a process"""
        return self._process_context is not None

    def update_process_context(self, updates: Dict[str, Any]) -> "BaseView":
        """Update process context"""
        if not self._process_context:
            raise NoProcessContextError(self.id, "update")

        # Update process context
        if "processName" in updates:
            self._process_context.process_name = updates["processName"]
        if "currentStep" in updates:
            self._process_context.current_step = updates["currentStep"]
        if "totalSteps" in updates:
            self._process_context.total_steps = updates["totalSteps"]
        if "stepName" in updates:
            self._process_context.step_name = updates["stepName"]
        if "canGoBack" in updates:
            self._process_context.can_go_back = updates["canGoBack"]
        if "canSkip" in updates:
            self._process_context.can_skip = updates["canSkip"]
        if "metadata" in updates:
            self._process_context.metadata = updates["metadata"]

        return self

    def destroy(self) -> None:
        """Clean up view resources"""
        self._state = {}

