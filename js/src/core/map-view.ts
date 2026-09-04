import { BaseView } from './base-view';
import {
    ActionRef,
    GeoPoint,
    HeatmapPoint,
    MapBasemap,
    MapContent,
    MapControls,
    MapLayer,
    MapMarker,
    MapPickConfig,
    MapShape,
    MapShapeStyle,
    MapViewport,
    MarkerPopup,
    MarkersLayer,
    ShapesLayer
} from '../types';
import {
    DuplicateLayerIdError,
    InvalidGeoPointError,
    InvalidParameterError,
    InvalidViewportError,
    LayerNotFoundError,
    LayerTypeMismatchError,
    MissingRequiredParameterError
} from '../errors';

/**
 * Drops the keys left `undefined`, so an unset field is absent rather than
 * present-and-undefined. `JSON.stringify` would drop it anyway; this keeps the
 * in-memory object honest too, and matches what Python emits.
 */
function stripUndefined<T extends object>(obj: T): T {
    const rec = obj as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
        if (rec[key] === undefined) delete rec[key];
    }
    return obj;
}

// ─── wire emitters ──────────────────────────────────────────────────
//
// Every part of the map content is spelt out here rather than spread from
// the caller's object. `{ ...marker }` carried the CALLER's key order into a
// signed payload — `{ location, id }` and `{ id, location }` signed
// differently — and neither matched Python. Each emitter follows the order
// of its `_*_to_dict` counterpart in py/yeriasdk/views/map_view.py; the
// byte goldens (`partBytes`) hold the two in step.

function geoToWire(p: GeoPoint): GeoPoint {
    return stripUndefined({ lat: p.lat, lon: p.lon, altitude: p.altitude, precision: p.precision });
}

function boundsToWire(b: { sw: GeoPoint; ne: GeoPoint }): { sw: GeoPoint; ne: GeoPoint } {
    return { sw: geoToWire(b.sw), ne: geoToWire(b.ne) };
}

function actionToWire(a: ActionRef): ActionRef {
    return stripUndefined({
        url: a.url,
        method: a.method,
        body: a.body,
        confirm: a.confirm
            ? stripUndefined({ title: a.confirm.title, message: a.confirm.message, submitLabel: a.confirm.submitLabel })
            : undefined
    });
}

function styleToWire(s: MapShapeStyle): MapShapeStyle {
    return stripUndefined({
        fillColor: s.fillColor,
        fillOpacity: s.fillOpacity,
        strokeColor: s.strokeColor,
        strokeOpacity: s.strokeOpacity,
        strokeWidth: s.strokeWidth,
        dashed: s.dashed
    });
}

function popupToWire(p: MarkerPopup): MarkerPopup {
    return stripUndefined({
        title: p.title,
        body: p.body,
        image: p.image,
        actions: p.actions ? p.actions.map(actionToWire) : undefined
    });
}

function markerToWire(m: MapMarker): MapMarker {
    return stripUndefined({
        id: m.id.trim(),
        location: geoToWire(m.location),
        title: m.title?.trim(),
        description: m.description?.trim(),
        icon: m.icon,
        color: m.color,
        size: m.size,
        selected: m.selected,
        meta: m.meta,
        action: m.action ? actionToWire(m.action) : undefined,
        popup: m.popup ? popupToWire(m.popup) : undefined
    });
}

// A number that can travel: `NaN` and `±Infinity` have no JSON form —
// `JSON.stringify` writes `null`, Python's `json.dumps` writes `NaN`, and a
// signed payload carrying either is one no client can read back. Same rule
// as the form's numeric fields (`validateNumber`), applied to every number a
// map carries.
function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function assertFiniteIfSet(value: unknown, name: string, ctx: string): void {
    if (value !== undefined && !isFiniteNumber(value)) {
        throw new InvalidParameterError(name, value, `${ctx}: ${name} must be a finite number`);
    }
}

// GeoJSON `data` is opaque to the SDK and copied whole into the payload, so
// it is walked whole: a non-finite number anywhere inside it — coordinates,
// bbox, a property — has no JSON form and is refused.
function assertNoNonFiniteNumber(value: unknown, ctx: string): void {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new InvalidParameterError('data', value, `${ctx}: contains a non-finite number`);
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach(v => assertNoNonFiniteNumber(v, ctx));
    } else if (value && typeof value === 'object') {
        for (const v of Object.values(value as Record<string, unknown>)) assertNoNonFiniteNumber(v, ctx);
    }
}

