import { z } from 'zod';

// Base types for the views
export type ViewType =
    | 'Reader'
    | 'ActionList'
    | 'ActionGrid'
    | 'IconGrid'
    | 'Form'
    | 'QRScan'
    | 'QRDisplay'
    | 'Dialog'
    | 'Message'
    | 'Card'
    | 'Carousel'
    | 'Timeline'
    | 'Media'
    | 'Map';

// Types for messages
export type MessageType = 'error' | 'info' | 'warning' | 'success';

// Types for HTTP methods
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

// Types for notifications
export interface NotificationMessage {
    title: string;
    body: string;
    link?: string; // Optional in-app navigation link (e.g., "/profile" or "app://view/123")
}

export interface NotificationPayload {
    userId: string;
    message: NotificationMessage;
}

export interface SecureNotificationResponse {
    appId: string;
    signature: string;
    timestamp: number;
    notification: NotificationPayload;
}

export interface NotificationConfig {
    baseUrl?: string; // Yeria platform base URL
    timeout?: number; // HTTP request timeout in ms (default: 5000)
}

// Navigation configuration for the views
/**
 * How a view sits in the client's navigation stack.
 *
 * `next` / `prev` are SIBLINGS in a sequence — the two arrows of a paginated
 * set of views, drawn by the client. They are never bound to the back gesture:
 * back undoes time, pagination moves sideways.
 *
 * `entry` says how THIS view enters the stack when it is displayed. It is the
 * answer to "must the user be able to come back to the screen that led here?",
 * and only the provider knows: a receipt replaces the form it acknowledges,
 * step 2 of a wizard does not replace step 1.
 */
/**
 * Comment cette vue entre dans la pile.
 *
 * Deux mots pour les cas courants, un NOMBRE pour un recul plus profond —
 * exprimé en écrans DU FOURNISSEUR, jamais en profondeur absolue : celle-ci
 * dépend du chemin par lequel l'utilisateur est arrivé, que le fournisseur ne
 * connaît pas.
 *
 *   1  = 'push'     la vue s'empile
 *   0  = 'replace'  elle prend la place de l'écran courant
 *  -1               elle prend aussi la place de celui d'en dessous
 *  -n               n+1 écrans laissent la place
 *
 * Le dépilement s'arrête TOUJOURS à la racine du service, quel que soit le
 * nombre : l'entrée du service reste atteignable. C'est ce qui rend un recul
 * relatif sûr — une même vue peut être servie depuis plusieurs chemins sans
 * jamais emporter plus que ce qui existe.
 */
export type NavigationEntry = 'push' | 'replace' | number;

/**
 * Où l'on se trouve dans la séquence. Des NOMBRES, pas une phrase : le client
 * les met en forme dans sa langue (« Page 1 / 2 », « Page 1 of 2 »). `total`
 * est facultatif — une séquence ouverte n'en connaît pas la fin.
 */
export interface PagePosition {
    current: number;  // 1-based
    total?: number;
}

export interface NavigationConfig {
    next?: string;  // URL of the next view in the sequence
    prev?: string;  // URL of the previous view in the sequence
    entry?: NavigationEntry;  // How this view enters the stack (default: 'push')
    page?: PagePosition;  // Position in the sequence, drawn by the client
}

// Process context for multi-step workflows
export interface ProcessContext {
    processId: string;           // Unique process identifier
    processName?: string;        // Human-readable process name
    currentStep?: number;        // Current step (1-based)
    totalSteps?: number;         // Total number of steps
    stepName?: string;           // Name of the current step
    canGoBack?: boolean;         // Can go back
    canSkip?: boolean;           // Can skip this step
    metadata?: Record<string, unknown>;  // Process metadata
}

// Base configuration for all views
export interface BaseViewConfig {
    id: string;
    type: ViewType;
    processId?: string;          // Process identifier (optional)
    metadata?: {
        version: string;
        createdAt: Date;
        author?: string;
        tags?: string[];
    };
}

