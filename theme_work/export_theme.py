#!/usr/bin/env python3
"""Rasterize replacement SVGs with the system Cairo library (no Python packages)."""

from __future__ import annotations

import argparse
import ctypes
import json
import re
import struct
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "theme_manifest.json"
CAIRO = ctypes.CDLL("libcairo.so.2")
P = ctypes.c_void_p
D = ctypes.c_double

for name, args, result in [
    ("cairo_image_surface_create", [ctypes.c_int, ctypes.c_int, ctypes.c_int], P),
    ("cairo_create", [P], P), ("cairo_destroy", [P], None),
    ("cairo_surface_destroy", [P], None),
    ("cairo_surface_write_to_png", [P, ctypes.c_char_p], ctypes.c_int),
    ("cairo_scale", [P, D, D], None), ("cairo_new_path", [P], None),
    ("cairo_move_to", [P, D, D], None), ("cairo_line_to", [P, D, D], None),
    ("cairo_curve_to", [P, D, D, D, D, D, D], None),
    ("cairo_close_path", [P], None), ("cairo_rectangle", [P, D, D, D, D], None),
    ("cairo_arc", [P, D, D, D, D, D], None),
    ("cairo_set_source_rgba", [P, D, D, D, D], None),
    ("cairo_set_source", [P, P], None), ("cairo_fill_preserve", [P], None),
    ("cairo_stroke", [P], None), ("cairo_set_line_width", [P, D], None),
    ("cairo_pattern_create_linear", [D, D, D, D], P),
    ("cairo_pattern_create_radial", [D, D, D, D, D, D], P),
    ("cairo_pattern_add_color_stop_rgba", [P, D, D, D, D, D], None),
    ("cairo_pattern_destroy", [P], None),
]:
    fn = getattr(CAIRO, name)
    fn.argtypes = args
    fn.restype = result

TOKENS = re.compile(r"[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")


def color(value: str, opacity: float = 1.0) -> tuple[float, float, float, float] | None:
    if value in ("none", "transparent"):
        return None
    named = {"white": "#fff", "black": "#000"}
    value = named.get(value, value)
    if value.startswith("#"):
        raw = value[1:]
        if len(raw) == 3:
            raw = "".join(c * 2 for c in raw)
        return (*(int(raw[n:n + 2], 16) / 255 for n in (0, 2, 4)), opacity)
    raise ValueError(f"Unsupported color: {value}")


def number(value: str | None, default: float = 0.0) -> float:
    if value is None:
        return default
    return float(value.rstrip("%")) / (100 if value.endswith("%") else 1)


def rounded_rect(ctx: P, x: float, y: float, w: float, h: float, r: float) -> None:
    r = min(r, w / 2, h / 2)
    if not r:
        CAIRO.cairo_rectangle(ctx, x, y, w, h)
        return
    k = .5522847498
    CAIRO.cairo_move_to(ctx, x + r, y)
    CAIRO.cairo_line_to(ctx, x + w - r, y)
    CAIRO.cairo_curve_to(ctx, x + w - r + k*r, y, x + w, y + r - k*r, x + w, y + r)
    CAIRO.cairo_line_to(ctx, x + w, y + h - r)
    CAIRO.cairo_curve_to(ctx, x + w, y + h-r+k*r, x+w-r+k*r, y+h, x+w-r, y+h)
    CAIRO.cairo_line_to(ctx, x+r, y+h)
    CAIRO.cairo_curve_to(ctx, x+r-k*r, y+h, x, y+h-r+k*r, x, y+h-r)
    CAIRO.cairo_line_to(ctx, x, y+r)
    CAIRO.cairo_curve_to(ctx, x, y+r-k*r, x+r-k*r, y, x+r, y)
    CAIRO.cairo_close_path(ctx)


