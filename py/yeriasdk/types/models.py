"""
Type definitions for Yeria SDK
Python equivalents of TypeScript interfaces and types
"""

from typing import (
    Literal,
    Optional,
    Dict,
    Any,
    List,
    Callable,
    Union,
    TypedDict,
    Protocol,
)
from dataclasses import dataclass, field
from datetime import datetime
import re

# Type aliases
ViewType = Literal[
    "Reader",
    "ActionList",
    "ActionGrid",
    "IconGrid",
    "Form",
    "QRScan",
    "QRDisplay",
    "Dialog",
    "Message",
    "Card",
    "Carousel",
    "Timeline",
    "Media",
    "Map",
]

MessageType = Literal["error", "info", "warning", "success"]

HttpMethod = Literal["GET", "POST", "PUT", "DELETE", "PATCH"]

TimelineStatus = Literal["pending", "active", "completed", "error"]

MediaKind = Literal["audio", "video"]

CardActionVariant = Literal["primary", "secondary", "link"]

# Where a photo/audio/video field is allowed to take its content from.
#   record  : capture only — camera/microphone, no picking an existing file.
#   library : pick only — no capture UI.
#   both    : the user chooses (default).
# Use "record" when the point is that the content was produced now.
CaptureSource = Literal["record", "library", "both"]

# Video capture ceiling. An enum rather than raw numbers so the renderer keeps
# picking the concrete resolution/bitrate its device actually supports.
#   low    ~ 480p  / ~1 Mbps   -> ~7 MB per minute
#   medium ~ 720p  / ~2.5 Mbps -> ~19 MB per minute (default)
#   high   ~ 1080p / ~4 Mbps   -> ~30 MB per minute
# Figures are typical mobile-encoder output, not a guarantee — size the
# provider's request body limit with headroom.
VideoQuality = Literal["low", "medium", "high"]


# Navigation configuration
@dataclass
class NavigationConfig:
    # `next` / `prev` are SIBLINGS in a sequence — the two arrows of a
    # paginated set of views, drawn by the client. They are never bound to the
    # back gesture: back undoes time, pagination moves sideways.
    #
    # `entry` says how THIS view enters the stack when displayed. Only the
    # provider knows the answer: a receipt replaces the form it acknowledges,
    # step 2 of a wizard does not replace step 1.
    #
    # `page` dit OU l'on se trouve dans la sequence. Des nombres, pas une
    # phrase : le client les met en forme dans sa langue. `total` est
    # facultatif, une sequence ouverte n'en connait pas la fin.
    next: Optional[str] = None  # URL or path of the next view in the sequence
    prev: Optional[str] = None  # URL or path of the previous view
    entry: Optional[str] = None  # 'push' (default) | 'replace'
    page: Optional[Dict[str, int]] = None  # {'current': int, 'total': int?}


# Process context for multi-step workflows
@dataclass
class ProcessContext:
    process_id: str  # Unique process identifier
    process_name: Optional[str] = None  # Human-readable process name
    current_step: Optional[int] = None  # Current step (1-based)
    total_steps: Optional[int] = None  # Total number of steps
    step_name: Optional[str] = None  # Current step name
    can_go_back: Optional[bool] = None  # Can go back
    can_skip: Optional[bool] = None  # Can skip this step
    metadata: Optional[Dict[str, Any]] = None  # Process metadata


# Base view configuration
@dataclass
class ViewMetadata:
    version: str
    created_at: datetime
    author: Optional[str] = None
    tags: Optional[List[str]] = None


@dataclass
class BaseViewConfig:
    id: str
    type: ViewType
    process_id: Optional[str] = None
    metadata: Optional[ViewMetadata] = None


# Field validation
@dataclass
class FieldValidation:
    required: Optional[bool] = None
    pattern: Optional[re.Pattern] = None  # Python regex pattern
    min: Optional[float] = None
    max: Optional[float] = None
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    custom_validator: Optional[Callable[[Any], Union[bool, str]]] = None
    dependencies: Optional[List[str]] = None  # Required fields if this field is filled
    conditional: Optional[Callable[[Dict[str, Any]], bool]] = None


@dataclass
class FormFieldOption:
    label: str
    value: Any
    selected: Optional[bool] = None


