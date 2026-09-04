"""
MapView (v2) — see specs/map-view.md.

Wire format: a single data path, ``content["layers"]``. Even one-marker views
are described as ``[{"type": "markers", "markers": [...]}]``.

SDK ergonomics: ``add_marker`` / ``add_polygon`` / ``add_circle`` / ... target
either an implicit default layer (``_default_markers`` / ``_default_shapes``,
auto-created on first call) or a named layer (passed via the optional final
``layer_id`` argument). Named layers must be declared via ``add_layer``.
"""

import math
from typing import Any, Dict, List, Optional
from datetime import datetime

from ..core.base_view import BaseView
from ..types.models import (
    ActionRef,
    GeoPoint,
    GeoBounds,
    MapBasemap,
    MapControls,
    MapLayer,
    MapMarker,
    MapPickConfig,
    MapShape,
    MapShapeStyle,
    MapViewport,
)
from ..errors.exceptions import (
    DuplicateLayerIdError,
    InvalidGeoPointError,
    InvalidParameterError,
    InvalidViewportError,
    LayerNotFoundError,
    LayerTypeMismatchError,
    MissingRequiredParameterError,
)


# Wire-format keys are camelCase to match the JS SDK output exactly.
DEFAULT_MARKERS_LAYER_ID = "_default_markers"
DEFAULT_SHAPES_LAYER_ID = "_default_shapes"


def _geo_to_dict(p: Optional[GeoPoint]) -> Optional[Dict[str, Any]]:
    if p is None:
        return None
    out: Dict[str, Any] = {"lat": p.lat, "lon": p.lon}
    if p.altitude is not None:
        out["altitude"] = p.altitude
    if p.precision is not None:
        out["precision"] = p.precision
    return out


def _bounds_to_dict(b: Optional[GeoBounds]) -> Optional[Dict[str, Any]]:
    if b is None:
        return None
    return {"sw": _geo_to_dict(b.sw), "ne": _geo_to_dict(b.ne)}


def _strip_none(d: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}


def _action_to_dict(a: ActionRef) -> Dict[str, Any]:
    return _strip_none({
        "url": a.url,
        "method": a.method,
        "body": a.body,
        "confirm": _strip_none({
            "title": a.confirm.title,
            "message": a.confirm.message,
            "submitLabel": a.confirm.submit_label,
        }) if a.confirm else None,
    })


def _marker_to_dict(m: MapMarker) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "id": m.id.strip(),
        "location": _geo_to_dict(m.location),
    }
    for src in ("title", "description", "icon", "color", "size", "selected", "meta"):
        v = getattr(m, src, None)
        if v is not None:
            out[src] = v.strip() if isinstance(v, str) and src in ("title", "description") else v
    if m.action is not None:
        out["action"] = _action_to_dict(m.action)
    if m.popup is not None:
        out["popup"] = _strip_none({
            "title": m.popup.title,
            "body": m.popup.body,
            "image": m.popup.image,
            # Same emitter as the marker's own action: a popup action used
            # to lose its `confirm` here, which JS carried through.
            "actions": [_action_to_dict(a) for a in m.popup.actions]
            if m.popup.actions else None,
        })
    return out


def _shape_to_dict(s: MapShape) -> Dict[str, Any]:
    out: Dict[str, Any] = {"id": s.id.strip(), "type": s.type}
    if s.points is not None:
        out["points"] = [_geo_to_dict(p) for p in s.points]
    if s.center is not None:
        out["center"] = _geo_to_dict(s.center)
    if s.radius is not None:
        out["radius"] = s.radius
    if s.sw is not None:
        out["sw"] = _geo_to_dict(s.sw)
    if s.ne is not None:
        out["ne"] = _geo_to_dict(s.ne)
    if s.config is not None:
        out["config"] = _strip_none({
            "fillColor": s.config.fill_color,
            "fillOpacity": s.config.fill_opacity,
            "strokeColor": s.config.stroke_color,
            "strokeOpacity": s.config.stroke_opacity,
            "strokeWidth": s.config.stroke_width,
            "dashed": s.config.dashed,
        })
    # `MapShape.action` existed on the dataclass and in the spec, and was
    # never emitted: a Python provider's tappable zone was silent on the map.
    if s.action is not None:
        out["action"] = _action_to_dict(s.action)
    if s.meta is not None:
        out["meta"] = s.meta
    return out