// Configuration for form fields
export interface FieldValidation {
    required?: boolean;
    pattern?: RegExp;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    customValidator?: (value: unknown) => boolean | string;
    dependencies?: string[]; // Fields required if this field is filled
    conditional?: (formData: Record<string, unknown>) => boolean;
}

/**
 * Where a photo/audio/video field is allowed to take its content from.
 *  - `record`  : capture only — camera/microphone, no picking an existing file.
 *  - `library` : pick only — no capture UI.
 *  - `both`    : the user chooses (default).
 * Use `record` when the point is that the content was produced now.
 */
export type CaptureSource = 'record' | 'library' | 'both';

/**
 * Video capture ceiling. An enum rather than raw numbers so the renderer keeps
 * picking the concrete resolution/bitrate its device actually supports.
 *  - `low`    ≈ 480p  / ~1 Mbps   → ~7 MB per minute
 *  - `medium` ≈ 720p  / ~2.5 Mbps → ~19 MB per minute (default)
 *  - `high`   ≈ 1080p / ~4 Mbps   → ~30 MB per minute
 * Figures are typical mobile-encoder output, not a guarantee — size the
 * provider's request body limit with headroom.
 */
export type VideoQuality = 'low' | 'medium' | 'high';

export interface FormFieldParams extends FieldValidation {
    /**
     * Pre-filled value. For media fields (photo/file/audio/video) this is the
     * URL of a file ALREADY held by the provider — an array when the field is
     * `multiple`. Combined with `readonly: true` it turns the field into a
     * viewer for what the server already has, with no capture control.
     */
    value?: string | string[];
    options?: Array<{ label: string; value: unknown; selected?: boolean }>;
    accept?: string[];
    live?: boolean;
    placeholder?: string;
    helpText?: string;
    disabled?: boolean;
    readonly?: boolean;
    minDate?: string;      // For date fields: minimum date (YYYY-MM-DD)
    maxDate?: string;      // For date fields: maximum date (YYYY-MM-DD)

    // gps — these three used to reach the payload only through a spread, so
    // the type never knew about them and neither did anything reading it.
    altitude?: boolean;    // Include altitude in the captured value
    maxAccuracy?: number;  // Coarsest fix accepted, in METRES
    precision?: boolean;   // Legacy high-accuracy flag, superseded by maxAccuracy

    // photo / file / audio / video — multi-capture
    multiple?: boolean;    // Allow more than one item in this field
    maxCount?: number;     // Upper bound when `multiple` is true

    // audio / video — capture constraints
    maxDuration?: number;  // Seconds. Required for video: it is what bounds upload size
    minDuration?: number;  // Seconds. Rejects an accidental tap-and-release recording
    source?: CaptureSource;
    quality?: VideoQuality; // Video only
    maxSize?: number;      // Bytes. Client refuses to upload past this, before sending

    // select — comment presenter les choix. Voir SelectDisplay.
    display?: SelectDisplay;

    // paragraph — displayed text, never an input. See ParagraphParams.
    size?: ParagraphSize | SpacerSize;
    bold?: boolean;
    italic?: boolean;
}

/**
 * Comment un `select` presente ses options. Une PREFERENCE d'affichage, pas
 * un type de champ : le sens est le meme dans les deux cas — un seul choix
 * parmi plusieurs.
 *
 * - `dropdown` (defaut) : le champ ouvre une feuille de selection. Le bon
 *   choix des qu'il y a beaucoup d'options.
 * - `radio` : toutes les options a plat dans le formulaire, une seule
 *   cochable. Le bon choix quand elles sont peu nombreuses et qu'on veut
 *   pouvoir les comparer sans rien ouvrir.
 *
 * Un client qui ignore cette cle retombe sur `dropdown` : la vue reste
 * utilisable, elle est seulement moins bien presentee.
 */
export type SelectDisplay = 'dropdown' | 'radio';