@dataclass
class FormFieldParams(FieldValidation):
    # For media fields this holds the URL of a file the provider ALREADY has —
    # a list when the field is `multiple`. With `readonly` it turns the field
    # into a viewer of stored content instead of a capture control.
    value: Optional[Union[str, List[str]]] = None
    options: Optional[List[FormFieldOption]] = None
    accept: Optional[List[str]] = None
    live: Optional[bool] = None
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    disabled: Optional[bool] = None
    readonly: Optional[bool] = None
    min_date: Optional[str] = None  # For date fields: minimum date (YYYY-MM-DD)
    max_date: Optional[str] = None  # For date fields: maximum date (YYYY-MM-DD)
    altitude: Optional[bool] = None  # GPS fields: include altitude in the value
    # GPS fields: coarsest fix accepted, in METRES (= min required precision).
    # The app captures until position.accuracy <= max_accuracy.
    max_accuracy: Optional[float] = None
    # GPS fields: legacy boolean high-accuracy flag, superseded by
    # `max_accuracy`. Kept because the JS SDK still emits it and a payload that
    # carries it on one side and not the other does not sign the same.
    precision: Optional[bool] = None

    # photo / file / audio / video: multi-capture
    multiple: Optional[bool] = None  # Allow more than one item in this field
    max_count: Optional[int] = None  # Upper bound when `multiple` is set

    # audio / video: capture constraints
    # Seconds. Required for video: it is what bounds the upload size.
    max_duration: Optional[float] = None
    # Seconds. Rejects an accidental tap-and-release recording.
    min_duration: Optional[float] = None
    source: Optional[CaptureSource] = None
    quality: Optional[VideoQuality] = None  # Video only
    # Bytes. Client refuses to upload past this, before sending.
    max_size: Optional[int] = None

    # select: comment presenter les choix. Une PREFERENCE d'affichage, pas un
    # type de champ — le sens reste « un seul choix parmi plusieurs ».
    # 'dropdown' (defaut, feuille de selection) | 'radio' (options a plat).
    # Un client qui ignore la cle retombe sur 'dropdown'.
    display: Optional[str] = None

    # paragraph: displayed text, never an input. A SIZE, not a role:
    # 'xl' (24px) | 'lg' (18px) | 'md' (14px, default) | 'sm' (12px)
    size: Optional[str] = None
    bold: Optional[bool] = None
    italic: Optional[bool] = None


# Action configuration
@dataclass
class ActionConfig:
    code: str
    title: str
    desc: Optional[str] = None
    thumbnail: Optional[str] = None
    badge: Optional[str] = None  # small overlay text on IconGrid tiles ("3", "New")
    disabled: Optional[bool] = None
    metadata: Optional[Dict[str, Any]] = None


# Content elements
ContentElement = Dict[str, Any]  # Flexible content element


@dataclass
class MarkdownPage:
    content: str
    raw: str
    sanitized: bool


# Reader elements (union type represented as Dict)
ReaderElement = Dict[str, Any]  # Can be paragraph, subtitle, image, markdown, etc.


# Card types
@dataclass
class CardImage:
    url: str
    alt: Optional[str] = None


@dataclass
class CardStat:
    label: str
    value: str


@dataclass
class CardSection:
    heading: str
    body: str


@dataclass
class CardAction:
    text: str
    method: Optional[HttpMethod] = None
    confirm_message: Optional[str] = None
    href: Optional[str] = None
    icon: Optional[str] = None
    variant: Optional[CardActionVariant] = None


@dataclass
class CardContent:
    title: str
    # Ligne de contexte sous le titre — meme cle et meme role que l'`intro`
    # des onze autres vues. Elle s'appelait `subtitle` ; set_subtitle en
    # reste l'alias.
    intro: Optional[str] = None
    description: Optional[str] = None
    badge: Optional[str] = None
    image: Optional[CardImage] = None
    # Intitule du bloc de statistiques. Absent = pas de titre : le client ne
    # dessine que ce que le fournisseur a pose, comme pour CardSection.
    stats_heading: Optional[str] = None
    stats: List[CardStat] = field(default_factory=list)
    sections: List[CardSection] = field(default_factory=list)
    actions: List[CardAction] = field(default_factory=list)
    meta: Optional[Dict[str, Any]] = None


# Carousel types
@dataclass
class CarouselSlide:
    id: str
    title: str
    description: Optional[str] = None
    badge: Optional[str] = None
    image: Optional[CardImage] = None
    actions: Optional[List[CardAction]] = None
    meta: Optional[Dict[str, Any]] = None


@dataclass
class CarouselSettings:
    autoplay: Optional[bool] = None
    interval_ms: Optional[int] = None
    loop: Optional[bool] = None
    show_indicators: Optional[bool] = None


@dataclass
class CarouselContent:
    title: str
    # Voir CardContent.intro — set_subtitle en reste l'alias.
    intro: Optional[str] = None
    slides: List[CarouselSlide] = field(default_factory=list)
    settings: Optional[CarouselSettings] = None


# Timeline types
@dataclass
class TimelineItem:
    id: str
    title: str
    timestamp: str
    description: Optional[str] = None
    status: Optional[TimelineStatus] = None
    icon: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None