def _layer_to_dict(l: MapLayer) -> Dict[str, Any]:
    base: Dict[str, Any] = _strip_none({
        "id": l.id,
        "type": l.type,
        "name": l.name,
        "legendIcon": l.legend_icon,
        "visible": l.visible,
        "toggleable": l.toggleable,
        "zIndex": l.z_index,
        "minZoom": l.min_zoom,
        "maxZoom": l.max_zoom,
    })
    if l.type == "markers":
        base["markers"] = [_marker_to_dict(m) for m in (l.markers or [])]
        if l.cluster is not None:
            base["cluster"] = l.cluster
        if l.cluster_radius is not None:
            base["clusterRadius"] = l.cluster_radius
    elif l.type == "shapes":
        base["shapes"] = [_shape_to_dict(s) for s in (l.shapes or [])]
    elif l.type == "heatmap":
        base["points"] = [
            _strip_none({"lat": p.lat, "lon": p.lon, "intensity": p.intensity})
            for p in (l.points or [])
        ]
        if l.radius is not None:
            base["radius"] = l.radius
        if l.intensity_max is not None:
            base["intensityMax"] = l.intensity_max
        if l.color_ramp is not None:
            base["colorRamp"] = l.color_ramp
    elif l.type == "tiles":
        base["url"] = l.url
        base["attribution"] = l.attribution
        if l.max_native_zoom is not None:
            base["maxNativeZoom"] = l.max_native_zoom
        if l.opacity is not None:
            base["opacity"] = l.opacity
    elif l.type == "geojson":
        base["data"] = l.data
        if l.default_marker_icon is not None:
            base["defaultMarkerIcon"] = l.default_marker_icon
        if l.default_shape_style is not None:
            base["defaultShapeStyle"] = _strip_none({
                "fillColor": l.default_shape_style.fill_color,
                "fillOpacity": l.default_shape_style.fill_opacity,
                "strokeColor": l.default_shape_style.stroke_color,
                "strokeOpacity": l.default_shape_style.stroke_opacity,
                "strokeWidth": l.default_shape_style.stroke_width,
                "dashed": l.default_shape_style.dashed,
            })
    return base


def _viewport_to_dict(v: MapViewport) -> Dict[str, Any]:
    return _strip_none({
        "center": _geo_to_dict(v.center),
        "zoom": v.zoom,
        "bounds": _bounds_to_dict(v.bounds),
        "fitMarkers": v.fit_markers,
        "minZoom": v.min_zoom,
        "maxZoom": v.max_zoom,
        "bearing": v.bearing,
        "pitch": v.pitch,
    })


def _controls_to_dict(c: MapControls) -> Dict[str, Any]:
    return _strip_none({
        "zoom": c.zoom,
        "compass": c.compass,
        "userLocation": c.user_location,
        "layerToggle": c.layer_toggle,
        "scale": c.scale,
        "fullscreen": c.fullscreen,
        "attribution": c.attribution,
    })


def _pick_to_dict(p: MapPickConfig) -> Dict[str, Any]:
    return _strip_none({
        "submitUrl": p.submit_url,
        "prompt": p.prompt,
        "initialLocation": _geo_to_dict(p.initial_location),
        "submitMethod": p.submit_method,
        "submitLabel": p.submit_label,
        "payloadKey": p.payload_key,
        "bounds": _bounds_to_dict(p.bounds),
        "snapToMarkers": p.snap_to_markers,
    })


# ─── validation helpers ────────────────────────────────────────────────