function assertStyleFinite(style: MapShapeStyle, ctx: string): void {
    assertFiniteIfSet(style.fillOpacity, 'fillOpacity', ctx);
    assertFiniteIfSet(style.strokeOpacity, 'strokeOpacity', ctx);
    assertFiniteIfSet(style.strokeWidth, 'strokeWidth', ctx);
}

// The geometry keys of every shape variant, so one emitter serves all four.
type ShapeGeometry = { points?: GeoPoint[]; center?: GeoPoint; radius?: number; sw?: GeoPoint; ne?: GeoPoint };

function shapeToWire(s: MapShape): MapShape {
    const g = s as unknown as ShapeGeometry;
    return stripUndefined({
        id: s.id.trim(),
        type: s.type,
        points: g.points ? g.points.map(geoToWire) : undefined,
        center: g.center ? geoToWire(g.center) : undefined,
        radius: g.radius,
        sw: g.sw ? geoToWire(g.sw) : undefined,
        ne: g.ne ? geoToWire(g.ne) : undefined,
        config: s.config ? styleToWire(s.config) : undefined,
        action: s.action ? actionToWire(s.action) : undefined,
        meta: s.meta
    }) as unknown as MapShape;
}

function heatPointToWire(p: HeatmapPoint): HeatmapPoint {
    return stripUndefined({ lat: p.lat, lon: p.lon, intensity: p.intensity });
}

function layerToWire(layer: MapLayer): MapLayer {
    // The base keys come first on every layer type, in Python's order; the
    // spread below is of THIS object, never of the caller's. `id` and `type`
    // are written per case so the discriminant survives for the type checker.
    const base = {
        name: layer.name,
        legendIcon: layer.legendIcon,
        visible: layer.visible,
        toggleable: layer.toggleable,
        zIndex: layer.zIndex,
        minZoom: layer.minZoom,
        maxZoom: layer.maxZoom
    };
    switch (layer.type) {
        case 'markers':
            return stripUndefined({
                id: layer.id,
                type: layer.type,
                ...base,
                markers: (layer.markers ?? []).map(markerToWire),
                cluster: layer.cluster,
                clusterRadius: layer.clusterRadius
            });
        case 'shapes':
            return stripUndefined({ id: layer.id, type: layer.type, ...base, shapes: (layer.shapes ?? []).map(shapeToWire) });
        case 'heatmap':
            return stripUndefined({
                id: layer.id,
                type: layer.type,
                ...base,
                points: (layer.points ?? []).map(heatPointToWire),
                radius: layer.radius,
                intensityMax: layer.intensityMax,
                colorRamp: layer.colorRamp
            });
        case 'tiles':
            return stripUndefined({
                id: layer.id,
                type: layer.type,
                ...base,
                url: layer.url,
                attribution: layer.attribution,
                maxNativeZoom: layer.maxNativeZoom,
                opacity: layer.opacity
            });
        case 'geojson':
            return stripUndefined({
                id: layer.id,
                type: layer.type,
                ...base,
                data: layer.data,
                defaultMarkerIcon: layer.defaultMarkerIcon,
                defaultShapeStyle: layer.defaultShapeStyle ? styleToWire(layer.defaultShapeStyle) : undefined
            });
    }
}

/**
 * MapView (v2) — see specs/map-view.md
 *
 * Wire format: a single data path, `content.layers[]`. Even one-marker views
 * are described as `[{ type: 'markers', markers: [...] }]`.
 *
 * SDK ergonomics: `addMarker / addPolygon / addCircle / ...` are convenience
 * methods that target either an implicit default layer (`_default_markers` or
 * `_default_shapes`, auto-created on first call) or a named layer (passed as
 * the optional final `layerId` argument). Named layers must be declared up
 * front via `addLayer({...})`.
 *
 * Extends {@link BaseView}; instantiated by the YeriaApp/YeriaUI factory,
 * populated with these builders, then serialized to a JSON view description and
 * signed into a v3 envelope by `serve()`.
 */
export class MapView extends BaseView {

