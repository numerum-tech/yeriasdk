"""
TimelineView - A view for displaying chronological progress
"""

from typing import Optional
from datetime import datetime

from ..core.base_view import BaseView
from ..types.models import TimelineItem, TimelineStatus
from ..errors.exceptions import MissingRequiredParameterError


class TimelineView(BaseView):
    """Builds a Timeline SGUI view — a chronological list of events such as
    onboarding steps or activity feeds.

    Entries are appended via ``add_item`` / ``add_event`` or replaced wholesale
    with ``set_items``; ``set_intro`` adds lead context text.

    Extends ``BaseView``; instantiated by the YeriaApp/YeriaUI factory,
    populated with these builders, then serialized to a JSON view description
    and signed into a v3 envelope by ``serve()``.
    """
    @classmethod
    def from_json(cls, json_view):
        """Rehydrate a Timeline view from a wire JSON payload."""
        return cls.from_json_as('Timeline', json_view)


    def __init__(self, view_id: str, title: str, process_id: Optional[str] = None):
        super().__init__(
            {
                "id": view_id,
                "type": "Timeline",
                "process_id": process_id,
                "metadata": {
                    "version": "1.0.0",
                    "created_at": datetime.now(),
                },
            }
        )

        self.content = {
            "title": title,
            "items": [],
        }

    def set_intro(self, intro: str) -> "TimelineView":
        """Add optional context text displayed before the timeline items"""
        return self._set_intro_text("intro", intro)

    def add_item(self, item: TimelineItem) -> "TimelineView":
        """Persist a fully configured timeline entry"""
        if not item.id or not item.title or not item.timestamp:
            raise MissingRequiredParameterError(
                "timeline item id, title, and timestamp"
            )

        item_dict = {
            "id": item.id.strip(),
            "title": item.title.strip(),
            "timestamp": item.timestamp.strip(),
            "description": item.description.strip() if item.description else None,
            "status": item.status,
            "icon": item.icon,
        }

        if item.meta:
            item_dict["meta"] = item.meta

        self.content["items"].append(item_dict)
        return self

    def add_event(
        self,
        id: str,
        title: str,
        timestamp: str,
        description: Optional[str] = None,
        status: Optional[TimelineStatus] = None,
        icon: Optional[str] = None,
    ) -> "TimelineView":
        """Convenience builder that assembles a timeline entry from primitive fields and appends it"""
        item = TimelineItem(
            id=id,
            title=title,
            timestamp=timestamp,
            description=description,
            status=status,
            icon=icon,
        )
        return self.add_item(item)

    def set_items(self, items: list) -> "TimelineView":
        """Replace all events at once, enforcing validation per entry"""
        self.content["items"] = []
        for item in items:
            if isinstance(item, dict):
                timeline_item = TimelineItem(
                    id=item["id"],
                    title=item["title"],
                    timestamp=item["timestamp"],
                    description=item.get("description"),
                    status=item.get("status"),
                    icon=item.get("icon"),
                    meta=item.get("meta"),
                )
                self.add_item(timeline_item)
            else:
                self.add_item(item)
        return self

    def clear_items(self) -> "TimelineView":
        """Clear all items"""
        self.content["items"] = []
        return self

    def get_content(self):
        """Get the timeline content"""
        return self.content