# Un nombre qui peut voyager : `nan` et `±inf` n'ont pas de forme JSON —
# `json.dumps` ecrit `NaN`, le JS ecrit `null`, et une charge utile signee qui
# porte l'un ou l'autre est illisible par tout client. `bool` est exclu, etant
# une sous-classe de `int`. Meme regle que les champs numeriques du
# formulaire (`validate_number`), appliquee a chaque nombre d'une carte.
def _is_finite_number(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    return isinstance(value, (int, float)) and math.isfinite(value)


def _assert_finite_if_set(value: Any, name: str, ctx: str) -> None:
    if value is not None and not _is_finite_number(value):
        raise InvalidParameterError(name, value, f"{ctx}: {name} must be a finite number")


def _assert_no_non_finite_number(value: Any, ctx: str) -> None:
    """Le GeoJSON `data` est opaque pour le SDK et copie tel quel dans la
    charge utile : on le parcourt en entier. Un nombre non fini n'importe ou
    dedans — coordonnees, bbox, propriete — n'a pas de forme JSON : refus.
    Les booleens restent admis, ce sont des proprietes GeoJSON legitimes."""
    if isinstance(value, bool):
        return
    if isinstance(value, float) and not math.isfinite(value):
        raise InvalidParameterError("data", value, f"{ctx}: contains a non-finite number")
    if isinstance(value, dict):
        for v in value.values():
            _assert_no_non_finite_number(v, ctx)
    elif isinstance(value, (list, tuple)):
        for v in value:
            _assert_no_non_finite_number(v, ctx)


def _assert_style_finite(style: MapShapeStyle, ctx: str) -> None:
    _assert_finite_if_set(style.fill_opacity, "fillOpacity", ctx)
    _assert_finite_if_set(style.stroke_opacity, "strokeOpacity", ctx)
    _assert_finite_if_set(style.stroke_width, "strokeWidth", ctx)


def _validate_geo_point(p: Optional[GeoPoint], ctx: str) -> None:
    if p is None or not isinstance(p, GeoPoint):
        raise InvalidGeoPointError(p, f"{ctx}: location is required")
    # `nan` passe toutes les comparaisons ci-dessous : la finitude d'abord.
    if not _is_finite_number(p.lat) or p.lat < -90 or p.lat > 90:
        raise InvalidGeoPointError(p, f"{ctx}: lat must be a finite number in [-90, 90]")
    if not _is_finite_number(p.lon) or p.lon < -180 or p.lon > 180:
        raise InvalidGeoPointError(p, f"{ctx}: lon must be a finite number in [-180, 180]")
    if p.altitude is not None and not _is_finite_number(p.altitude):
        raise InvalidGeoPointError(p, f"{ctx}: altitude must be a finite number")
    if p.precision is not None and not _is_finite_number(p.precision):
        raise InvalidGeoPointError(p, f"{ctx}: precision must be a finite number")


def _validate_layer(layer: MapLayer) -> None:
    """Une couche passee a add_layer porte ses propres marqueurs, formes ou
    points ; ils subissent les memes controles que ceux ajoutes un a un."""
    ctx = f'layer "{layer.id}"'
    _assert_finite_if_set(layer.z_index, "zIndex", ctx)
    _assert_finite_if_set(layer.min_zoom, "minZoom", ctx)
    _assert_finite_if_set(layer.max_zoom, "maxZoom", ctx)
    if layer.type == "markers":
        for m in layer.markers or []:
            _validate_geo_point(m.location, f'marker "{m.id}".location')
        _assert_finite_if_set(layer.cluster_radius, "clusterRadius", ctx)
    elif layer.type == "shapes":
        for s in layer.shapes or []:
            _validate_shape(s)
    elif layer.type == "heatmap":
        for i, p in enumerate(layer.points or []):
            pctx = f"{ctx} points[{i}]"
            if not _is_finite_number(p.lat) or not _is_finite_number(p.lon):
                raise InvalidParameterError("points", p, f"{pctx}: lat and lon must be finite numbers")
            _assert_finite_if_set(p.intensity, "intensity", pctx)
        _assert_finite_if_set(layer.radius, "radius", ctx)
        _assert_finite_if_set(layer.intensity_max, "intensityMax", ctx)
    elif layer.type == "tiles":
        _assert_finite_if_set(layer.max_native_zoom, "maxNativeZoom", ctx)
        _assert_finite_if_set(layer.opacity, "opacity", ctx)
    elif layer.type == "geojson":
        _assert_no_non_finite_number(layer.data, f"{ctx}.data")
        if layer.default_shape_style is not None:
            _assert_style_finite(layer.default_shape_style, ctx)


def _validate_shape(s: MapShape) -> None:
    if s.type == "Polygon":
        if not isinstance(s.points, list) or len(s.points) < 3:
            raise InvalidParameterError("points", s.points, "Polygon requires at least 3 points")
        for i, p in enumerate(s.points):
            _validate_geo_point(p, f'Polygon "{s.id}" points[{i}]')
    elif s.type == "Polyline":
        if not isinstance(s.points, list) or len(s.points) < 2:
            raise InvalidParameterError("points", s.points, "Polyline requires at least 2 points")
        for i, p in enumerate(s.points):
            _validate_geo_point(p, f'Polyline "{s.id}" points[{i}]')
    elif s.type == "Circle":
        _validate_geo_point(s.center, f'Circle "{s.id}" center')
        if not _is_finite_number(s.radius) or s.radius <= 0:
            raise InvalidParameterError("radius", s.radius, "Circle radius must be a finite number > 0 (meters)")
    elif s.type == "Rectangle":
        _validate_geo_point(s.sw, f'Rectangle "{s.id}" sw')
        _validate_geo_point(s.ne, f'Rectangle "{s.id}" ne')
        if s.sw.lat > s.ne.lat or s.sw.lon > s.ne.lon:
            raise InvalidParameterError(
                "sw,ne",
                {"sw": s.sw, "ne": s.ne},
                "Rectangle sw must be south-west of ne (sw.lat <= ne.lat and sw.lon <= ne.lon)",
            )
    else:
        raise InvalidParameterError("shape.type", s.type, "unknown shape type")
    if s.config is not None:
        _assert_style_finite(s.config, f'shape "{s.id}".config')


def _validate_viewport(v: MapViewport) -> None:
    # `nan` passe tous les controles de plage ci-dessous : la finitude d'abord.
    for name, value in (("zoom", v.zoom), ("minZoom", v.min_zoom), ("maxZoom", v.max_zoom),
                        ("bearing", v.bearing), ("pitch", v.pitch)):
        if value is not None and not _is_finite_number(value):
            raise InvalidViewportError(f"{name} must be a finite number")
    if v.center is not None:
        _validate_geo_point(v.center, "viewport.center")
    if v.bounds is not None:
        _validate_geo_point(v.bounds.sw, "viewport.bounds.sw")
        _validate_geo_point(v.bounds.ne, "viewport.bounds.ne")
        if v.bounds.sw.lat > v.bounds.ne.lat or v.bounds.sw.lon > v.bounds.ne.lon:
            raise InvalidViewportError("viewport.bounds.sw must be south-west of bounds.ne")
    if v.zoom is not None and (v.zoom < 0 or v.zoom > 22):
        raise InvalidViewportError("zoom must be in [0, 22]")
    if v.min_zoom is not None and (v.min_zoom < 0 or v.min_zoom > 22):
        raise InvalidViewportError("minZoom must be in [0, 22]")
    if v.max_zoom is not None and (v.max_zoom < 0 or v.max_zoom > 22):
        raise InvalidViewportError("maxZoom must be in [0, 22]")
    if v.min_zoom is not None and v.max_zoom is not None and v.min_zoom > v.max_zoom:
        raise InvalidViewportError("minZoom must be <= maxZoom")
    if v.bearing is not None and (v.bearing < 0 or v.bearing >= 360):
        raise InvalidViewportError("bearing must be in [0, 360)")
    if v.pitch is not None and (v.pitch < 0 or v.pitch > 60):
        raise InvalidViewportError("pitch must be in [0, 60]")


# ─── MapView class ─────────────────────────────────────────────────────

class MapView(BaseView):
    """Builds a Map SGUI view (v2) — geographic data rendered as layers of
    markers and shapes.

    ``add_marker`` / ``add_shape`` (and the ``add_polygon`` / ``add_circle`` /
    ``add_polyline`` / ``add_rectangle`` wrappers) populate the default or a
    named layer declared via ``add_layer``; ``set_viewport`` / ``set_basemap`` /
    ``set_controls`` configure the map and ``set_pick_mode`` turns it into a
    location picker.

    Extends ``BaseView``; instantiated by the YeriaApp/YeriaUI factory,
    populated with these builders, then serialized to a JSON view description
    and signed into a v3 envelope by ``serve()``.
    """
    @classmethod
    def from_json(cls, json_view):
        """Rehydrate a Map view from a wire JSON payload."""
        return cls.from_json_as('Map', json_view)


    DEFAULT_MARKERS_LAYER_ID = DEFAULT_MARKERS_LAYER_ID
    DEFAULT_SHAPES_LAYER_ID = DEFAULT_SHAPES_LAYER_ID

    def __init__(self, view_id: str, title: str, process_id: Optional[str] = None):
        super().__init__(
            {
                "id": view_id,
                "type": "Map",
                "process_id": process_id,
                "metadata": {
                    "version": "2.0.0",
                    "created_at": datetime.now(),
                },
            }
        )
        self.content: Dict[str, Any] = {
            "title": title,
            "layers": [],
            "controls": {"zoom": True, "compass": True, "userLocation": False},
        }

    # ─── view-level setters ───────────────────────────────────────────

    def set_intro(self, intro: str) -> "MapView":
        return self._set_intro_text("intro", intro)

    def set_basemap(self, name: MapBasemap) -> "MapView":
        self.content["basemap"] = name
        return self

    def set_viewport(self, viewport: MapViewport) -> "MapView":
        _validate_viewport(viewport)
        self.content["viewport"] = _viewport_to_dict(viewport)
        return self

    def set_controls(self, controls: MapControls) -> "MapView":
        self.content["controls"] = _controls_to_dict(controls)
        return self

    def set_empty_message(self, text: str) -> "MapView":
        self.content["emptyMessage"] = text
        return self

    def set_pick_mode(self, config: MapPickConfig) -> "MapView":
        """Turn the map into a location picker that submits the chosen point to config.submit_url"""
        if not isinstance(config.submit_url, str) or not config.submit_url.strip():
            raise MissingRequiredParameterError("pick.submitUrl")
        submit_url = self._assert_navigation_target(
            "pick.submitUrl",
            config.submit_url,
            allow_relative=True,
            allow_view_id=False,
        )
        if config.initial_location is not None:
            _validate_geo_point(config.initial_location, "pick.initialLocation")
        if config.bounds is not None:
            _validate_geo_point(config.bounds.sw, "pick.bounds.sw")
            _validate_geo_point(config.bounds.ne, "pick.bounds.ne")
        self.content["mode"] = "pick"
        self.content["pick"] = _pick_to_dict(
            MapPickConfig(
                submit_url=submit_url,
                prompt=config.prompt,
                initial_location=config.initial_location,
                submit_method=config.submit_method,
                submit_label=config.submit_label,
                payload_key=config.payload_key,
                bounds=config.bounds,
                snap_to_markers=config.snap_to_markers,
            )
        )
        return self

    # ─── layer management ─────────────────────────────────────────────

    def add_layer(self, layer: MapLayer) -> "MapView":
        """Declare a named layer (markers/shapes/heatmap/tiles/geojson); ids must be unique"""
        if layer is None or not isinstance(layer, MapLayer):
            raise MissingRequiredParameterError("layer")
        if not isinstance(layer.id, str) or not layer.id.strip():
            raise MissingRequiredParameterError("layer.id")
        layers: List[Dict[str, Any]] = self.content["layers"]
        if any(l.get("id") == layer.id for l in layers):
            raise DuplicateLayerIdError(layer.id)
        _validate_layer(layer)
        layers.append(_layer_to_dict(layer))
        return self

    def set_layers(self, layers: List[MapLayer]) -> "MapView":
        if not isinstance(layers, list):
            raise InvalidParameterError("layers", layers, "must be a list")
        self.content["layers"] = []
        for l in layers:
            self.add_layer(l)
        return self

    def clear_layers(self) -> "MapView":
        self.content["layers"] = []
        return self

    def get_layer(self, layer_id: str) -> Optional[Dict[str, Any]]:
        for l in self.content["layers"]:
            if l.get("id") == layer_id:
                return l
        return None

    # ─── markers (default layer or named target) ──────────────────────

    def add_marker(self, marker: MapMarker, layer_id: Optional[str] = None) -> "MapView":
        """Add one marker to the default markers layer, or to the named layer_id if given"""
        if marker is None or not isinstance(marker, MapMarker):
            raise MissingRequiredParameterError("marker")
        if not isinstance(marker.id, str) or not marker.id.strip():
            raise MissingRequiredParameterError("marker.id")
        _validate_geo_point(marker.location, f'marker "{marker.id}".location')

        layer = self._resolve_or_create_markers_layer(layer_id)
        layer["markers"].append(_marker_to_dict(marker))
        return self

    def add_markers(self, markers: List[MapMarker], layer_id: Optional[str] = None) -> "MapView":
        if not isinstance(markers, list):
            raise InvalidParameterError("markers", markers, "must be a list")
        for m in markers:
            self.add_marker(m, layer_id)
        return self

    def clear_markers(self, layer_id: Optional[str] = None) -> "MapView":
        target = layer_id or DEFAULT_MARKERS_LAYER_ID
        layer = self.get_layer(target)
        if layer is None:
            return self
        if layer.get("type") != "markers":
            raise LayerTypeMismatchError(target, "markers", layer.get("type", "unknown"))
        layer["markers"] = []
        return self

    # ─── shapes (default layer or named target) ───────────────────────

    def add_shape(self, shape: MapShape, layer_id: Optional[str] = None) -> "MapView":
        """Add one shape to the default shapes layer, or to the named layer_id if given"""
        if shape is None or not isinstance(shape, MapShape):
            raise MissingRequiredParameterError("shape")
        if not isinstance(shape.id, str) or not shape.id.strip():
            raise MissingRequiredParameterError("shape.id")
        _validate_shape(shape)

        layer = self._resolve_or_create_shapes_layer(layer_id)
        layer["shapes"].append(_shape_to_dict(shape))
        return self

    def add_polygon(
        self,
        shape_id: str,
        points: List[GeoPoint],
        config: Optional[MapShapeStyle] = None,
        layer_id: Optional[str] = None,
    ) -> "MapView":
        """Convenience wrapper over add_shape for a Polygon (>= 3 points)"""
        return self.add_shape(MapShape(id=shape_id, type="Polygon", points=points, config=config), layer_id)

    def add_circle(
        self,
        shape_id: str,
        center: GeoPoint,
        radius: float,
        config: Optional[MapShapeStyle] = None,
        layer_id: Optional[str] = None,
    ) -> "MapView":
        """Convenience wrapper over add_shape for a Circle (center + radius in meters)"""
        return self.add_shape(MapShape(id=shape_id, type="Circle", center=center, radius=radius, config=config), layer_id)

    def add_polyline(
        self,
        shape_id: str,
        points: List[GeoPoint],
        config: Optional[MapShapeStyle] = None,
        layer_id: Optional[str] = None,
    ) -> "MapView":
        """Convenience wrapper over add_shape for a Polyline (>= 2 points)"""
        return self.add_shape(MapShape(id=shape_id, type="Polyline", points=points, config=config), layer_id)

    def add_rectangle(
        self,
        shape_id: str,
        sw: GeoPoint,
        ne: GeoPoint,
        config: Optional[MapShapeStyle] = None,
        layer_id: Optional[str] = None,
    ) -> "MapView":
        """Convenience wrapper over add_shape for a Rectangle (south-west + north-east corners)"""
        return self.add_shape(MapShape(id=shape_id, type="Rectangle", sw=sw, ne=ne, config=config), layer_id)

    def clear_shapes(self, layer_id: Optional[str] = None) -> "MapView":
        target = layer_id or DEFAULT_SHAPES_LAYER_ID
        layer = self.get_layer(target)
        if layer is None:
            return self
        if layer.get("type") != "shapes":
            raise LayerTypeMismatchError(target, "shapes", layer.get("type", "unknown"))
        layer["shapes"] = []
        return self

    def get_content(self) -> Dict[str, Any]:
        """Get the map content"""
        return self.content

    # ─── private helpers ──────────────────────────────────────────────

    def _resolve_or_create_markers_layer(self, layer_id: Optional[str]) -> Dict[str, Any]:
        layers: List[Dict[str, Any]] = self.content["layers"]
        if layer_id:
            for l in layers:
                if l.get("id") == layer_id:
                    if l.get("type") != "markers":
                        raise LayerTypeMismatchError(layer_id, "markers", l.get("type", "unknown"))
                    return l
            raise LayerNotFoundError(layer_id)
        for l in layers:
            if l.get("id") == DEFAULT_MARKERS_LAYER_ID:
                if l.get("type") != "markers":
                    raise LayerTypeMismatchError(DEFAULT_MARKERS_LAYER_ID, "markers", l.get("type", "unknown"))
                return l
        created = {
            "id": DEFAULT_MARKERS_LAYER_ID,
            "type": "markers",
            "markers": [],
            "toggleable": False,
        }
        layers.append(created)
        return created

    def _resolve_or_create_shapes_layer(self, layer_id: Optional[str]) -> Dict[str, Any]:
        layers: List[Dict[str, Any]] = self.content["layers"]
        if layer_id:
            for l in layers:
                if l.get("id") == layer_id:
                    if l.get("type") != "shapes":
                        raise LayerTypeMismatchError(layer_id, "shapes", l.get("type", "unknown"))
                    return l
            raise LayerNotFoundError(layer_id)
        for l in layers:
            if l.get("id") == DEFAULT_SHAPES_LAYER_ID:
                if l.get("type") != "shapes":
                    raise LayerTypeMismatchError(DEFAULT_SHAPES_LAYER_ID, "shapes", l.get("type", "unknown"))
                return l
        created = {
            "id": DEFAULT_SHAPES_LAYER_ID,
            "type": "shapes",
            "shapes": [],
            "toggleable": False,
        }
        layers.append(created)
        return created