    static fromJson(json: Record<string, unknown>): MapView {
        return MapView.fromJsonAs(MapView, 'Map', json);
    }
    public static readonly DEFAULT_MARKERS_LAYER_ID = '_default_markers';
    public static readonly DEFAULT_SHAPES_LAYER_ID  = '_default_shapes';

    constructor(viewId: string, title: string, processId?: string) {
        super({
            id: viewId,
            type: 'Map',
            processId,
            metadata: {
                version: '2.0.0',
                createdAt: new Date()
            }
        });

        this.content = {
            title,
            layers: [],
            controls: { zoom: true, compass: true, userLocation: false }
        } as MapContent;
    }

    // ─── view-level setters ─────────────────────────────────────────────

    setIntro(intro: string): this {
        return this.setIntroText('intro', intro);
    }

    setBasemap(name: MapBasemap): this {
        (this.content as MapContent).basemap = name;
        return this;
    }

    setViewport(viewport: MapViewport): this {
        this.validateViewport(viewport);
        (this.content as MapContent).viewport = stripUndefined({
            center: viewport.center ? geoToWire(viewport.center) : undefined,
            zoom: viewport.zoom,
            bounds: viewport.bounds ? boundsToWire(viewport.bounds) : undefined,
            fitMarkers: viewport.fitMarkers,
            minZoom: viewport.minZoom,
            maxZoom: viewport.maxZoom,
            bearing: viewport.bearing,
            pitch: viewport.pitch
        });
        return this;
    }

    setControls(controls: MapControls): this {
        (this.content as MapContent).controls = stripUndefined({
            zoom: controls.zoom,
            compass: controls.compass,
            userLocation: controls.userLocation,
            layerToggle: controls.layerToggle,
            scale: controls.scale,
            fullscreen: controls.fullscreen,
            attribution: controls.attribution
        });
        return this;
    }

    setEmptyMessage(text: string): this {
        (this.content as MapContent).emptyMessage = text;
        return this;
    }

    // Turns the map into a location picker that submits the chosen point to config.submitUrl.
    setPickMode(config: MapPickConfig): this {
        if (!config || typeof config.submitUrl !== 'string' || !config.submitUrl.trim()) {
            throw new MissingRequiredParameterError('pick.submitUrl');
        }
        const submitUrl = this.assertNavigationTarget('pick.submitUrl', config.submitUrl, {
            allowRelative: true,
            allowViewId: false
        });
        if (config.initialLocation) {
            this.validateGeoPoint(config.initialLocation, 'pick.initialLocation');
        }
        if (config.bounds) {
            this.validateGeoPoint(config.bounds.sw, 'pick.bounds.sw');
            this.validateGeoPoint(config.bounds.ne, 'pick.bounds.ne');
        }
        const content = this.content as MapContent;
        content.mode = 'pick';
        // Spelt out rather than spread, in Python's emission order: `...config`
        // let the caller's key order into a signed payload.
        const pick: Record<string, unknown> = {
            submitUrl,
            prompt: config.prompt,
            initialLocation: config.initialLocation ? geoToWire(config.initialLocation) : undefined,
            submitMethod: config.submitMethod,
            submitLabel: config.submitLabel,
            payloadKey: config.payloadKey,
            bounds: config.bounds ? boundsToWire(config.bounds) : undefined,
            snapToMarkers: config.snapToMarkers
        };
        for (const key of Object.keys(pick)) {
            if (pick[key] === undefined) delete pick[key];
        }
        content.pick = pick as unknown as MapContent['pick'];
        return this;
    }

    // ─── layer management ───────────────────────────────────────────────

    // Declares a named layer (markers/shapes/heatmap/tiles/geojson); ids must be unique.
    addLayer(layer: MapLayer): this {
        if (!layer || typeof layer !== 'object') {
            throw new MissingRequiredParameterError('layer');
        }
        if (typeof layer.id !== 'string' || !layer.id.trim()) {
            throw new MissingRequiredParameterError('layer.id');
        }
        const content = this.content as MapContent;
        if (content.layers.some(l => l.id === layer.id)) {
            throw new DuplicateLayerIdError(layer.id);
        }
        this.validateLayer(layer);
        // Rebuilt rather than copied: the caller keeps no handle on the
        // payload, and the key order is the wire order, not the caller's.
        content.layers.push(layerToWire(layer));
        return this;
    }

