"""
CardView - A compact "product sheet" view
"""

from typing import Optional, Dict, Any
from datetime import datetime

from ..core.base_view import BaseView
from ..types.models import CardActionVariant, HttpMethod
from ..errors.exceptions import InvalidParameterError, MissingRequiredParameterError
from ..core.yeria_link import YeriaLink


class CardView(BaseView):
    """Builds a Card SGUI view — a compact "product sheet" spotlighting a single item.

    Header, badge and image are set via ``set_intro`` / ``set_description`` /
    ``set_badge`` / ``set_image``; ``add_stat``, ``add_section`` and
    ``add_action`` fill the highlight metrics, body sections and footer buttons.

    Extends ``BaseView``; instantiated by the YeriaApp/YeriaUI factory,
    populated with these builders, then serialized to a JSON view description
    and signed into a v3 envelope by ``serve()``.
    """
    @classmethod
    def from_json(cls, json_view):
        """Rehydrate a Card view from a wire JSON payload."""
        return cls.from_json_as('Card', json_view)


    def __init__(self, view_id: str, title: str, process_id: Optional[str] = None):
        super().__init__(
            {
                "id": view_id,
                "type": "Card",
                "process_id": process_id,
                "metadata": {
                    "version": "1.0.0",
                    "created_at": datetime.now(),
                },
            }
        )

        self.content = {
            "title": title,
            "badge": None,
            "image": None,
            "stats": [],
            "sections": [],
            "actions": [],
            "meta": None,
        }

    def set_intro(self, intro: str) -> "CardView":
        """Set the line of context displayed under the main title

        Meme contrat que partout ailleurs : un texte d'en-tete se pose ou ne
        se pose pas. Stocker '' faisait reserver au renderer une ligne vide.
        """
        self._set_intro_text("intro", intro)
        return self

    def set_subtitle(self, subtitle: str) -> "CardView":
        """Nom historique de set_intro, conserve : la carte disait `subtitle`
        la ou les onze autres vues disent `intro`. Ecrit la meme cle.
        """
        return self.set_intro(subtitle)

    def set_description(self, description: str) -> "CardView":
        """Set the long-form description for the card body"""
        self._set_intro_text("description", description)
        return self

    def set_badge(self, badge: Optional[str]) -> "CardView":
        """Set a compact badge (e.g., 'Nouveau') above the title"""
        self.content["badge"] = badge.strip() if badge else None
        return self

    def set_image(self, url: str, alt: Optional[str] = None) -> "CardView":
        """Attach a hero image to the card header"""
        trimmed_url = url.strip()
        if not trimmed_url:
            raise InvalidParameterError("url", url, "Image URL cannot be empty")

        self.content["image"] = {"url": trimmed_url, "alt": alt.strip() if alt else None}
        return self

    def clear_image(self) -> "CardView":
        """Clear the image"""
        self.content["image"] = None
        return self

    def set_stats_heading(self, heading: str) -> "CardView":
        """Name the stats block

        Facultatif : sans intitule la grille est dessinee nue, exactement
        comme une section sans ``heading``. Le client n'invente jamais de
        titre de son cru.
        """
        self._set_intro_text("statsHeading", heading)
        return self

    def add_stat(self, label: str, value: str) -> "CardView":
        """Add a key metric row (label/value) in the highlight area"""
        trimmed_label = label.strip()
        trimmed_value = value.strip()

        if not trimmed_label or not trimmed_value:
            raise MissingRequiredParameterError("label and value")

        self.content["stats"].append({"label": trimmed_label, "value": trimmed_value})
        return self

    def clear_stats(self) -> "CardView":
        """Clear all stats"""
        self.content["stats"] = []
        return self

    def add_section(self, heading: str, body: str) -> "CardView":
        """Insert a descriptive section below the highlights"""
        trimmed_heading = heading.strip()
        trimmed_body = body.strip()

        if not trimmed_heading or not trimmed_body:
            raise MissingRequiredParameterError("heading and body")

        self.content["sections"].append(
            {"heading": trimmed_heading, "body": trimmed_body}
        )
        return self

    def clear_sections(self) -> "CardView":
        """Clear all sections"""
        self.content["sections"] = []
        return self

    def add_action(
        self,
        text: str,
        method: HttpMethod = "POST",
        confirm_message: Optional[str] = None,
        href: Optional[str] = None,
        icon: Optional[str] = None,
        variant: Optional[CardActionVariant] = None,
    ) -> "CardView":
        """Register an action button displayed in the footer"""
        trimmed_text = text.strip()
        if not trimmed_text:
            raise InvalidParameterError("text", text, "Action text cannot be empty")

        action = {
            "text": trimmed_text,
            "method": method,
            "confirmMessage": confirm_message,
            "href": (
                href.strip()
                if href and YeriaLink.is_valid(href)
                else self._assert_navigation_target(
                    "href", href, allow_relative=True, allow_view_id=False
                )
                if href
                else None
            ),
            "icon": icon.strip() if icon else None,
            "variant": variant,
        }

        self.content["actions"].append(action)
        return self

    def clear_actions(self) -> "CardView":
        """Clear all actions"""
        self.content["actions"] = []
        return self

    def set_metadata(self, meta: Dict[str, Any]) -> "CardView":
        """Store arbitrary metadata the client may need"""
        self.content["meta"] = dict(meta)
        return self

    def get_content(self):
        """Get the card content"""
        return self.content
