"""
IconGridView - App-launcher style grid: square/circle image tiles with a
caption under each. Same action model + navigation as ActionGrid; only the
rendering differs. The mobile renderer shows image + title (+ optional badge);
`desc` is intentionally not rendered.
"""

from typing import Optional
from datetime import datetime

from .base_action_view import BaseActionView
from ..errors.exceptions import InvalidParameterError


class IconGridView(BaseActionView):
    """Builds an SGUI ``IconGrid`` view — app-launcher style grid. Each action
    is a square or circle image tile (from its ``thumbnail``) with the
    ``title`` caption underneath. Same action model + navigation as ActionGrid;
    only the rendering differs (``desc`` is not rendered).

    Builder methods: ``set_title``, ``set_intro``, ``set_shape``
    ('circle'|'square'), ``set_columns`` (2-6), ``set_spacing``, ``add_icon``
    (ergonomic tile: image + badge first), plus the inherited action family
    (``add_action``, ``remove_action``, ``update_action``, ``has_actions``),
    overridden here to keep the serialized ``content['actions']`` in sync.

    Extends ``BaseActionView``. Created via the YeriaApp/YeriaUI factory,
    populated with these builders, then serialized and signed into a v3
    envelope by ``serve()``.
    """
    @classmethod
    def from_json(cls, json_view):
        """Rehydrate a IconGrid view from a wire JSON payload."""
        return cls.from_json_as('IconGrid', json_view)


    def __init__(self, view_id: str, title: str, process_id: Optional[str] = None):
        super().__init__(
            {
                "id": view_id,
                "type": "IconGrid",
                "process_id": process_id,
                "metadata": {
                    "version": "1.0.0",
                    "created_at": datetime.now(),
                },
            }
        )

        self.content = {
            "title": title,
            "shape": "circle",
            "columns": 4,
            "spacing": 12,
            "actions": self._actions,  # Reference to actions from BaseActionView
        }

    def set_title(self, title: str) -> "IconGridView":
        """Set the icon grid title"""
        self.content["title"] = title
        return self

    def set_intro(self, intro: str) -> "IconGridView":
        """Set the introduction text displayed before the grid"""
        return self._set_intro_text("intro", intro)

    def set_shape(self, shape: str) -> "IconGridView":
        """Set the tile shape for all tiles ('circle' or 'square')"""
        if shape not in ("circle", "square"):
            raise InvalidParameterError(
                "shape", shape, "Shape must be 'circle' or 'square'"
            )
        self.content["shape"] = shape
        return self

    def set_columns(self, columns: int) -> "IconGridView":
        """Set the number of columns"""
        if columns < 2 or columns > 6:
            raise InvalidParameterError(
                "columns", columns, "Columns must be between 2 and 6"
            )
        self.content["columns"] = columns
        return self

    def set_spacing(self, spacing: int) -> "IconGridView":
        """Set spacing between tiles"""
        if spacing < 0:
            raise InvalidParameterError("spacing", spacing, "Spacing must be non-negative")
        self.content["spacing"] = spacing
        return self

    def _sync_actions_to_content(self) -> None:
        """Sync actions array to content (required by BaseActionView)"""
        self.content["actions"] = [
            {
                "code": action.code,
                "title": action.title,
                "desc": action.desc,
                "thumbnail": action.thumbnail,
                "badge": action.badge,
                "disabled": action.disabled if action.disabled else False,
                "metadata": action.metadata,
            }
            for action in self._actions
        ]

    def add_action(
        self,
        code: str,
        title: str,
        description: Optional[str] = None,
        thumbnail: Optional[str] = None,
        disabled: bool = False,
        metadata: Optional[dict] = None,
    ) -> "IconGridView":
        """Add an action (base order, compatible with add_actions) and sync"""
        super().add_action(code, title, description, thumbnail, disabled, metadata)
        self._sync_actions_to_content()
        return self

    def add_icon(
        self,
        code: str,
        title: str,
        thumbnail: Optional[str] = None,
        badge: Optional[str] = None,
        disabled: bool = False,
        metadata: Optional[dict] = None,
    ) -> "IconGridView":
        """Add an icon tile — ergonomic API (image + badge first; no desc)"""
        super().add_action(code, title, None, thumbnail, disabled, metadata)
        if badge is not None and self._actions:
            self._actions[-1].badge = badge
        self._sync_actions_to_content()
        return self

    def remove_action(self, action_code: str) -> bool:
        """Remove an action and sync to content"""
        result = super().remove_action(action_code)
        if result:
            self._sync_actions_to_content()
        return result

    def update_action(self, action_code: str, updates: dict) -> bool:
        """Update an action and sync to content"""
        result = super().update_action(action_code, updates)
        if result:
            self._sync_actions_to_content()
        return result

    def get_shape(self) -> str:
        """Get the tile shape"""
        return self.content.get("shape", "circle")

    def get_columns(self) -> int:
        """Get the number of columns"""
        return self.content.get("columns", 4)

    def get_spacing(self) -> int:
        """Get the spacing"""
        return self.content.get("spacing", 12)

    def has_actions(self) -> bool:
        """Check if the grid has actions"""
        return len(self._actions) > 0