    setLayers(layers: MapLayer[]): this {
        if (!Array.isArray(layers)) {
            throw new InvalidParameterError('layers', layers, 'must be an array');
        }
        (this.content as MapContent).layers = [];
        for (const l of layers) this.addLayer(l);
        return this;
    }

    clearLayers(): this {
        (this.content as MapContent).layers = [];
        return this;
    }

    getLayer(id: string): MapLayer | undefined {
        return (this.content as MapContent).layers.find(l => l.id === id);
    }

    // ─── markers (default layer or named target) ────────────────────────

    // Adds one marker to the default markers layer, or to the named layerId if given.
    addMarker(marker: MapMarker, layerId?: string): this {
        if (!marker || typeof marker !== 'object') {
            throw new MissingRequiredParameterError('marker');
        }
        if (typeof marker.id !== 'string' || !marker.id.trim()) {
            throw new MissingRequiredParameterError('marker.id');
        }
        this.validateGeoPoint(marker.location, `marker "${marker.id}".location`);

        const layer = this.resolveOrCreateMarkersLayer(layerId);
        layer.markers.push(markerToWire(marker));
        return this;
    }

    addMarkers(markers: MapMarker[], layerId?: string): this {
        if (!Array.isArray(markers)) {
            throw new InvalidParameterError('markers', markers, 'must be an array');
        }
        for (const m of markers) this.addMarker(m, layerId);
        return this;
    }

    clearMarkers(layerId?: string): this {
        const target = layerId ?? MapView.DEFAULT_MARKERS_LAYER_ID;
        const layer = this.getLayer(target);
        if (!layer) return this;
        if (layer.type !== 'markers') {
            throw new LayerTypeMismatchError(target, 'markers', layer.type);
        }
        (layer as MarkersLayer).markers = [];
        return this;
    }

    // ─── shapes (default layer or named target) ─────────────────────────

    // Adds one shape to the default shapes layer, or to the named layerId if given.
    addShape(shape: MapShape, layerId?: string): this {
        if (!shape || typeof shape !== 'object') {
            throw new MissingRequiredParameterError('shape');
        }
        if (typeof shape.id !== 'string' || !shape.id.trim()) {
            throw new MissingRequiredParameterError('shape.id');
        }
        this.validateShape(shape);

        const layer = this.resolveOrCreateShapesLayer(layerId);
        layer.shapes.push(shapeToWire(shape));
        return this;
    }

    // Convenience wrapper over addShape for a Polygon (>= 3 points).
    addPolygon(id: string, points: GeoPoint[], config?: MapShapeStyle, layerId?: string): this {
        return this.addShape({ id, type: 'Polygon', points, config }, layerId);
    }

    // Convenience wrapper over addShape for a Circle (center + radius in meters).
    addCircle(id: string, center: GeoPoint, radius: number, config?: MapShapeStyle, layerId?: string): this {
        return this.addShape({ id, type: 'Circle', center, radius, config }, layerId);
    }

    // Convenience wrapper over addShape for a Polyline (>= 2 points).
    addPolyline(id: string, points: GeoPoint[], config?: MapShapeStyle, layerId?: string): this {
        return this.addShape({ id, type: 'Polyline', points, config }, layerId);
    }

    // Convenience wrapper over addShape for a Rectangle (south-west + north-east corners).
    addRectangle(id: string, sw: GeoPoint, ne: GeoPoint, config?: MapShapeStyle, layerId?: string): this {
        return this.addShape({ id, type: 'Rectangle', sw, ne, config }, layerId);
    }

    clearShapes(layerId?: string): this {
        const target = layerId ?? MapView.DEFAULT_SHAPES_LAYER_ID;
        const layer = this.getLayer(target);
        if (!layer) return this;
        if (layer.type !== 'shapes') {
            throw new LayerTypeMismatchError(target, 'shapes', layer.type);
        }
        (layer as ShapesLayer).shapes = [];
        return this;
    }

    getContent(): MapContent {
        return this.content as MapContent;
    }

    // ─── private helpers ────────────────────────────────────────────────