@dataclass
class TimelineContent:
    title: str
    intro: Optional[str] = None
    items: List[TimelineItem] = field(default_factory=list)


# Media types
@dataclass
class MediaSource:
    src: str
    type: Optional[str] = None


@dataclass
class MediaItem:
    id: str
    kind: MediaKind
    title: Optional[str] = None
    description: Optional[str] = None
    poster: Optional[str] = None
    autoplay: Optional[bool] = None
    loop: Optional[bool] = None
    controls: Optional[bool] = None
    # Set via MediaView.set_selected_item(id), not manually.
    selected: Optional[bool] = None
    sources: List[MediaSource] = field(default_factory=list)
    meta: Optional[Dict[str, Any]] = None


@dataclass
class MediaContent:
    title: str
    intro: Optional[str] = None
    items: List[MediaItem] = field(default_factory=list)


# ============================================================
# MapView v2 — see specs/map-view.md
# ============================================================

@dataclass
class GeoPoint:
    lat: float
    lon: float
    altitude: Optional[float] = None
    precision: Optional[float] = None


@dataclass
class GeoBounds:
    sw: GeoPoint
    ne: GeoPoint


# Action target — mirrors `ActionRef` from the JS SDK.
@dataclass
class ActionConfirm:
    title: str
    message: str
    submit_label: Optional[str] = None


@dataclass
class ActionRef:
    url: str
    method: Optional[str] = None  # 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
    body: Optional[Dict[str, Any]] = None
    confirm: Optional[ActionConfirm] = None


@dataclass
class MarkerPopup:
    title: Optional[str] = None
    body: Optional[str] = None     # markdown allowed
    image: Optional[str] = None
    actions: Optional[List[ActionRef]] = None


MapMarkerSize = Literal["sm", "md", "lg"]


@dataclass
class MapMarker:
    id: str
    location: GeoPoint
    # Display
    title: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    size: Optional[MapMarkerSize] = None
    selected: Optional[bool] = None
    # Interaction
    action: Optional[ActionRef] = None
    popup: Optional[MarkerPopup] = None
    # Free-form
    meta: Optional[Dict[str, Any]] = None


@dataclass
class MapViewport:
    center: Optional[GeoPoint] = None
    zoom: Optional[float] = None
    bounds: Optional[GeoBounds] = None
    fit_markers: Optional[bool] = None
    min_zoom: Optional[float] = None
    max_zoom: Optional[float] = None
    bearing: Optional[float] = None
    pitch: Optional[float] = None


MapBasemap = Literal["streets", "satellite", "terrain", "dark", "auto"]


@dataclass
class MapControls:
    zoom: Optional[bool] = None
    compass: Optional[bool] = None
    user_location: Optional[bool] = None
    layer_toggle: Optional[bool] = None
    scale: Optional[bool] = None
    fullscreen: Optional[bool] = None
    attribution: Optional[str] = None


# ----- Shapes (typed discriminated union) -----
MapShapeType = Literal["Polygon", "Circle", "Polyline", "Rectangle"]


@dataclass
class MapShapeStyle:
    fill_color: Optional[str] = None
    fill_opacity: Optional[float] = None
    stroke_color: Optional[str] = None
    stroke_opacity: Optional[float] = None
    stroke_width: Optional[float] = None
    dashed: Optional[bool] = None


@dataclass
class MapShape:
    id: str
    type: MapShapeType
    # Polygon / Polyline
    points: Optional[List[GeoPoint]] = None
    # Circle
    center: Optional[GeoPoint] = None
    radius: Optional[float] = None
    # Rectangle
    sw: Optional[GeoPoint] = None
    ne: Optional[GeoPoint] = None
    # Common
    config: Optional[MapShapeStyle] = None
    action: Optional[ActionRef] = None
    meta: Optional[Dict[str, Any]] = None


# ----- Layers -----
MapLayerType = Literal["markers", "shapes", "heatmap", "tiles", "geojson"]


@dataclass
class HeatmapPoint:
    lat: float
    lon: float
    intensity: Optional[float] = None


@dataclass
class MapLayer:
    """Discriminated layer payload. The fields you populate depend on `type`."""
    id: str
    type: MapLayerType
    name: Optional[str] = None
    legend_icon: Optional[str] = None
    visible: Optional[bool] = None
    toggleable: Optional[bool] = None
    z_index: Optional[int] = None
    min_zoom: Optional[float] = None
    max_zoom: Optional[float] = None
    # markers layer
    markers: Optional[List[MapMarker]] = None
    cluster: Optional[bool] = None
    cluster_radius: Optional[float] = None
    # shapes layer
    shapes: Optional[List[MapShape]] = None
    # heatmap layer
    points: Optional[List[HeatmapPoint]] = None
    radius: Optional[float] = None
    intensity_max: Optional[float] = None
    color_ramp: Optional[List[str]] = None
    # tiles layer
    url: Optional[str] = None
    attribution: Optional[str] = None
    max_native_zoom: Optional[float] = None
    opacity: Optional[float] = None
    # geojson layer
    data: Optional[Dict[str, Any]] = None
    default_marker_icon: Optional[str] = None
    default_shape_style: Optional[MapShapeStyle] = None


