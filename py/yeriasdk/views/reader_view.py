"""
ReaderView - A view for displaying rich content
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
import re

from ..core.base_view import BaseView
from ..types.models import MarkdownPage
from ..errors.exceptions import InvalidParameterError, MarkdownParseError

try:
    import markdown
    MARKDOWN_AVAILABLE = True
except ImportError:
    MARKDOWN_AVAILABLE = False

try:
    import bleach
    BLEACH_AVAILABLE = True
except ImportError:
    BLEACH_AVAILABLE = False

# Tags the renderer accepts (kept in sync with the JS SDK sanitizer).
_ALLOWED_TAGS = [
    "p", "br", "strong", "em", "u", "i", "b",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "a", "blockquote", "code", "pre",
    "table", "thead", "tbody", "tr", "th", "td",
    "hr", "div", "span",
]
_ALLOWED_PROTOCOLS = ["http", "https", "mailto"]


def _sanitize_html(html_content: str) -> str:
    """Sanitize rendered-markdown HTML, keeping only the allowed tags.

    Uses ``bleach`` (a declared dependency). Disallowed tags are stripped but
    their text is kept, and ``<a>`` hrefs are limited to http/https/mailto —
    the same policy the JS SDK applies, so the wire output is identical
    (allowed tags pass through unescaped, whitespace preserved). The escape
    fallback only runs if bleach is somehow unavailable; escaping is safe (no
    XSS) though it would render tags as literal text.
    """
    if not BLEACH_AVAILABLE:
        import html as html_module
        return html_module.escape(html_content)

    return bleach.clean(
        html_content,
        tags=_ALLOWED_TAGS,
        attributes={"a": ["href"]},
        protocols=_ALLOWED_PROTOCOLS,
        strip=True,
    )


class ReaderView(BaseView):
    """Builds a Reader SGUI view — a scrollable rich-content document.

    Content elements are appended in order via ``add_paragraph``,
    ``add_subtitle``, ``add_image``, ``add_markdown``, ``add_list_field``,
    ``add_link``, ``add_table``, ``add_code_block``, ``add_quote``,
    ``add_separator`` and ``add_custom_element``.

    Extends ``BaseView``; instantiated by the YeriaApp/YeriaUI factory,
    populated with these builders, then serialized to a JSON view description
    and signed into a v3 envelope by ``serve()``.
    """
    @classmethod
    def from_json(cls, json_view):
        """Rehydrate a Reader view from a wire JSON payload."""
        return cls.from_json_as('Reader', json_view)


    def __init__(self, view_id: str, view_title: str, process_id: Optional[str] = None):
        super().__init__(
            {
                "id": view_id,
                "type": "Reader",
                "process_id": process_id,
                "metadata": {
                    "version": "1.0.0",
                    "created_at": datetime.now(),
                },
            }
        )

        self.content = {
            "title": view_title,
            "elements": [],
        }

    def set_intro(self, intro: str) -> "ReaderView":
        """Set introduction"""
        return self._set_intro_text("intro", intro)

    def add_paragraph(self, text: str) -> "ReaderView":
        """Add a paragraph"""
        trimmed = text.strip()
        if not trimmed:
            raise InvalidParameterError("text", text, "Paragraph text cannot be empty")

        self.content["elements"].append({"type": "paragraph", "text": trimmed})
        return self

    def add_image(
        self, url: str, alt: Optional[str] = None, caption: Optional[str] = None
    ) -> "ReaderView":
        """Add an image"""
        trimmed_url = url.strip()
        if not trimmed_url:
            raise InvalidParameterError("url", url, "Image URL cannot be empty")

        image_element = {"type": "image", "url": trimmed_url}
        if alt:
            image_element["alt"] = alt
        if caption:
            image_element["caption"] = caption

        self.content["elements"].append(image_element)
        return self

    def add_subtitle(self, text: str) -> "ReaderView":
        """Add a subtitle"""
        trimmed = text.strip()
        if not trimmed:
            raise InvalidParameterError("text", text, "Subtitle text cannot be empty")

        self.content["elements"].append({"type": "subtitle", "text": trimmed})
        return self

    def add_markdown(
        self, markdown_text: str, sanitize: bool = True
    ) -> "ReaderView":
        """Add markdown content"""
        if not MARKDOWN_AVAILABLE:
            raise MarkdownParseError(
                self.id, ValueError("markdown library is required for markdown support")
            )

        try:
            html_content = markdown.markdown(markdown_text)

            page: MarkdownPage = {
                "content": _sanitize_html(html_content) if sanitize else html_content,
                "raw": markdown_text,
                "sanitized": sanitize,
            }

            elements = self.content["elements"]
            existing_markdown = next(
                (e for e in elements if e.get("type") == "markdown"), None
            )

            if not existing_markdown:
                elements.append({"type": "markdown", "pages": [page]})
            else:
                if "pages" not in existing_markdown:
                    existing_markdown["pages"] = []
                existing_markdown["pages"].append(page)

        except Exception as error:
            raise MarkdownParseError(self.id, error) from error

        return self

    def add_list_field(
        self, items: List[str], ordered: bool = False
    ) -> "ReaderView":
        """Add a list"""
        if not isinstance(items, list):
            raise InvalidParameterError(
                "items", items, "List items must be an array"
            )

        trimmed_items = [item.strip() for item in items]
        self.content["elements"].append(
            {"type": "list", "items": trimmed_items, "ordered": ordered}
        )
        return self

    def add_link(
        self, url: str, text: str, description: Optional[str] = None
    ) -> "ReaderView":
        """Add a link"""
        trimmed_url = url.strip()
        trimmed_text = text.strip()

        if not trimmed_url:
            raise InvalidParameterError("url", url, "Link URL cannot be empty")
        if not trimmed_text:
            raise InvalidParameterError("text", text, "Link text cannot be empty")

        link_element = {"type": "link", "url": trimmed_url, "text": trimmed_text}
        if description:
            link_element["description"] = description

        self.content["elements"].append(link_element)
        return self

    def add_table(
        self, headers: List[str], rows: List[List[str]]
    ) -> "ReaderView":
        """Add a table"""
        if not isinstance(headers, list) or not isinstance(rows, list):
            raise InvalidParameterError(
                "table data", {"headers": headers, "rows": rows},
                "Headers and rows must be arrays"
            )

        self.content["elements"].append(
            {"type": "table", "headers": headers, "rows": rows}
        )
        return self

    def add_code_block(
        self, code: str, language: Optional[str] = None
    ) -> "ReaderView":
        """Add a code block"""
        code_element = {"type": "code", "code": code}
        if language:
            code_element["language"] = language

        self.content["elements"].append(code_element)
        return self

    def add_quote(
        self, text: str, author: Optional[str] = None, source: Optional[str] = None
    ) -> "ReaderView":
        """Add a quote"""
        quote_element = {"type": "quote", "text": text}
        if author:
            quote_element["author"] = author
        if source:
            quote_element["source"] = source

        self.content["elements"].append(quote_element)
        return self

    def add_separator(self) -> "ReaderView":
        """Add a separator"""
        self.content["elements"].append({"type": "separator"})
        return self

    def add_custom_element(
        self, type: str, data: Dict[str, Any]
    ) -> "ReaderView":
        """Add a custom element"""
        trimmed_type = type.strip()
        if not trimmed_type:
            raise InvalidParameterError(
                "type", type, "Custom element type cannot be empty"
            )

        self.content["elements"].append(
            {"type": "custom", "kind": trimmed_type, "data": dict(data)}
        )
        return self

    def get_elements_by_type(self, element_type: str) -> List[Dict[str, Any]]:
        """Get elements by type"""
        return [
            e for e in self.content["elements"] if e.get("type") == element_type
        ]

    def remove_element(self, index: int) -> bool:
        """Remove an element by index"""
        elements = self.content["elements"]
        if 0 <= index < len(elements):
            elements.pop(index)
            return True
        return False

    def insert_element(
        self, index: int, element: Dict[str, Any]
    ) -> bool:
        """Insert an element at a specific index"""
        elements = self.content["elements"]
        if 0 <= index <= len(elements):
            elements.insert(index, element)
            return True
        return False