def path(ctx: P, data: str) -> None:
    tokens = TOKENS.findall(data)
    i = 0; cmd = ""; x = y = sx = sy = 0.0
    counts = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6}
    while i < len(tokens):
        if tokens[i].isalpha():
            cmd = tokens[i]; i += 1
            if cmd.upper() == "Z":
                CAIRO.cairo_close_path(ctx); x, y = sx, sy; continue
        upper = cmd.upper(); relative = cmd.islower()
        if upper not in counts or i + counts[upper] > len(tokens):
            raise ValueError(f"Unsupported/malformed path command {cmd!r}: {data}")
        vals = [float(v) for v in tokens[i:i + counts[upper]]]; i += counts[upper]
        if upper == "M":
            nx, ny = vals
            if relative: nx += x; ny += y
            CAIRO.cairo_move_to(ctx, nx, ny); x, y = nx, ny; sx, sy = x, y
            cmd = "l" if relative else "L"
        elif upper == "L":
            nx, ny = vals
            if relative: nx += x; ny += y
            CAIRO.cairo_line_to(ctx, nx, ny); x, y = nx, ny
        elif upper == "H":
            nx = vals[0] + (x if relative else 0)
            CAIRO.cairo_line_to(ctx, nx, y); x = nx
        elif upper == "V":
            ny = vals[0] + (y if relative else 0)
            CAIRO.cairo_line_to(ctx, x, ny); y = ny
        elif upper == "C":
            x1, y1, x2, y2, nx, ny = vals
            if relative:
                x1 += x; y1 += y; x2 += x; y2 += y; nx += x; ny += y
            CAIRO.cairo_curve_to(ctx, x1, y1, x2, y2, nx, ny); x, y = nx, ny


def styles(element: ET.Element, inherited: dict[str, str]) -> dict[str, str]:
    result = dict(inherited)
    for key in ("fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity"):
        if key in element.attrib:
            result[key] = element.attrib[key]
    return result


def paint(ctx: P, style: dict[str, str], gradients: dict[str, tuple], bounds: tuple[float, float]) -> None:
    opacity = number(style.get("opacity"), 1)
    fill = style.get("fill", "black")
    pattern = None
    if fill.startswith("url(#"):
        gradient = gradients[fill[5:-1]]
        kind, attrs, stops = gradient
        w, h = bounds
        if kind == "linearGradient":
            pattern = CAIRO.cairo_pattern_create_linear(number(attrs.get("x1"))*w, number(attrs.get("y1"))*h,
                number(attrs.get("x2"), 1)*w, number(attrs.get("y2"))*h)
        else:
            pattern = CAIRO.cairo_pattern_create_radial(number(attrs.get("cx"), .5)*w, number(attrs.get("cy"), .5)*h, 0,
                number(attrs.get("cx"), .5)*w, number(attrs.get("cy"), .5)*h, number(attrs.get("r"), .5)*max(w,h))
        for offset, value, stop_opacity in stops:
            r, g, b, a = color(value, opacity * stop_opacity)  # type: ignore[misc]
            CAIRO.cairo_pattern_add_color_stop_rgba(pattern, offset, r, g, b, a)
        CAIRO.cairo_set_source(ctx, pattern)
    else:
        rgba = color(fill, opacity * number(style.get("fill-opacity"), 1))
        if rgba:
            CAIRO.cairo_set_source_rgba(ctx, *rgba)
    if fill != "none":
        CAIRO.cairo_fill_preserve(ctx)
    stroke = color(style.get("stroke", "none"), opacity * number(style.get("stroke-opacity"), 1))
    if stroke:
        CAIRO.cairo_set_source_rgba(ctx, *stroke)
        CAIRO.cairo_set_line_width(ctx, number(style.get("stroke-width"), 1))
        CAIRO.cairo_stroke(ctx)
    else:
        CAIRO.cairo_new_path(ctx)
    if pattern:
        CAIRO.cairo_pattern_destroy(pattern)