    private resolveOrCreateMarkersLayer(layerId?: string): MarkersLayer {
        const content = this.content as MapContent;
        if (layerId) {
            const layer = content.layers.find(l => l.id === layerId);
            if (!layer) throw new LayerNotFoundError(layerId);
            if (layer.type !== 'markers') {
                throw new LayerTypeMismatchError(layerId, 'markers', layer.type);
            }
            return layer as MarkersLayer;
        }
        let def = content.layers.find(l => l.id === MapView.DEFAULT_MARKERS_LAYER_ID);
        if (!def) {
            const created: MarkersLayer = {
                id: MapView.DEFAULT_MARKERS_LAYER_ID,
                type: 'markers',
                markers: [],
                toggleable: false
            };
            content.layers.push(created);
            return created;
        }
        if (def.type !== 'markers') {
            throw new LayerTypeMismatchError(def.id, 'markers', def.type);
        }
        return def as MarkersLayer;
    }

    private resolveOrCreateShapesLayer(layerId?: string): ShapesLayer {
        const content = this.content as MapContent;
        if (layerId) {
            const layer = content.layers.find(l => l.id === layerId);
            if (!layer) throw new LayerNotFoundError(layerId);
            if (layer.type !== 'shapes') {
                throw new LayerTypeMismatchError(layerId, 'shapes', layer.type);
            }
            return layer as ShapesLayer;
        }
        let def = content.layers.find(l => l.id === MapView.DEFAULT_SHAPES_LAYER_ID);
        if (!def) {
            const created: ShapesLayer = {
                id: MapView.DEFAULT_SHAPES_LAYER_ID,
                type: 'shapes',
                shapes: [],
                toggleable: false
            };
            content.layers.push(created);
            return created;
        }
        if (def.type !== 'shapes') {
            throw new LayerTypeMismatchError(def.id, 'shapes', def.type);
        }
        return def as ShapesLayer;
    }

    private validateGeoPoint(p: GeoPoint | undefined, ctx: string): void {
        if (!p || typeof p !== 'object') {
            throw new InvalidGeoPointError(p, `${ctx}: location is required`);
        }
        // `NaN` passes every comparison below, so finiteness comes first.
        if (!isFiniteNumber(p.lat) || p.lat < -90 || p.lat > 90) {
            throw new InvalidGeoPointError(p, `${ctx}: lat must be a finite number in [-90, 90]`);
        }
        if (!isFiniteNumber(p.lon) || p.lon < -180 || p.lon > 180) {
            throw new InvalidGeoPointError(p, `${ctx}: lon must be a finite number in [-180, 180]`);
        }
        if (p.altitude !== undefined && !isFiniteNumber(p.altitude)) {
            throw new InvalidGeoPointError(p, `${ctx}: altitude must be a finite number`);
        }
        if (p.precision !== undefined && !isFiniteNumber(p.precision)) {
            throw new InvalidGeoPointError(p, `${ctx}: precision must be a finite number`);
        }
    }

    // A layer handed to addLayer carries markers, shapes or points of its
    // own; they take the same checks as the ones added one by one.
    private validateLayer(layer: MapLayer): void {
        const ctx = `layer "${layer.id}"`;
        assertFiniteIfSet(layer.zIndex, 'zIndex', ctx);
        assertFiniteIfSet(layer.minZoom, 'minZoom', ctx);
        assertFiniteIfSet(layer.maxZoom, 'maxZoom', ctx);
        switch (layer.type) {
            case 'markers':
                (layer.markers ?? []).forEach(m => this.validateGeoPoint(m.location, `marker "${m.id}".location`));
                assertFiniteIfSet(layer.clusterRadius, 'clusterRadius', ctx);
                break;
            case 'shapes':
                (layer.shapes ?? []).forEach(s => this.validateShape(s));
                break;
            case 'heatmap':
                (layer.points ?? []).forEach((p, i) => {
                    const pctx = `${ctx} points[${i}]`;
                    if (!isFiniteNumber(p.lat) || !isFiniteNumber(p.lon)) {
                        throw new InvalidParameterError('points', p, `${pctx}: lat and lon must be finite numbers`);
                    }
                    assertFiniteIfSet(p.intensity, 'intensity', pctx);
                });
                assertFiniteIfSet(layer.radius, 'radius', ctx);
                assertFiniteIfSet(layer.intensityMax, 'intensityMax', ctx);
                break;
            case 'tiles':
                assertFiniteIfSet(layer.maxNativeZoom, 'maxNativeZoom', ctx);
                assertFiniteIfSet(layer.opacity, 'opacity', ctx);
                break;
            case 'geojson':
                assertNoNonFiniteNumber(layer.data, `${ctx}.data`);
                if (layer.defaultShapeStyle) assertStyleFinite(layer.defaultShapeStyle, ctx);
                break;
        }
    }