/**
 * Size of a `paragraph` block. A SIZE, not a role: the SDK does not decide
 * whether a block is a heading, an instruction or a caption — the provider
 * does, by picking a size and, if wanted, an emphasis.
 *
 * Four steps, matching the app's own type scale:
 *   'xl' — 24px   'lg' — 18px   'md' — 14px (default)   'sm' — 12px
 *
 * A closed list rather than a free number: an open scale would let every
 * provider invent its own typography, and the renderer could no longer keep
 * one service looking like the next.
 */
export type ParagraphSize = 'xl' | 'lg' | 'md' | 'sm';

/// Trois crans d'espacement, pas une mesure : le fournisseur demande une
/// respiration, le client décide de sa hauteur.
export type SpacerSize = 'sm' | 'md' | 'lg';

// Configuration for actions
export interface ActionConfig {
    code: string;
    title: string;
    desc?: string;
    thumbnail?: string;
    badge?: string;          // small overlay text on IconGrid tiles (e.g. "3", "New")
    disabled?: boolean;
    metadata?: Record<string, unknown>;
}

// Configuration for content elements
export interface ContentElement {
    type: string;
    [key: string]: unknown;
}

export interface MarkdownPage {
    content: string;
    raw: string;
    sanitized: boolean;
}

export type ReaderElement =
    | { type: 'paragraph'; text: string }
    | { type: 'subtitle'; text: string }
    | { type: 'image'; url: string; alt?: string; caption?: string }
    | { type: 'markdown'; pages: MarkdownPage[] }
    | { type: 'list'; items: string[]; ordered?: boolean }
    | { type: 'link'; url: string; text: string; description?: string }
    | { type: 'table'; headers: string[]; rows: string[][] }
    | { type: 'code'; code: string; language?: string }
    | { type: 'quote'; text: string; author?: string; source?: string }
    | { type: 'separator' }
    | { type: 'custom'; kind: string; data: Record<string, unknown> };

export interface CardImage {
    url: string;
    alt?: string;
}

export interface CardStat {
    label: string;
    value: string;
}

export interface CardSection {
    heading: string;
    body: string;
}

export type CardActionVariant = 'primary' | 'secondary' | 'link';

export interface CardAction {
    text: string;
    method?: HttpMethod;
    confirmMessage?: string;
    href?: string;
    icon?: string;
    variant?: CardActionVariant;
}

export interface CardContent {
    title: string;
    /**
     * Ligne de contexte sous le titre — même clé et même rôle que l'`intro`
     * des onze autres vues. Elle s'appelait `subtitle` ; `setSubtitle` en
     * reste l'alias.
     */
    intro?: string;
    description?: string;
    badge?: string;
    image?: CardImage;
    /**
     * Intitulé du bloc de statistiques. Absent = pas de titre : le client ne
     * dessine que ce que le fournisseur a posé, comme pour `CardSection`.
     */
    statsHeading?: string;
    stats: CardStat[];
    sections: CardSection[];
    actions: CardAction[];
    meta?: Record<string, unknown>;
}

export interface CarouselSlide {
    id: string;
    title: string;
    description?: string;
    badge?: string;
    image?: CardImage;
    actions?: CardAction[];
    meta?: Record<string, unknown>;
}

export interface CarouselSettings {
    autoplay?: boolean;
    intervalMs?: number;
    loop?: boolean;
    showIndicators?: boolean;
}

export interface CarouselContent {
    title: string;
    /** Voir {@link CardContent.intro} — `setSubtitle` en reste l'alias. */
    intro?: string;
    slides: CarouselSlide[];
    settings?: CarouselSettings;
}

export type TimelineStatus = 'pending' | 'active' | 'completed' | 'error';

export interface TimelineItem {
    id: string;
    title: string;
    timestamp: string;
    description?: string;
    status?: TimelineStatus;
    icon?: string;
    meta?: Record<string, unknown>;
}

export interface TimelineContent {
    title: string;
    intro?: string;
    items: TimelineItem[];
}

export type MediaKind = 'audio' | 'video';

