#!/usr/bin/env python3
"""Build the Moonforge Garden SVG sources and its resumable manifest."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
REFERENCE = ROOT.parent / "theme_marioai.llmtheme.txt"
SVG_ROOT = ROOT / "replacement_svg"
MANIFEST = ROOT / "theme_manifest.json"

SHEET_DIRS = {
    "mapsheet.png": "mapsheet",
    "bgsheet.png": "bgsheet",
    "enemysheet.png": "enemysheet",
    "itemsheet.png": "itemsheet",
    "particlesheet.png": "particlesheet",
}


def svg_shell(w: int, h: int, body: str, defs: str = "") -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}" shape-rendering="geometricPrecision">'
        f'<defs>{defs}</defs>{body}</svg>\n'
    )


def empty_svg(w: int, h: int) -> str:
    return svg_shell(w, h, '<rect width="100%" height="100%" fill="none"/>')


def terrain_svg(i: int, w: int, h: int) -> str:
    v = i % 12
    defs = ('<linearGradient id="stone" x2="0" y2="1"><stop stop-color="#315e68"/>'
            '<stop offset="1" stop-color="#182f45"/></linearGradient>'
            '<linearGradient id="moss"><stop stop-color="#b4d66a"/>'
            '<stop offset="1" stop-color="#3f9274"/></linearGradient>')
    body = '<rect width="16" height="16" rx="1.2" fill="url(#stone)"/>'
    if v in (0, 1, 2, 3):
        body += '<path d="M0 0h16v4L13 3 10 5 7 3 4 5 0 4Z" fill="url(#moss)"/>'
        body += f'<path d="M{2+v} 7v7M{9+(v%2)} 5v4M0 11h16" stroke="#244b56" stroke-width="1" opacity=".8"/>'
        body += '<path d="M1 1h10" stroke="#d8ed89" stroke-width=".7" opacity=".7"/>'
    elif v in (4, 5, 6):
        body += '<path d="M0 2 4 0l4 2 4-2 4 2v14H0Z" fill="#6f4563"/>'
        body += '<path d="M0 3h16M3 3v5m7-5v5M0 9h16m6 0v7m7-7v7" stroke="#b2676d" stroke-width="1"/>'
        body += '<path d="M1 3h14" stroke="#e59775" stroke-width=".7" opacity=".65"/>'
    elif v in (7, 8):
        body += '<rect x="2" y="2" width="12" height="12" rx="3" fill="#c78b47" stroke="#4d3951"/>'
        body += '<circle cx="8" cy="8" r="3.2" fill="#f1c75b"/><path d="m8 4 1.2 3L12 8l-2.8 1L8 12 6.8 9 4 8l2.8-1Z" fill="#fff0a3"/>'
    else:
        body += '<path d="M0 16V6L4 2h8l4 4v10" fill="#3a6570"/>'
        body += '<path d="M1 15 5 8l3 5 3-8 4 10" stroke="#72a28b" stroke-width="1.4" fill="none"/>'
        body += '<circle cx="4" cy="5" r="1" fill="#f5cb68"/>'
    return svg_shell(w, h, body, defs)


def scenery_svg(i: int, w: int, h: int) -> str:
    kind = (i // 4) % 7
    defs = ('<linearGradient id="g" x2="0" y2="1"><stop stop-color="#8ed6a3"/>'
            '<stop offset="1" stop-color="#347469"/></linearGradient>')
    if kind == 0:  # curled fern
        body = '<path d="M8 16C7 11 5 8 3 6M7 12c3-1 5-3 5-6 0-3-4-3-4 0 0 2 3 2 3 0" fill="none" stroke="#2d675c" stroke-width="3"/>'
        body += '<path d="M8 16C7 11 5 8 3 6M7 12c3-1 5-3 5-6 0-3-4-3-4 0 0 2 3 2 3 0" fill="none" stroke="#78b985" stroke-width="1.4"/>'
        body += '<circle cx="3" cy="6" r="2" fill="#d0e77b"/>'
    elif kind == 1:  # brass pipe/column fragment
        body = '<path d="M3 16V5h10v11M1 6V2h14v4Z" fill="#b77943" stroke="#553f4e"/>'
        body += '<path d="M4 3h8M6 7v8" stroke="#f2cb69" stroke-width="1" opacity=".8"/>'
    elif kind == 2:  # crystal
        body = '<path d="m8 1 5 5-2 9H5L3 6Z" fill="#65cdd0" stroke="#304c69"/>'
        body += '<path d="m8 1 1 12-5-7m5 7 4-7" fill="none" stroke="#d6fbda" stroke-width="1"/>'
    elif kind == 3:  # lantern
        body = '<path d="M5 4V2h6v2M4 5h8l1 9H3Z" fill="#4e4260" stroke="#251f38"/>'
        body += '<path d="M6 7h4l1 5H5Z" fill="#ffd568"/><circle cx="8" cy="9" r="1.5" fill="#fff6ad"/>'
    elif kind == 4:  # cloud tuft
        body = '<path d="M1 12c0-3 3-4 5-3 0-4 6-4 7 0 4 0 4 5 1 6H2c-2 0-2-2-1-3Z" fill="#9fc5c2" stroke="#456175"/>'
        body += '<path d="M3 12c3 1 7 0 10-2" fill="none" stroke="#d8efe0"/>'
    elif kind == 5:  # arch fragment
        body = '<path d="M1 16V8C1-1 15-1 15 8v8h-4V8C11 3 5 3 5 8v8Z" fill="#74506b" stroke="#3b324c"/>'
        body += '<path d="M2 8c1-7 11-7 12 0" fill="none" stroke="#d18a72" stroke-width="1.5"/>'
    else:  # mushroom-like bell flower (not mascot)
        body = '<path d="M7 9h2l2 7H5Z" fill="#e8d59b" stroke="#604b5d"/>'
        body += '<path d="M2 9C3 2 13 2 14 9c-4 2-8 2-12 0Z" fill="#cf5f72" stroke="#603e5a"/>'
        body += '<circle cx="6" cy="6" r="1" fill="#ffd77a"/><circle cx="11" cy="8" r=".8" fill="#ffd77a"/>'
    return svg_shell(w, h, body, defs)


def background_svg(i: int, w: int, h: int) -> str:
    kind = i % 8
    defs = ('<linearGradient id="sky" x2="0" y2="1"><stop stop-color="#26365f"/>'
            '<stop offset="1" stop-color="#4d5670"/></linearGradient>'
            '<radialGradient id="glow"><stop stop-color="#fff1a6"/><stop offset="1" stop-color="#e59168"/></radialGradient>')
    body = '<rect width="32" height="32" fill="url(#sky)"/>'
    if kind in (0, 1):
        body += f'<circle cx="{8+kind*13}" cy="8" r="5" fill="url(#glow)"/>'
        body += '<path d="M0 25 7 15l5 7 5-12 8 12 7-7v17H0Z" fill="#263d54"/>'
        body += '<path d="M0 27c7-5 14 2 20-3c4-3 9-2 12 0v8H0Z" fill="#315c62"/>'
    elif kind in (2, 3):
        body += '<path d="M0 24C5 12 12 15 16 5c4 10 11 8 16 19v8H0Z" fill="#315a61"/>'
        body += '<path d="M4 25 8 14l3 11m10 0 3-13 4 13" stroke="#74a176" stroke-width="2"/>'
        body += '<g fill="#f0c867"><circle cx="6" cy="7" r="1"/><circle cx="25" cy="5" r=".7"/><circle cx="20" cy="12" r=".8"/></g>'
    elif kind in (4, 5):
        body += '<path d="M0 18h32v14H0Z" fill="#322f4c"/><path d="M2 18V7h5v11m3 0V3h6v15m4 0V9h4v9m3 0V5h3v13" fill="#564461"/>'
        body += '<path d="M0 19h32" stroke="#da8b67"/><g fill="#f6d36c"><path d="M12 6h2v3h-2zM22 11h1v3h-1zM28 7h1v2h-1z"/></g>'
    else:
        body += '<path d="M0 23c4-8 9-8 13 0c5-12 13-12 19 0v9H0Z" fill="#375a66"/>'
        body += '<path d="M3 26c6-3 8 2 14-2c5-4 10 1 15-2" fill="none" stroke="#76a785" stroke-width="2"/>'
        body += '<path d="m5 8 1 2 2 1-2 1-1 2-1-2-2-1 2-1Zm20 3 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" fill="#f4d671"/>'
    body += f'<path d="M1 {28-(i%3)}h30" stroke="#9ac1a0" stroke-width=".5" opacity=".35"/>'
    return svg_shell(w, h, body, defs)


def enemy_svg(i: int, w: int, h: int) -> str:
    frame = i % 7
    species = (i // 16) % 3
    dx = [-1, 0, 1, 0, -1, 1, 0][frame]
    defs = ('<linearGradient id="wing"><stop stop-color="#ecad72"/>'
            '<stop offset="1" stop-color="#a84f72"/></linearGradient>')
    body = '<ellipse cx="8" cy="29" rx="6" ry="2" fill="#17253a" opacity=".35"/>'
    if species == 0:  # lantern moth
        body += f'<path d="M{7+dx} 18C1 11 1 5 7 8l1 7M{9+dx} 18c6-7 6-13 0-10l-1 7" fill="url(#wing)" stroke="#553752"/>'
        body += f'<ellipse cx="{8+dx}" cy="19" rx="4" ry="7" fill="#435e69" stroke="#273448"/>'
        body += f'<circle cx="{7+dx}" cy="18" r="1" fill="#ffe27b"/><circle cx="{10+dx}" cy="18" r="1" fill="#ffe27b"/>'
        body += f'<path d="M{6+dx} 12 4 8m{6+dx} 4 2-4M5 26l-2 3m8-3 2 3" stroke="#273448" fill="none"/>'
    elif species == 1:  # clockwork beetle
        body += '<path d="M3 18c0-6 10-6 10 0v8H3Z" fill="#568a83" stroke="#263e4d"/>'
        body += '<path d="M8 13v13M4 18h8" stroke="#b9cf79"/><circle cx="8" cy="19" r="2" fill="#e3b956"/>'
        body += f'<path d="M3 23 1 {27+frame%2}m12-4 2 {27+(frame+1)%2}" stroke="#2c3548" stroke-width="2"/>'
        body += '<path d="M5 13 3 9m6 4 2-4" stroke="#2c3548"/>'
    else:  # hooded seed sprite
        body += '<path d="M8 6c5 4 6 10 4 16H4C2 16 3 10 8 6Z" fill="#75506c" stroke="#302d45"/>'
        body += '<path d="M5 15c1-4 5-4 6 0v5H5Z" fill="#d79a72"/>'
        body += '<circle cx="7" cy="16" r="1" fill="#253246"/><circle cx="10" cy="16" r="1" fill="#253246"/>'
        body += f'<path d="M5 22 3 {28-frame%2}m8-6 2 {27+(frame%2)}" stroke="#302d45" stroke-width="2"/>'
        body += '<path d="m7 5 1-3 2 4" fill="#8fbd78" stroke="#355b53"/>'
    return svg_shell(w, h, body, defs)


def item_svg(i: int, w: int, h: int) -> str:
    if i % 3 == 0:
        body = '<path d="M8 1 13 5l-2 9H5L3 5Z" fill="#63c7c8" stroke="#2b4360"/><path d="M8 2v11M4 6h8" stroke="#d6ffdc"/><circle cx="6" cy="5" r="1" fill="#fff7a6"/>'
    elif i % 3 == 1:
        body = '<circle cx="8" cy="8" r="6" fill="#d79b4e" stroke="#583d4f"/><path d="M8 3v10M3 8h10" stroke="#ffe079"/><circle cx="8" cy="8" r="2" fill="#fff2a0"/>'
    else:
        body = '<path d="M8 14C2 11 2 5 7 5c0-4 5-4 5 0 4 1 2 6-4 9Z" fill="#82b66e" stroke="#35534f"/><path d="M8 13c0-5 1-8 4-10M5 8c2 0 3 1 3 3" stroke="#e0e98b" fill="none"/>'
    return svg_shell(w, h, body)


def particle_svg(i: int, w: int, h: int) -> str:
    kind = i % 4
    if kind == 0:
        body = '<path d="m4 0 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill="#ffe37b"/><circle cx="4" cy="4" r="1" fill="#fffbd4"/>'
    elif kind == 1:
        body = '<path d="M1 5C2 1 6 1 7 5 5 8 3 8 1 5Z" fill="#e56f72" stroke="#704059" stroke-width=".7"/>'
    elif kind == 2:
        body = '<path d="M1 7 3 1l2 3 2-2-1 5Z" fill="#65c7b0" stroke="#315067" stroke-width=".7"/>'
    else:
        body = '<circle cx="4" cy="4" r="3" fill="#7bcad0" opacity=".65"/><path d="M2 3c1-2 3-2 4 0" stroke="#e1ffe7" fill="none"/>'
    return svg_shell(w, h, body)


RENDERERS = {
    "terrain": terrain_svg,
    "scenery": scenery_svg,
    "background": background_svg,
    "enemyArt": enemy_svg,
    "itemArt": item_svg,
    "particleArt": particle_svg,
}


def inventory(reference: dict) -> dict:
    resources = []
    for asset_id, info in reference["assetCatalog"].items():
        sheet = info["sourceSheet"]
        folder = SHEET_DIRS[sheet]
        size = info["defaultSize"]
        empty = bool(info.get("emptyVisual"))
        resources.append({
            "id": asset_id,
            "originalPath": f"{sheet}#cell-{info['sourceIndex']}",
            "sourceSheet": sheet,
            "sourceIndex": info["sourceIndex"],
            "sourceCell": info.get("sourceCell"),
            "width": size["w"],
            "height": size["h"],
            "family": info["category"],
            "replacementSvgPath": f"replacement_svg/{folder}/{asset_id}.svg",
            "exportedPngPath": f"replacement_png/{folder}/{asset_id}.png",
            "referenceEmpty": empty,
            "status": "inventory_pending",
        })
    return {
        "schemaVersion": 1,
        "theme": {"id": "moonforge-garden", "title": "Moonforge Garden", "artDirection": "A moonlit clockwork conservatory of mossy slate, brass lanterns, coral moths, and crystal seeds."},
        "reference": {"file": "../theme_marioai.llmtheme.txt", "format": reference.get("format"), "resourceCount": len(resources)},
        "contract": {"standaloneResources": len(resources), "sourceSheets": reference["marioAI"]["sheets"], "transparentReferenceCellsRemainTransparent": True},
        "resources": resources,
        "summary": {"inventory_pending": len(resources)},
    }


def save_manifest(manifest: dict) -> None:
    counts = {}
    for resource in manifest["resources"]:
        counts[resource["status"]] = counts.get(resource["status"], 0) + 1
    manifest["summary"] = counts
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory-only", action="store_true")
    args = parser.parse_args()
    reference = json.loads(REFERENCE.read_text())
    manifest = inventory(reference)
    ROOT.mkdir(parents=True, exist_ok=True)
    save_manifest(manifest)
    if args.inventory_only:
        return
    for number, resource in enumerate(manifest["resources"], 1):
        out = ROOT / resource["replacementSvgPath"]
        out.parent.mkdir(parents=True, exist_ok=True)
        w, h = resource["width"], resource["height"]
        if resource["referenceEmpty"]:
            source = empty_svg(w, h)
            resource["status"] = "svg_complete_transparent"
        else:
            source = RENDERERS[resource["family"]](resource["sourceIndex"], w, h)
            resource["status"] = "svg_complete"
        out.write_text(source)
        if number % 32 == 0:
            save_manifest(manifest)
    save_manifest(manifest)


if __name__ == "__main__":
    main()