    private validateShape(s: MapShape): void {
        switch (s.type) {
            case 'Polygon': {
                if (!Array.isArray(s.points) || s.points.length < 3) {
                    throw new InvalidParameterError('points', s.points, 'Polygon requires at least 3 points');
                }
                s.points.forEach((p, i) => this.validateGeoPoint(p, `Polygon "${s.id}" points[${i}]`));
                break;
            }
            case 'Polyline': {
                if (!Array.isArray(s.points) || s.points.length < 2) {
                    throw new InvalidParameterError('points', s.points, 'Polyline requires at least 2 points');
                }
                s.points.forEach((p, i) => this.validateGeoPoint(p, `Polyline "${s.id}" points[${i}]`));
                break;
            }
            case 'Circle': {
                this.validateGeoPoint(s.center, `Circle "${s.id}" center`);
                if (!isFiniteNumber(s.radius) || s.radius <= 0) {
                    throw new InvalidParameterError('radius', s.radius, 'Circle radius must be a finite number > 0 (meters)');
                }
                break;
            }
            case 'Rectangle': {
                this.validateGeoPoint(s.sw, `Rectangle "${s.id}" sw`);
                this.validateGeoPoint(s.ne, `Rectangle "${s.id}" ne`);
                if (s.sw.lat > s.ne.lat || s.sw.lon > s.ne.lon) {
                    throw new InvalidParameterError(
                        'sw,ne',
                        { sw: s.sw, ne: s.ne },
                        'Rectangle sw must be south-west of ne (sw.lat <= ne.lat and sw.lon <= ne.lon)'
                    );
                }
                break;
            }
            default: {
                // exhaustiveness guard — TypeScript will flag if a new shape type is added
                const _exhaustive: never = s;
                throw new InvalidParameterError('shape.type', (_exhaustive as MapShape).type, 'unknown shape type');
            }
        }
        if (s.config) assertStyleFinite(s.config, `shape "${s.id}".config`);
    }

    private validateViewport(v: MapViewport): void {
        // `NaN` passes every range check below, so finiteness comes first.
        for (const key of ['zoom', 'minZoom', 'maxZoom', 'bearing', 'pitch'] as const) {
            if (v[key] !== undefined && !isFiniteNumber(v[key])) {
                throw new InvalidViewportError(`${key} must be a finite number`);
            }
        }
        if (v.center) this.validateGeoPoint(v.center, 'viewport.center');
        if (v.bounds) {
            this.validateGeoPoint(v.bounds.sw, 'viewport.bounds.sw');
            this.validateGeoPoint(v.bounds.ne, 'viewport.bounds.ne');
            if (v.bounds.sw.lat > v.bounds.ne.lat || v.bounds.sw.lon > v.bounds.ne.lon) {
                throw new InvalidViewportError('viewport.bounds.sw must be south-west of bounds.ne');
            }
        }
        if (v.zoom !== undefined && (v.zoom < 0 || v.zoom > 22)) {
            throw new InvalidViewportError('zoom must be in [0, 22]');
        }
        if (v.minZoom !== undefined && (v.minZoom < 0 || v.minZoom > 22)) {
            throw new InvalidViewportError('minZoom must be in [0, 22]');
        }
        if (v.maxZoom !== undefined && (v.maxZoom < 0 || v.maxZoom > 22)) {
            throw new InvalidViewportError('maxZoom must be in [0, 22]');
        }
        if (v.minZoom !== undefined && v.maxZoom !== undefined && v.minZoom > v.maxZoom) {
            throw new InvalidViewportError('minZoom must be <= maxZoom');
        }
        if (v.bearing !== undefined && (v.bearing < 0 || v.bearing >= 360)) {
            throw new InvalidViewportError('bearing must be in [0, 360)');
        }
        if (v.pitch !== undefined && (v.pitch < 0 || v.pitch > 60)) {
            throw new InvalidViewportError('pitch must be in [0, 60]');
        }
    }
}
