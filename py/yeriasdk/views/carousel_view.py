"""
CarouselView - A view for displaying carousel slides
"""

from typing import Optional, Dict, Any
from datetime import datetime

from ..core.base_view import BaseView
from ..types.models import CarouselSettings, CarouselSlide, CardAction, CardImage, HttpMethod, CardActionVariant
from ..errors.exceptions import MissingRequiredParameterError, ElementNotFoundError
from ..core.yeria_link import YeriaLink


class CarouselView(BaseView):
    """Builds a Carousel SGUI view — a sequence of spotlight slides for hero
    banners or promotional decks.

    ``add_slide`` (or ``create_slide`` + ``add_slide``) appends slides,
    ``add_slide_action`` attaches action buttons to a slide, and
    ``set_settings`` tunes autoplay, looping and indicator behaviour.

    Extends ``BaseView``; instantiated by the YeriaApp/YeriaUI factory,
    populated with these builders, then serialized to a JSON view description
    and signed into a v3 envelope by ``serve()``.
    """
    @classmethod
    def from_json(cls, json_view):
        """Rehydrate a Carousel view from a wire JSON payload."""
        return cls.from_json_as('Carousel', json_view)


    def __init__(self, view_id: str, title: str, process_id: Optional[str] = None):
        super().__init__(
            {
                "id": view_id,
                "type": "Carousel",
                "process_id": process_id,
                "metadata": {
                    "version": "1.0.0",
                    "created_at": datetime.now(),
                },
            }
        )

        # Pas de `settings` tant que le fournisseur n'en pose pas : les quatre
        # defauts documentes etaient ecrits ici, si bien qu'un carrousel nu
        # emettait des clefs que personne n'avait demandees. Le client porte
        # les memes defauts.
        self.content = {
            "title": title,
            "slides": [],
        }

    def set_intro(self, intro: str) -> "CarouselView":
        """Set the line of context shown beneath the carousel heading"""
        return self._set_intro_text("intro", intro)

    def set_subtitle(self, subtitle: str) -> "CarouselView":
        """Nom historique de set_intro, conserve. Ecrit la meme cle."""
        return self.set_intro(subtitle)

    def set_settings(self, settings: CarouselSettings | Dict[str, Any]) -> "CarouselView":
        """Override default autoplay and indicator behaviour"""
        if isinstance(settings, dict):
            raw = {
                "autoplay": settings.get("autoplay"),
                "intervalMs": settings.get("intervalMs"),
                "loop": settings.get("loop"),
                "showIndicators": settings.get("showIndicators"),
            }
        else:
            raw = {
                "autoplay": settings.autoplay,
                "intervalMs": settings.interval_ms,
                "loop": settings.loop,
                "showIndicators": settings.show_indicators,
            }
        # Seules les clefs posees par le fournisseur sortent. Les quatre
        # defauts documentes (autoplay false, intervalMs 6000, loop true,
        # showIndicators true) etaient injectes ici, si bien qu'un
        # `set_settings({"loop": False})` emettait trois clefs que personne
        # n'avait demandees — le SDK JS n'en emettait aucune, et le client
        # porte deja les memes defauts. Un defaut appartient au client.
        cleaned = {k: v for k, v in raw.items() if v is not None}
        if cleaned:
            self.content["settings"] = cleaned
        else:
            self.content.pop("settings", None)
        return self

    def add_slide(self, slide: CarouselSlide | Dict[str, Any]) -> "CarouselView":
        """Append a prepared slide to the carousel sequence"""

        # A dict is lifted into the dataclass and takes the same road: the
        # dict branch used to serialise on its own and stopped at `image`, so
        # a slide written as a dict lost its `actions` and `meta` in silence.
        if isinstance(slide, dict):
            image = slide.get("image")
            actions = slide.get("actions")
            slide = CarouselSlide(
                id=slide.get("id") or "",
                title=slide.get("title") or "",
                description=slide.get("description"),
                badge=slide.get("badge"),
                image=CardImage(url=image.get("url", ""), alt=image.get("alt")) if image else None,
                actions=[
                    CardAction(
                        text=a.get("text", ""),
                        method=a.get("method"),
                        confirm_message=a.get("confirmMessage", a.get("confirm_message")),
                        href=a.get("href"),
                        icon=a.get("icon"),
                        variant=a.get("variant"),
                    )
                    for a in actions
                ] if actions else None,
                meta=slide.get("meta"),
            )

        if not slide.id or not slide.title:
            raise MissingRequiredParameterError("slide id and title")

        slide_dict = {
            "id": slide.id.strip(),
            "title": slide.title.strip(),
            "description": slide.description.strip() if slide.description else None,
            "badge": slide.badge.strip() if slide.badge else None,
        }

        if slide.image:
            slide_dict["image"] = {
                "url": slide.image.url,
                "alt": slide.image.alt,
            }

        if slide.actions:
            slide_dict["actions"] = [
                {
                    "text": action.text,
                    "method": action.method,
                    "confirmMessage": action.confirm_message,
                    "href": action.href,
                    "icon": action.icon,
                    "variant": action.variant,
                }
                for action in slide.actions
            ]

        if slide.meta:
            slide_dict["meta"] = slide.meta

        self.content["slides"].append(slide_dict)
        return self

    def create_slide(
        self,
        id: str,
        title: str,
        description: Optional[str] = None,
        image_url: Optional[str] = None,
        image_alt: Optional[str] = None,
        badge: Optional[str] = None,
    ) -> CarouselSlide:
        """Build a CarouselSlide object without adding it to the view"""
        slide = CarouselSlide(
            id=id.strip(),
            title=title.strip(),
            description=description.strip() if description else None,
            badge=badge.strip() if badge else None,
        )

        if image_url:
            from ..types.models import CardImage
            slide.image = CardImage(url=image_url.strip(), alt=image_alt.strip() if image_alt else None)

        return slide

    def add_slide_action(
        self,
        slide_id: str,
        text: str,
        method: HttpMethod = "POST",
        confirm_message: Optional[str] = None,
        href: Optional[str] = None,
        icon: Optional[str] = None,
        variant: Optional[CardActionVariant] = None,
    ) -> "CarouselView":
        """Push an action button for a given slide id"""
        slides = self.content["slides"]
        slide = next((s for s in slides if s.get("id") == slide_id), None)
        if not slide:
            raise ElementNotFoundError(0, slide_id)

        if "actions" not in slide:
            slide["actions"] = []

        action = {
            "text": text.strip(),
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

        slide["actions"].append(action)
        return self

    def clear_slides(self) -> "CarouselView":
        """Clear all slides"""
        self.content["slides"] = []
        return self

    def get_content(self):
        """Get the carousel content"""
        return self.content