def render_node(ctx: P, node: ET.Element, inherited: dict[str, str], gradients: dict, bounds: tuple[float, float]) -> None:
    tag = node.tag.rsplit("}", 1)[-1]
    if tag in ("defs", "linearGradient", "radialGradient", "stop"):
        return
    style = styles(node, inherited)
    if tag in ("svg", "g"):
        for child in node:
            render_node(ctx, child, style, gradients, bounds)
        return
    CAIRO.cairo_new_path(ctx)
    a = node.attrib
    if tag == "rect":
        w = bounds[0] if a.get("width") == "100%" else number(a.get("width"))
        h = bounds[1] if a.get("height") == "100%" else number(a.get("height"))
        rounded_rect(ctx, number(a.get("x")), number(a.get("y")), w, h, number(a.get("rx")))
    elif tag == "circle":
        CAIRO.cairo_arc(ctx, number(a.get("cx")), number(a.get("cy")), number(a.get("r")), 0, 6.283185307)
    elif tag == "ellipse":
        # Cubic approximation avoids context save/transform bindings.
        cx, cy, rx, ry = map(number, (a.get("cx"), a.get("cy"), a.get("rx"), a.get("ry")))
        k = .5522847498
        CAIRO.cairo_move_to(ctx, cx+rx, cy)
        CAIRO.cairo_curve_to(ctx, cx+rx, cy+k*ry, cx+k*rx, cy+ry, cx, cy+ry)
        CAIRO.cairo_curve_to(ctx, cx-k*rx, cy+ry, cx-rx, cy+k*ry, cx-rx, cy)
        CAIRO.cairo_curve_to(ctx, cx-rx, cy-k*ry, cx-k*rx, cy-ry, cx, cy-ry)
        CAIRO.cairo_curve_to(ctx, cx+k*rx, cy-ry, cx+rx, cy-k*ry, cx+rx, cy); CAIRO.cairo_close_path(ctx)
    elif tag == "path":
        path(ctx, a["d"])
    else:
        raise ValueError(f"Unsupported SVG element: {tag}")
    paint(ctx, style, gradients, bounds)


def rasterize(source: Path, target: Path, width: int, height: int, scale: int = 1) -> None:
    root = ET.parse(source).getroot()
    gradients = {}
    for node in root.iter():
        tag = node.tag.rsplit("}", 1)[-1]
        if tag not in ("linearGradient", "radialGradient"):
            continue
        stops = []
        for stop in node:
            stops.append((number(stop.attrib.get("offset")), stop.attrib.get("stop-color", "#000"), number(stop.attrib.get("stop-opacity"), 1)))
        gradients[node.attrib["id"]] = (tag, node.attrib, stops)
    surface = CAIRO.cairo_image_surface_create(0, width * scale, height * scale)
    ctx = CAIRO.cairo_create(surface)
    CAIRO.cairo_scale(ctx, scale, scale)
    render_node(ctx, root, {"fill": "black"}, gradients, (width, height))
    target.parent.mkdir(parents=True, exist_ok=True)
    status = CAIRO.cairo_surface_write_to_png(surface, str(target).encode())
    CAIRO.cairo_destroy(ctx); CAIRO.cairo_surface_destroy(surface)
    if status:
        raise RuntimeError(f"Cairo PNG error {status}: {target}")


def png_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()[:24]
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not a PNG: {path}")
    return struct.unpack(">II", data[16:24])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT / "replacement_png",
        help="PNG destination (default: theme_work/replacement_png)",
    )
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    output_dir = args.output_dir.resolve()
    for resource in manifest["resources"]:
        source = ROOT / resource["replacementSvgPath"]
        relative_target = Path(resource["exportedPngPath"]).relative_to("replacement_png")
        target = output_dir / relative_target
        if args.force or not target.exists():
            rasterize(source, target, resource["width"], resource["height"])
        if png_dimensions(target) != (resource["width"], resource["height"]):
            raise ValueError(f"Wrong exported dimensions: {target}")


if __name__ == "__main__":
    main()