export interface MediaSource {
    src: string;
    type?: string;
}

export interface MediaItem {
    id: string;
    kind: MediaKind;
    title?: string;
    description?: string;
    poster?: string;
    autoplay?: boolean;
    loop?: boolean;
    controls?: boolean;
    /** Marks the entry shown first in the player. Set via
     *  MediaView.setSelectedItem(id) (which clears any other) — not manually. */
    selected?: boolean;
    sources: MediaSource[];
    meta?: Record<string, unknown>;
}

export interface MediaContent {
    title: string;
    intro?: string;
    items: MediaItem[];
}

// ============================================================
// MapView v2 — see specs/map-view.md
// ============================================================

/** Action target — same shape used across Yeria views (marker click, shape click, popup buttons). */
export interface ActionRef {
    url: string;
    method?: HttpMethod;       // default GET
    body?: Record<string, unknown>;
    confirm?: { title: string; message: string; submitLabel?: string };
}

/** Rich popup content for a marker (supersedes the default title+description popup). */
export interface MarkerPopup {
    title?: string;            // defaults to marker.title
    body?: string;             // markdown allowed
    image?: string;            // URL
    actions?: ActionRef[];     // inline action buttons inside the popup
}

export type MapMarkerSize = 'sm' | 'md' | 'lg';

export interface MapMarker {
    id: string;
    location: GeoPoint;
    // Display
    title?: string;
    description?: string;
    icon?: string;             // catalog name | URL | data: URI
    color?: string;            // hex string, e.g. '#1A73E8'
    size?: MapMarkerSize;      // default 'md'
    selected?: boolean;        // renderer should highlight; default false
    // Interaction
    action?: ActionRef;
    popup?: MarkerPopup;
    // Free-form
    meta?: Record<string, unknown>;
}

// ----- Viewport / Controls -----
export interface MapViewport {
    center?: GeoPoint;
    zoom?: number;
    bounds?: { sw: GeoPoint; ne: GeoPoint };
    fitMarkers?: boolean;      // takes precedence over bounds + center+zoom
    minZoom?: number;
    maxZoom?: number;
    bearing?: number;          // 0..360
    pitch?: number;            // 0..60
}

export type MapBasemap = 'streets' | 'satellite' | 'terrain' | 'dark' | 'auto';

export interface MapControls {
    zoom?: boolean;            // default true
    compass?: boolean;         // default true
    userLocation?: boolean;    // default false
    layerToggle?: boolean;     // default true if any layer is toggleable
    scale?: boolean;           // default false
    fullscreen?: boolean;      // default false
    attribution?: string;      // overrides renderer default attribution
}

// ----- Shapes (typed discriminated union) -----
export type MapShapeType = 'Polygon' | 'Circle' | 'Polyline' | 'Rectangle';

export interface MapShapeStyle {
    fillColor?: string;
    fillOpacity?: number;      // 0..1
    strokeColor?: string;
    strokeOpacity?: number;    // 0..1
    strokeWidth?: number;      // px
    dashed?: boolean;
}

interface MapShapeBase {
    id: string;
    config?: MapShapeStyle;
    action?: ActionRef;
    meta?: Record<string, unknown>;
}

export interface PolygonShape extends MapShapeBase {
    type: 'Polygon';
    points: GeoPoint[];        // 3+ points
}

export interface CircleShape extends MapShapeBase {
    type: 'Circle';
    center: GeoPoint;
    radius: number;            // meters
}

export interface PolylineShape extends MapShapeBase {
    type: 'Polyline';
    points: GeoPoint[];        // 2+ points
}

export interface RectangleShape extends MapShapeBase {
    type: 'Rectangle';
    sw: GeoPoint;
    ne: GeoPoint;
}

export type MapShape = PolygonShape | CircleShape | PolylineShape | RectangleShape;

// ----- Layers -----
export type MapLayerType = 'markers' | 'shapes' | 'heatmap' | 'tiles' | 'geojson';