# ----- Picker -----
@dataclass
class MapPickConfig:
    submit_url: str
    prompt: Optional[str] = None
    initial_location: Optional[GeoPoint] = None
    submit_method: Optional[str] = None  # 'POST' | 'PUT'; default 'POST'
    submit_label: Optional[str] = None
    payload_key: Optional[str] = None    # default 'location'
    bounds: Optional[GeoBounds] = None
    snap_to_markers: Optional[bool] = None


MapMode = Literal["view", "pick"]


# ----- Content -----
@dataclass
class MapContent:
    title: str
    intro: Optional[str] = None
    viewport: Optional[MapViewport] = None
    basemap: Optional[MapBasemap] = None
    layers: List[MapLayer] = field(default_factory=list)
    controls: Optional[MapControls] = None
    empty_message: Optional[str] = None
    mode: Optional[MapMode] = None
    pick: Optional[MapPickConfig] = None


# GPS configuration
@dataclass
class GPSConfig:
    altitude: Optional[bool] = None
    precision: Optional[bool] = None
    live_data: Optional[bool] = None
    timeout: Optional[int] = None


# File configuration
@dataclass
class FileConfig:
    max_size: Optional[int] = None  # in bytes
    allowed_types: List[str] = field(default_factory=list)
    multiple: Optional[bool] = None
    compress: Optional[bool] = None


# QR configuration
@dataclass
class QRColorConfig:
    dark: Optional[str] = None
    light: Optional[str] = None


@dataclass
class QRConfig:
    size: Optional[int] = None
    error_correction: Optional[Literal["L", "M", "Q", "H"]] = None
    margin: Optional[int] = None
    color: Optional[QRColorConfig] = None


# QRScan content
@dataclass
class QRScanValidation:
    format: Optional[Literal["text", "number", "url", "email"]] = None
    starts_with: Optional[str] = None
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    error_message: Optional[str] = None


@dataclass
class QRScanPreview:
    enabled: bool
    label: Optional[str] = None


@dataclass
class SubmitAction:
    text: str
    method: Optional[HttpMethod] = None
    confirm_message: Optional[str] = None


@dataclass
class QRScanContent:
    title: str
    intro: Optional[str] = None
    auto_submit: Optional[bool] = True
    submit: Optional[SubmitAction] = None
    validation: Optional[QRScanValidation] = None
    preview: Optional[QRScanPreview] = None


# Validation types
@dataclass
class ValidationError:
    message: str
    field: Optional[str] = None
    code: Optional[str] = None
    value: Optional[Any] = None
    constraint: Optional[str] = None


@dataclass
class ValidationResult:
    is_valid: bool
    errors: List[ValidationError]
    warnings: Optional[List[ValidationError]] = None


def create_validation_error(message: str, field: Optional[str] = None) -> ValidationError:
    """Helper to create ValidationError from string"""
    return ValidationError(message=message, field=field)


def to_validation_errors(
    messages: List[str], field: Optional[str] = None
) -> List[ValidationError]:
    """Helper to convert string array to ValidationError array"""
    return [create_validation_error(msg, field) for msg in messages]


# Serialization options
@dataclass
class SerializationOptions:
    compress: Optional[bool] = None
    include_metadata: Optional[bool] = None
    format: Optional[Literal["json", "compact"]] = None


# Internationalization
@dataclass
class I18nConfig:
    locale: str
    fallback_locale: Optional[str] = None
    translations: Dict[str, Dict[str, str]] = field(default_factory=dict)


# Logging
@dataclass
class LogEntry:
    timestamp: datetime
    level: Literal["debug", "info", "warn", "error"]
    message: str
    context: Optional[Dict[str, Any]] = None
    stack: Optional[str] = None


# View state
ViewState = Dict[str, Any]


# Notification types
@dataclass
class NotificationMessage:
    title: str
    body: str
    link: Optional[str] = None  # Optional in-app navigation link


@dataclass
class NotificationPayload:
    user_id: str
    message: NotificationMessage


@dataclass
class SecureNotificationResponse:
    app_id: str
    signature: str
    timestamp: int
    notification: NotificationPayload

