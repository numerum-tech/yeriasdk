"""
File format management utilities
"""

from typing import Dict, List, Optional
from ..errors.exceptions import EmptyCollectionError, InvalidParameterError

# File format to MIME type mapping
FILE_FORMATS: Dict[str, str] = {
    # Documents
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "ppt": "application/vnd.ms-powerpoint",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "csv": "text/csv",
    "txt": "text/plain",
    "rtf": "application/rtf",
    # Images
    "png": "image/png",
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
    "svg": "image/svg+xml",
    "bmp": "image/bmp",
    "tiff": "image/tiff",
    "ico": "image/x-icon",
    # Audio
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "ogg": "audio/ogg",
    "aac": "audio/aac",
    "wma": "audio/x-ms-wma",
    # AAC in an MPEG-4 container — what iOS records by default
    "m4a": "audio/mp4",
    # what Android's recorder emits in an ogg/webm container
    "opus": "audio/opus",
    # Video
    "mp4": "video/mp4",
    "avi": "video/x-msvideo",
    "mov": "video/quicktime",
    "wmv": "video/x-ms-wmv",
    "flv": "video/x-flv",
    "webm": "video/webm",
    # low-bitrate capture container still emitted by some Android devices
    "3gp": "video/3gpp",
    # Archives
    "zip": "application/zip",
    "rar": "application/vnd.rar",
    "7z": "application/x-7z-compressed",
    "tar": "application/x-tar",
    "gz": "application/gzip",
    # Code
    "json": "application/json",
    "xml": "application/xml",
    "html": "text/html",
    "css": "text/css",
    "js": "application/javascript",
    "ts": "application/typescript",
    "py": "text/x-python",
    "java": "text/x-java-source",
    "cpp": "text/x-c++src",
    "c": "text/x-csrc",
    # Other
    "sql": "application/sql",
    "yaml": "application/x-yaml",
    "yml": "application/x-yaml",
    "md": "text/markdown",
    "log": "text/plain",
}


class FileFormatManager:
    """Singleton manager for file format to MIME type mapping"""

    _instance: Optional["FileFormatManager"] = None
    _custom_formats: Dict[str, str]

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._custom_formats = {}
        return cls._instance

    @classmethod
    def get_instance(cls) -> "FileFormatManager":
        """Get singleton instance"""
        return cls()

    @staticmethod
    def get_mime_types(formats: List[str]) -> List[str]:
        """Get MIME types for a list of formats"""
        if not formats or len(formats) == 0:
            raise EmptyCollectionError("formats", "At least one format must be provided")

        manager = FileFormatManager.get_instance()
        result = []
        for format_str in formats:
            mime_type = manager.get_mime_type(format_str)
            if not mime_type:
                raise InvalidParameterError(
                    "format", format_str, f"Unsupported file format: {format_str}"
                )
            result.append(mime_type)
        return result

    def get_mime_type(self, format_str: str) -> Optional[str]:
        """Get MIME type for a specific format"""
        normalized = format_str.lower().lstrip(".")

        # Check custom formats first
        if normalized in self._custom_formats:
            return self._custom_formats[normalized]

        # Then standard formats
        return FILE_FORMATS.get(normalized)

    def add_custom_format(self, extension: str, mime_type: str) -> None:
        """Add a custom format"""
        normalized = extension.lower().lstrip(".")
        self._custom_formats[normalized] = mime_type

    def remove_custom_format(self, extension: str) -> bool:
        """Remove a custom format"""
        normalized = extension.lower().lstrip(".")
        if normalized in self._custom_formats:
            del self._custom_formats[normalized]
            return True
        return False

    def is_supported(self, format_str: str) -> bool:
        """Check if a format is supported"""
        return self.get_mime_type(format_str) is not None

    def get_supported_formats(self) -> List[str]:
        """Get all supported formats"""
        standard = list(FILE_FORMATS.keys())
        custom = list(self._custom_formats.keys())
        return standard + custom

    def get_formats_by_category(self) -> Dict[str, List[str]]:
        """Get formats grouped by category"""
        return {
            "documents": [
                "pdf",
                "doc",
                "docx",
                "xls",
                "xlsx",
                "ppt",
                "pptx",
                "csv",
                "txt",
                "rtf",
            ],
            "images": ["png", "jpeg", "jpg", "gif", "webp", "svg", "bmp", "tiff", "ico"],
            "audio": ["mp3", "wav", "ogg", "aac", "wma", "m4a", "opus"],
            "video": ["mp4", "avi", "mov", "wmv", "flv", "webm", "3gp"],
            "archives": ["zip", "rar", "7z", "tar", "gz"],
            "code": ["json", "xml", "html", "css", "js", "ts", "py", "java", "cpp", "c"],
            "other": ["sql", "yaml", "yml", "md", "log"],
        }

    def validate_formats(self, formats: List[str]) -> Dict[str, List[str]]:
        """Validate a list of formats"""
        valid: List[str] = []
        invalid: List[str] = []

        for format_str in formats:
            if self.is_supported(format_str):
                valid.append(format_str)
            else:
                invalid.append(format_str)

        return {"valid": valid, "invalid": invalid}

    def get_extension_from_mime_type(self, mime_type: str) -> Optional[str]:
        """Get extension from MIME type"""
        # Check standard formats
        for ext, mime in FILE_FORMATS.items():
            if mime == mime_type:
                return ext

        # Check custom formats
        for ext, mime in self._custom_formats.items():
            if mime == mime_type:
                return ext

        return None

    def get_mime_types_by_category(self) -> Dict[str, List[str]]:
        """Get MIME types grouped by category"""
        categories = self.get_formats_by_category()
        result: Dict[str, List[str]] = {}

        for category, formats in categories.items():
            mime_types = []
            for format_str in formats:
                mime_type = self.get_mime_type(format_str)
                if mime_type:
                    mime_types.append(mime_type)
            result[category] = mime_types

        return result