interface MapLayerBase {
    id: string;
    name?: string;             // shown in legend / toggle UI
    legendIcon?: string;
    visible?: boolean;         // default true
    toggleable?: boolean;      // default true
    zIndex?: number;
    minZoom?: number;
    maxZoom?: number;
}

export interface MarkersLayer extends MapLayerBase {
    type: 'markers';
    markers: MapMarker[];
    cluster?: boolean;         // default true when markers.length > 50
    clusterRadius?: number;    // px; default 50
}

export interface ShapesLayer extends MapLayerBase {
    type: 'shapes';
    shapes: MapShape[];
}

export interface HeatmapPoint {
    lat: number;
    lon: number;
    intensity?: number;        // 0..intensityMax; default 1
}

export interface HeatmapLayer extends MapLayerBase {
    type: 'heatmap';
    points: HeatmapPoint[];
    radius?: number;           // px; default 25
    intensityMax?: number;     // default 1
    colorRamp?: string[];      // hex stops, low-to-high
}

export interface TilesLayer extends MapLayerBase {
    type: 'tiles';
    url: string;               // {z}/{x}/{y} template
    attribution: string;
    maxNativeZoom?: number;
    opacity?: number;          // 0..1
}

export interface GeoJsonLayer extends MapLayerBase {
    type: 'geojson';
    data: object;              // RFC 7946 FeatureCollection | Feature | Geometry
    defaultMarkerIcon?: string;
    defaultShapeStyle?: MapShapeStyle;
}

export type MapLayer = MarkersLayer | ShapesLayer | HeatmapLayer | TilesLayer | GeoJsonLayer;

// ----- Picker (location input) -----
export interface MapPickConfig {
    prompt?: string;
    initialLocation?: GeoPoint;
    submitUrl: string;
    submitMethod?: 'POST' | 'PUT';      // default POST
    submitLabel?: string;                // default 'Confirm'
    payloadKey?: string;                 // default 'location'
    bounds?: { sw: GeoPoint; ne: GeoPoint };
    snapToMarkers?: boolean;             // default false
}

export type MapMode = 'view' | 'pick';

// ----- Content -----
export interface MapContent {
    title: string;
    intro?: string;
    viewport?: MapViewport;
    basemap?: MapBasemap;                // default 'auto'
    layers: MapLayer[];                  // single data path; empty stack requires emptyMessage in 'view' mode
    controls?: MapControls;
    emptyMessage?: string;
    mode?: MapMode;                      // default 'view'
    pick?: MapPickConfig;                // required when mode === 'pick'
}

// Configuration for submit actions (convention-based)
export interface SubmitAction {
    text: string;              // Button text: "Register", "Submit", etc.
    method?: HttpMethod;       // Optional: defaults to POST
    confirmMessage?: string;   // Optional confirmation: "Are you sure?"
}

/**
 * Second action of a form, rendered under the submit button, in the same
 * footer bar and with a secondary weight.
 *
 * `mode` decides what happens to what the user has typed, and it is explicit
 * on purpose — guessing would be a bug:
 *   'navigate' : call `url`, render whatever view comes back. Entered values
 *                are DISCARDED. This is "Skip", "Cancel", "Come back later".
 *   'submit'   : send the current values to `url` with `method`. A second
 *                destination for the same data — "Save as draft".
 *
 * `validate` says whether the form must be valid first. It defaults to false
 * for 'navigate' (a Skip blocked by an empty required field would be absurd)
 * and to true for 'submit'.
 */
export interface SecondaryAction {
    text: string;
    url: string;
    mode?: 'navigate' | 'submit';   // default: 'navigate'
    method?: HttpMethod;            // 'submit' only, default POST
    validate?: boolean;             // default: mode === 'submit'
    confirmMessage?: string;
}

