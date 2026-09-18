#!/usr/bin/env python3
"""
Convert MarioAI resource sheets into a self-contained LLMario theme pack.

Expected source directory contents:
    mapsheet.png
    bgsheet.png
    enemysheet.png
    itemsheet.png
    particlesheet.png
    tiles.dat
    LICENSE   (recommended; embedded into theme metadata if present)

Usage:
    python3 marioai_to_llmtheme.py /path/to/marioai-source
    python3 marioai_to_llmtheme.py /path/to/marioai-source -o theme_marioai.llmtheme.txt
    python3 marioai_to_llmtheme.py /path/to/marioai-source --dump-cells

Requires Pillow:
    python3 -c 'import PIL'
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print(
        "ERROR: Pillow is required. Check with: python3 -c 'import PIL'\n"
        "If it is not installed, install your distro's python3-pil package or Pillow.",
        file=sys.stderr,
    )
    raise SystemExit(2)


BIT_BLOCK_UPPER = 1 << 0
BIT_BLOCK_ALL = 1 << 1
BIT_BLOCK_LOWER = 1 << 2
BIT_SPECIAL = 1 << 3
BIT_BUMPABLE = 1 << 4
BIT_BREAKABLE = 1 << 5
BIT_PICKUPABLE = 1 << 6
BIT_ANIMATED = 1 << 7

FLAGS = [
    ("blockUpper", BIT_BLOCK_UPPER),
    ("blockAll", BIT_BLOCK_ALL),
    ("blockLower", BIT_BLOCK_LOWER),
    ("special", BIT_SPECIAL),
    ("bumpable", BIT_BUMPABLE),
    ("breakable", BIT_BREAKABLE),
    ("pickupable", BIT_PICKUPABLE),
    ("animated", BIT_ANIMATED),
]

SHEETS = {
    "mapsheet.png": ("map", 16, 16),
    "bgsheet.png": ("bg", 32, 32),
    "enemysheet.png": ("enemy", 16, 32),
    "itemsheet.png": ("item", 16, 16),
    "particlesheet.png": ("particle", 8, 8),
}


def png_data_url(img: Image.Image) -> str:
    bio = io.BytesIO()
    img.save(bio, format="PNG", optimize=False)
    return "data:image/png;base64," + base64.b64encode(bio.getvalue()).decode("ascii")


def image_is_empty(img: Image.Image) -> bool:
    rgba = img.convert("RGBA")
    return rgba.getchannel("A").getbbox() is None


def split_sheet(path: Path, prefix: str, cell_w: int, cell_h: int):
    img = Image.open(path).convert("RGBA")
    if img.width % cell_w or img.height % cell_h:
        raise ValueError(
            f"{path.name}: {img.width}x{img.height} is not divisible by {cell_w}x{cell_h}"
        )

    cols = img.width // cell_w
    rows = img.height // cell_h
    cells = []

    # Row-major. This matches MarioAI's mapsheet lookup:
    # Art.level[b % 16][b / 16]
    for y in range(rows):
        for x in range(cols):
            idx = y * cols + x
            crop = img.crop(
                (x * cell_w, y * cell_h, (x + 1) * cell_w, (y + 1) * cell_h)
            )
            if prefix == "map":
                key = f"marioai_map_{idx:02x}"
            else:
                key = f"marioai_{prefix}_{idx:03d}"
            cells.append(
                {
                    "key": key,
                    "index": idx,
                    "x": x,
                    "y": y,
                    "w": cell_w,
                    "h": cell_h,
                    "empty": image_is_empty(crop),
                    "image": crop,
                }
            )
    return {
        "name": path.name,
        "prefix": prefix,
        "width": img.width,
        "height": img.height,
        "cellWidth": cell_w,
        "cellHeight": cell_h,
        "cols": cols,
        "rows": rows,
        "cells": cells,
    }


def decode_behavior(value: int) -> dict:
    return {name: bool(value & bit) for name, bit in FLAGS}


def llmario_collision(value: int) -> dict:
    """
    Best current LLMario collision projection.

    Exact MarioAI behavior is ALSO preserved separately in the theme under
    marioAI.behaviorByte/behavior flags, so no information is discarded.

    MarioAI isBlocking():
      BLOCK_ALL   -> blocks regardless of movement direction
      BLOCK_UPPER -> blocks when ya > 0 (landing / top-only)
      BLOCK_LOWER -> blocks when ya < 0 (ceiling-only)

    Current LLMario theme truth has a useful rect/topStrip vocabulary but not
    a native "ceiling-only" primitive. Ceiling-only cases are therefore marked
    explicitly as an approximation instead of silently pretending they are exact.
    """
    b = decode_behavior(value)

    if b["blockAll"]:
        return {
            "collision": {"kind": "rect", "x": 0, "y": 0, "w": 16, "h": 16},
            "projection": "exact-for-solid-rect",
        }

    if b["blockUpper"] and not b["blockLower"]:
        return {
            "collision": {"kind": "topStrip", "x": 0, "y": 0, "w": 16, "h": 4},
            "projection": "approximation-of-marioai-top-only",
        }

    if b["blockLower"] and not b["blockUpper"]:
        return {
            "collision": {"kind": "none"},
            "projection": "unsupported-ceiling-only-preserved-in-marioAI-metadata",
        }

    if b["blockUpper"] and b["blockLower"]:
        return {
            "collision": {"kind": "rect", "x": 0, "y": 0, "w": 16, "h": 16},
            "projection": "approximation-of-two-way-vertical-blocking",
        }

    return {
        "collision": {"kind": "none"},
        "projection": "exact-nonblocking",
    }


def make_theme(src: Path, dump_cells: bool = False) -> tuple[dict, dict]:
    required = list(SHEETS) + ["tiles.dat"]
    missing = [name for name in required if not (src / name).is_file()]
    if missing:
        raise FileNotFoundError("missing required files: " + ", ".join(missing))

    behaviors = (src / "tiles.dat").read_bytes()
    if len(behaviors) != 256:
        raise ValueError(f"tiles.dat must be exactly 256 bytes; got {len(behaviors)}")

    sheets = {}
    for filename, (prefix, cw, ch) in SHEETS.items():
        sheets[prefix] = split_sheet(src / filename, prefix, cw, ch)

    map_sheet = sheets["map"]
    if map_sheet["cols"] != 16 or map_sheet["rows"] != 16:
        raise ValueError(
            f"mapsheet.png must be a 16x16 grid of 16px tiles; got "
            f"{map_sheet['cols']}x{map_sheet['rows']}"
        )
    if len(map_sheet["cells"]) != 256:
        raise ValueError("mapsheet.png did not produce 256 tiles")

    assets_images = {}
    asset_catalog = {}
    collision_truth = {}
    manifest_tiles = []

    if dump_cells:
        dump_dir = src / "marioai_cells"
        dump_dir.mkdir(exist_ok=True)
    else:
        dump_dir = None

    # Exact 256 mapsheet cells + behavior table.
    for cell in map_sheet["cells"]:
        idx = cell["index"]
        key = cell["key"]
        value = behaviors[idx]
        flags = decode_behavior(value)
        projection = llmario_collision(value)

        assets_images[key] = png_data_url(cell["image"])
        asset_catalog[key] = {
            "category": "terrain" if any(
                (flags["blockAll"], flags["blockUpper"], flags["blockLower"])
            ) else "scenery",
            "sourceSheet": "mapsheet.png",
            "sourceIndex": idx,
            "sourceHex": f"{idx:02X}",
            "sourceCell": {"x": cell["x"], "y": cell["y"]},
            "defaultSize": {"w": 16, "h": 16},
            "emptyVisual": cell["empty"],
        }

        collision_truth[key] = {
            "defaultSize": {"w": 16, "h": 16},
            "collision": projection["collision"],
            "verified": True,
            "source": "MarioAI tiles.dat",
            "projection": projection["projection"],
            "marioAI": {
                "tileIndex": idx,
                "tileHex": f"{idx:02X}",
                "behaviorByte": value,
                "behaviorHex": f"{value:02X}",
                **flags,
            },
        }

        manifest_tiles.append(
            {
                "index": idx,
                "hex": f"{idx:02X}",
                "asset": key,
                "sheetX": cell["x"],
                "sheetY": cell["y"],
                "behaviorByte": value,
                "behaviorHex": f"{value:02X}",
                "flags": flags,
                "llmarioCollision": projection["collision"],
                "projection": projection["projection"],
                "emptyVisual": cell["empty"],
            }
        )

        if dump_dir:
            cell["image"].save(dump_dir / f"{idx:02x}.png")

    # Supporting sheets. These are preserved exactly as cut cells, but we do
    # not invent gameplay behavior for them here.
    for prefix in ("bg", "enemy", "item", "particle"):
        sheet = sheets[prefix]
        category = {
            "bg": "background",
            "enemy": "enemyArt",
            "item": "itemArt",
            "particle": "particleArt",
        }[prefix]

        if dump_dir:
            sub = dump_dir / prefix
            sub.mkdir(exist_ok=True)

        for cell in sheet["cells"]:
            key = cell["key"]
            assets_images[key] = png_data_url(cell["image"])
            asset_catalog[key] = {
                "category": category,
                "sourceSheet": sheet["name"],
                "sourceIndex": cell["index"],
                "sourceCell": {"x": cell["x"], "y": cell["y"]},
                "defaultSize": {"w": cell["w"], "h": cell["h"]},
                "emptyVisual": cell["empty"],
            }
            if dump_dir:
                cell["image"].save(sub / f"{cell['index']:03d}.png")

    license_path = src / "LICENSE"
    license_text = (
        license_path.read_text(encoding="utf-8", errors="replace")
        if license_path.is_file()
        else None
    )

    resources = [
        {
            "id": "medovina_marioai_resources",
            "title": "MarioAI resource sheets",
            "source": "medovina/MarioAI",
            "url": "https://github.com/medovina/MarioAI",
            "sourceFiles": [
                "mapsheet.png",
                "bgsheet.png",
                "enemysheet.png",
                "itemsheet.png",
                "particlesheet.png",
                "tiles.dat",
            ],
            "copyright": (
                "Copyright (c) 2009-2015, Sergey Karakovskiy, "
                "Julian Togelius and Jakub Gemrot; all rights reserved."
            ),
            "license": "MarioAI BSD-style license; retain copyright, conditions, and disclaimer.",
        }
    ]
    if license_text:
        resources[0]["licenseText"] = license_text

    theme = {
        "format": "llmario-theme-pack-v1",
        "themeVersion": 1,
        "id": "marioai",
        "title": "MarioAI 16px Tile Theme",
        "source": {
            "repository": "https://github.com/medovina/MarioAI",
            "resourcePath": "src/engine/resources",
            "converter": "marioai_to_llmtheme.py",
            "notes": (
                "mapsheet tile numbering is row-major and matches "
                "Art.level[b % 16][b / 16]."
            ),
        },
        "notes": [
            "Mechanically converted from MarioAI resource sheets.",
            "All 256 mapsheet tile identities and all 256 tiles.dat behavior bytes are preserved.",
            "Current LLMario collision truth exactly represents full-solid/nonblocking tiles; "
            "top-only is projected to topStrip; ceiling-only remains explicitly marked unsupported "
            "rather than silently converted.",
            "Supporting background/enemy/item/particle sheets are cut into individual embedded assets "
            "without inventing gameplay semantics.",
        ],
        "engineContract": "llmario-theme-pack-v1+marioai-tiles-v1",
        "resources": resources,
        "assets": {"images": assets_images},
        "recipes": {"platforms": {}, "blocks": {}},
        "assetCatalog": asset_catalog,
        "collisionTruth": {
            "source": "MarioAI tiles.dat",
            "tileSize": 16,
            "assets": collision_truth,
        },
        "defaults": {
            "hud": {},
            "messages": {
                "welcome": ["MarioAI-derived theme loaded."],
                "win": "Clear!",
            },
            "audio": {},
            "placement": {"grid": 16},
        },
        "marioAI": {
            "tileSize": 16,
            "mapsheet": {
                "cols": 16,
                "rows": 16,
                "indexing": "tile = x + y*16",
            },
            "behaviorBits": {
                "BLOCK_UPPER": BIT_BLOCK_UPPER,
                "BLOCK_ALL": BIT_BLOCK_ALL,
                "BLOCK_LOWER": BIT_BLOCK_LOWER,
                "SPECIAL": BIT_SPECIAL,
                "BUMPABLE": BIT_BUMPABLE,
                "BREAKABLE": BIT_BREAKABLE,
                "PICKUPABLE": BIT_PICKUPABLE,
                "ANIMATED": BIT_ANIMATED,
            },
            "sheets": {
                name: {
                    "width": s["width"],
                    "height": s["height"],
                    "cellWidth": s["cellWidth"],
                    "cellHeight": s["cellHeight"],
                    "cols": s["cols"],
                    "rows": s["rows"],
                    "count": len(s["cells"]),
                }
                for name, s in sheets.items()
            },
        },
    }

    manifest = {
        "format": "marioai-tile-manifest-v1",
        "tileSize": 16,
        "source": "medovina/MarioAI src/engine/resources",
        "tiles": manifest_tiles,
    }

    return theme, manifest


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "source_dir",
        nargs="?",
        default=".",
        help="directory containing the MarioAI resource files (default: current directory)",
    )
    ap.add_argument(
        "-o",
        "--output",
        default="theme_marioai.llmtheme.txt",
        help="output theme path (default: theme_marioai.llmtheme.txt)",
    )
    ap.add_argument(
        "--manifest",
        default="marioai_tile_manifest.json",
        help="tile manifest output (default: marioai_tile_manifest.json)",
    )
    ap.add_argument(
        "--dump-cells",
        action="store_true",
        help="also write cropped PNG cells under SOURCE_DIR/marioai_cells/",
    )
    args = ap.parse_args()

    src = Path(args.source_dir).expanduser().resolve()
    if not src.is_dir():
        print(f"ERROR: not a directory: {src}", file=sys.stderr)
        return 2

    try:
        theme, manifest = make_theme(src, dump_cells=args.dump_cells)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    out = Path(args.output)
    if not out.is_absolute():
        out = src / out

    manifest_out = Path(args.manifest)
    if not manifest_out.is_absolute():
        manifest_out = src / manifest_out

    out.write_text(json.dumps(theme, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    manifest_out.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print(f"wrote {out}")
    print(f"wrote {manifest_out}")
    print(f"theme images: {len(theme['assets']['images'])}")
    print("mapsheet tiles: 256")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
