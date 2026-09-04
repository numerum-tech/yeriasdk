"""
MediaView - A view for displaying audio and video resources
"""

from typing import Optional
from datetime import datetime

from ..core.base_view import BaseView
from ..types.models import MediaItem, MediaKind, MediaSource


class MediaView(BaseView):
    """Builds a Media SGUI view — an audio/video playlist for mobile playback.

    ``add_media_item`` (or ``create_media`` + ``add_media_item``) registers
    playable entries, and ``set_selected_item`` marks the one shown first in
    the player.

    Extends ``BaseView``; instantiated by the YeriaApp/YeriaUI factory,
    populated with these builders, then serialized to a JSON view description
    and signed into a v3 envelope by ``serve()``.
    """
    @classmethod
    def from_json(cls, json_view):
        """Rehydrate a Media view from a wire JSON payload."""
        return cls.from_json_as('Media', json_view)


    def __init__(self, view_id: str, title: str, process_id: Optional[str] = None):
        super().__init__(
            {
                "id": view_id,
                "type": "Media",
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

    def set_intro(self, intro: str) -> "MediaView":
        """Set optional lead text for the media playlist section"""
        return self._set_intro_text("intro", intro)

    def add_media_item(self, item: MediaItem) -> "MediaView":
        """Register a ready-to-play media entry"""
        if not item.id or not item.kind or not item.sources or len(item.sources) == 0:
            raise ValueError(
                "Media item requires an id, type, and at least one source"
            )

        item_dict = {
            "id": item.id.strip(),
            "kind": item.kind,
            "title": item.title.strip() if item.title else None,
            "description": item.description.strip() if item.description else None,
            "poster": item.poster.strip() if item.poster else None,
            "autoplay": item.autoplay,
            "loop": item.loop,
            # Left out when the provider did not set it. `controls` is
            # optional with a documented default of true, and the default
            # belongs to the client, not to the payload: writing it in made
            # every bare item carry a key the provider never asked for, and
            # the JS SDK omits it, so the same item signed differently.
            "controls": item.controls,
            "sources": [
                self._normalize_source(source) for source in item.sources
            ],
        }

        if item.meta:
            item_dict["meta"] = item.meta

        self.content["items"].append(item_dict)
        return self

    def create_media(
        self,
        id: str,
        kind: MediaKind,
        src: str,
        type: Optional[str] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        poster: Optional[str] = None,
        autoplay: Optional[bool] = None,
        loop: Optional[bool] = None,
        controls: Optional[bool] = None,
    ) -> MediaItem:
        """Build a MediaItem (single source) without adding it to the playlist"""
        # `add_media_item` normalises every source itself and expects a
        # MediaSource; handing it the normalised dict crashed on `.src`.
        normalized = self._normalize_source(MediaSource(src=src, type=type))
        primary_source = MediaSource(src=normalized["src"], type=normalized["type"])

        return MediaItem(
            id=id.strip(),
            kind=kind,
            title=title.strip() if title else None,
            description=description.strip() if description else None,
            poster=poster.strip() if poster else None,
            autoplay=autoplay,
            loop=loop,
            # Same rule as add_media_item: the default belongs to the client.
            controls=controls,
            sources=[primary_source],
        )

    def set_selected_item(self, id: str) -> "MediaView":
        """Mark the entry shown first in the player. Clears `selected` on every
        other item so only one is ever selected."""
        target = id.strip()
        found = False
        for it in self.content["items"]:
            it["selected"] = it["id"] == target
            if it["selected"]:
                found = True
        if not found:
            raise ValueError(f'set_selected_item: no media item with id "{target}"')
        return self

    def clear_items(self) -> "MediaView":
        """Clear all items"""
        self.content["items"] = []
        return self

    def get_content(self):
        """Get the media content"""
        return self.content

    def _normalize_source(self, source: MediaSource) -> dict:
        """Normalize a media source"""
        trimmed_src = source.src.strip()
        if not trimmed_src:
            raise ValueError("Media source src cannot be empty")

        return {
            "src": trimmed_src,
            "type": source.type.strip() if source.type else None,
        }

