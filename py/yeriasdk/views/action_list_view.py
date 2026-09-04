"""
ActionListView - A view for displaying actions in a list format
"""

from typing import Optional
from datetime import datetime

from .base_action_view import BaseActionView
from ..types.models import ActionConfig


class ActionListView(BaseActionView):
    """Builds an SGUI ``ActionList`` view — a vertical list of actionable
    items, each with a code, title, optional description/thumbnail, and
    navigation.

    Builder methods: ``set_title``, ``set_intro``, and the action family
    inherited from BaseActionView (``add_action``, ``remove_action``,
    ``update_action``, ``has_actions``), overridden here to keep the serialized
    ``content['actions']`` in sync.

    Extends ``BaseActionView``. Created via the YeriaApp/YeriaUI factory,
    populated with these builders, then serialized and signed into a v3
    envelope by ``serve()``.
    """
    @classmethod
    def from_json(cls, json_view):
        """Rehydrate a ActionList view from a wire JSON payload."""
        return cls.from_json_as('ActionList', json_view)


    def __init__(self, view_id: str, title: str, process_id: Optional[str] = None):
        super().__init__(
            {
                "id": view_id,
                "type": "ActionList",
                "process_id": process_id,
                "metadata": {
                    "version": "1.0.0",
                    "created_at": datetime.now(),
                },
            }
        )

        self.content = {
            "title": title,
            "actions": self._actions,  # Reference to actions from BaseActionView
        }

    def set_title(self, title: str) -> "ActionListView":
        """Set the action list title"""
        self.content["title"] = title
        return self

    def set_intro(self, intro: str) -> "ActionListView":
        """Set the introduction text displayed before the action list"""
        return self._set_intro_text("intro", intro)

    def _sync_actions_to_content(self) -> None:
        """Sync actions array to content (required by BaseActionView)"""
        self.content["actions"] = [
            {
                "code": action.code,
                "title": action.title,
                "desc": action.desc,
                "thumbnail": action.thumbnail,
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
    ) -> "ActionListView":
        """Add an action and sync to content"""
        super().add_action(code, title, description, thumbnail, disabled, metadata)
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

    def has_actions(self) -> bool:
        """Check if the list has actions"""
        return len(self._actions) > 0