// Zod validation schemas
export const FieldSchema = z.object({
    fieldType: z.string(),
    fieldId: z.string(),
    fieldLabel: z.string(),
    required: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    options: z.array(z.object({
        label: z.string(),
        value: z.unknown(),
    })).optional(),
    accept: z.array(z.string()).optional(),
    live: z.boolean().optional(),
    placeholder: z.string().optional(),
    helpText: z.string().optional(),
    disabled: z.boolean().optional(),
    readonly: z.boolean().optional(),
    multiple: z.boolean().optional(),
    maxCount: z.number().optional(),
    maxDuration: z.number().optional(),
    minDuration: z.number().optional(),
    source: z.enum(['record', 'library', 'both']).optional(),
    quality: z.enum(['low', 'medium', 'high']).optional(),
    maxSize: z.number().optional(),
});

export const ActionSchema = z.object({
    code: z.string(),
    title: z.string(),
    desc: z.string().optional(),
    thumbnail: z.string().optional(),
    badge: z.string().optional(),
    disabled: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
});

// Types for plugins
export interface ViewPlugin {
    name: string;
    version: string;
    enhance(view: any): void;
    priority?: number;
}

// Types for custom fields
export interface CustomFieldType {
    type: string;
    renderer: (config: Record<string, unknown>) => unknown;
    validator: (value: unknown) => boolean;
    schema?: z.ZodSchema;
}

// Types for state management
export interface ViewState {
    [key: string]: unknown;
}

// Types for validation results
export interface ValidationError {
    field?: string;
    code?: string;
    message: string;
    value?: unknown;
    constraint?: string;
}

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings?: ValidationError[];
}

/**
 * Helper to create ValidationError from string (backward compatibility)
 */
export function createValidationError(message: string, field?: string): ValidationError {
    return { message, field };
}

/**
 * Helper to convert string array to ValidationError array (backward compatibility)
 */
export function toValidationErrors(messages: string[], field?: string): ValidationError[] {
    return messages.map(message => ({ message, field }));
}

// Types for serialization
export interface SerializationOptions {
    compress?: boolean;
    includeMetadata?: boolean;
    format?: 'json' | 'compact';
}

// Types for internationalization
export interface I18nConfig {
    locale: string;
    fallbackLocale?: string;
    translations: Record<string, Record<string, string>>;
}

// Types for logging
export interface LogEntry {
    timestamp: Date;
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    context?: Record<string, unknown>;
    stack?: string;
}

// Types for geographic coordinates
export interface GeoPoint {
    lat: number;
    lon: number;
    altitude?: number;
    precision?: number;
}

// Types for GPS configurations
export interface GPSConfig {
    altitude?: boolean;
    precision?: boolean;
    liveData?: boolean;
    timeout?: number;
}

// Types for file configurations
export interface FileConfig {
    maxSize?: number; // in bytes
    allowedTypes: string[];
    multiple?: boolean;
    compress?: boolean;
}

// Types for QR configurations (QRDisplay only)
export interface QRConfig {
    size?: number;
    errorCorrection?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
    color?: {
        dark?: string;
        light?: string;
    };
}

// QRScan view content (scanner configuration)
// The mobile app handles all scanner implementation (camera, torch, formats, UI)
// The view only describes what to scan and where to submit
export interface QRScanContent {
    title: string;                    // View title: "Scan Ticket"
    intro?: string;                   // User instructions
    autoSubmit?: boolean;             // Auto-submit after scan (default: true)
    submit?: SubmitAction;            // If present, disables autoSubmit
    validation?: {                    // Optional simple validation rules (mobile validates, server MUST re-validate)
        format?: 'text' | 'number' | 'url' | 'email';  // Simple format validation
        startsWith?: string;          // Required prefix (exempt from format validation)
        minLength?: number;           // Min length (includes prefix if startsWith is set)
        maxLength?: number;           // Max length (includes prefix if startsWith is set)
        errorMessage?: string;        // Error message to show user
    };
    preview?: {                       // Preview before submit (requires submit button)
        enabled?: boolean;            // Echo the scanned value, read-only
        label?: string;               // Field label in preview: "Scanned Code"
    };
}
