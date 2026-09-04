"""
QRDisplayView - A view for displaying QR codes
"""

from typing import Optional
from datetime import datetime

from ..core.base_view import BaseView
from ..types.models import SubmitAction, QRConfig, HttpMethod
from ..errors.exceptions import MissingRequiredParameterError, InvalidParameterError


class QRDisplayView(BaseView):
    """Builds an SGUI ``QRDisplay`` view — renders a QR code (from a URL or
    base64 image) with a title and description, plus an optional action button.

    Builder methods: ``set_intro`` (intro text), ``set_qr_code`` (image + title
    + description + optional QRConfig), ``submit_button`` (optional action such
    as Share/Export, POSTed to {service.base_url}/{view_id}).

    Extends ``BaseView``. Created via the YeriaApp/YeriaUI factory, populated
    with these builders, then serialized and signed into a v3 envelope by
    ``serve()``.
    """
    @classmethod
    def from_json(cls, json_view):
        """Rehydrate a QRDisplay view from a wire JSON payload."""
        return cls.from_json_as('QRDisplay', json_view)


    def __init__(self, view_id: str, title: str, process_id: Optional[str] = None):
        super().__init__(
            {
                "id": view_id,
                "type": "QRDisplay",
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
            "qrImage": "",
            "qrTitle": "",
            "qrDescription": "",
        }

    def set_intro(self, intro: str) -> "QRDisplayView":
        """Set introduction"""
        return self._set_intro_text("intro", intro)

    def submit_button(self, text: str, method: HttpMethod = "POST") -> "QRDisplayView":
        """Define submit button for QR display actions"""
        self.content["submit"] = {"text": text, "method": method}
        return self

    def set_qr_code(
        self,
        qr_image: str,
        title: str,
        description: str,
        config: Optional[QRConfig] = None,
    ) -> "QRDisplayView":
        """Set the QR code to display (replaces any existing QR code)"""
        if not qr_image or not title or not description:
            raise MissingRequiredParameterError("qrImage, title, and description")

        # Validate URL or base64
        if not (qr_image.startswith("http") or qr_image.startswith("data:image/")):
            raise InvalidParameterError(
                "qrImage",
                qr_image,
                "Invalid QR image. Provide a valid URL or base64 string.",
            )

        self.content["qrImage"] = qr_image
        self.content["qrTitle"] = title
        self.content["qrDescription"] = description

        if config:
            self.content["qrConfig"] = {
                "size": config.size,
                "errorCorrection": config.error_correction,
                "margin": config.margin,
                "color": (
                    {
                        "dark": config.color.dark,
                        "light": config.color.light,
                    }
                    if config.color
                    else None
                ),
            }
        else:
            self.content["qrConfig"] = None

        return self

