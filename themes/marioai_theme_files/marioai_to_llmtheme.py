#!/usr/bin/env python3
"""Build the complete, nonempty MarioAI reference theme.

Canonical public IDs and semantic metadata intentionally come verbatim from
``compile_marioai_semantics.py``; this converter contains no second asset-naming
table.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import sys
from collections import defaultdict
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow is required (python3 -m pip install Pillow).", file=sys.stderr)
    raise SystemExit(2)

import compile_marioai_semantics as semantics

THEME_SHEETS = {name: spec for name, spec in semantics.SHEETS.items() if spec[3] == "theme"}
CATEGORY = {
    "map": "mapTile", "background": "backgroundArt", "enemy": "enemyArt",
    "item": "itemArt", "particle": "particleArt", "player_large": "playerArt",
    "player_small": "playerArt", "player_fire": "playerArt", "player_carry": "playerArt",
    "goal_actor": "goalActorArt",
}


def png_data_url(image: Image.Image) -> str:
    out = io.BytesIO()
    image.save(out, format="PNG", optimize=False)
    return "data:image/png;base64," + base64.b64encode(out.getvalue()).decode("ascii")


def canonical_asset_id(entry: dict) -> str:
    """Use the semantic compiler's public asset ID verbatim."""
    return entry["canonical_name"]


def semantic_entries(src: Path, behavior: bytes) -> tuple[list[dict], dict]:
    logical = semantics.map_logical_roles()
    visual_anims = semantics.map_visual_animation_roles()
    autotiles, reverse_autotiles = semantics.autotile_rules()
    entries = []
    sheet_info = {}
    for filename, (sheet, cw, ch, scope) in THEME_SHEETS.items():
        path = src / filename
        if not path.is_file():
            raise FileNotFoundError(f"missing required file: {filename}")
        image = Image.open(path).convert("RGBA")
        if image.width % cw or image.height % ch:
            raise ValueError(f"{filename}: dimensions are not divisible by {cw}x{ch}")
        cols, rows = image.width // cw, image.height // ch
        sheet_info[filename] = {"width": image.width, "height": image.height,
            "cellWidth": cw, "cellHeight": ch, "cols": cols, "rows": rows,
            "count": cols * rows}
        for y in range(rows):
            for x in range(cols):
                index = y * cols + x
                crop = image.crop((x*cw, y*ch, (x+1)*cw, (y+1)*ch))
                entry = {"file": filename, "sheet": sheet, "scope": scope,
                    "index": index, "x": x, "y": y, "cell_width": cw,
                    "cell_height": ch, "canonical_name": semantics.fallback_name(sheet, x, y, index),
                    "roles": [], "image": crop,
                    "empty": crop.getchannel("A").getbbox() is None}
                if sheet == "map":
                    value = behavior[index]
                    entry.update(behavior_byte=value, behavior_hex=f"{value:02X}",
                                 behavior_flags=semantics.behavior_flags(value))
                    for source_name, contract_role in logical.get(index, []):
                        semantics.add_role(entry, source_name, contract_role)
                    for source_name, contract_role, group, frame in visual_anims.get(index, []):
                        semantics.add_role(entry, source_name, contract_role, animation=group, frame=frame)
                    for style, mask in reverse_autotiles.get(index, []):
                        semantics.add_role(entry, f"terrain.{style}.mask_{mask:04b}",
                            f"terrain.autotile.{style}.mask_{mask:04b}",
                            autotile_style=style, neighbor_mask=f"{mask:04b}")
                elif sheet.startswith("player_"):
                    role = semantics.player_role(sheet, x, y)
                    if role: semantics.add_role(entry, *role)
                elif sheet == "enemy": semantics.apply_enemy_roles(entry, x, y)
                elif sheet == "item": semantics.apply_item_roles(entry, x, y)
                elif sheet == "particle": semantics.apply_particle_roles(entry, x, y)
                elif sheet == "goal_actor": semantics.apply_goal_roles(entry, x, y)
                entry["canonical_name"] = semantics.canonical_asset_name(
                    sheet, x, y, index, entry["roles"]
                )
                entry["asset"] = None if entry["empty"] else canonical_asset_id(entry)
                entries.append(entry)
    return entries, {"sheets": sheet_info, "autotile": autotiles}


def decode_behavior(value: int) -> dict:
    names = [("blockUpper",1),("blockAll",2),("blockLower",4),("special",8),
             ("bumpable",16),("breakable",32),("pickupable",64),("animated",128)]
    return {name: bool(value & bit) for name, bit in names}


def collision_projection(value: int) -> tuple[dict, str]:
    b = decode_behavior(value)
    if b["blockAll"]: return ({"kind":"rect","x":0,"y":0,"w":16,"h":16}, "exact-for-solid-rect")
    if b["blockUpper"] and not b["blockLower"]: return ({"kind":"topStrip","x":0,"y":0,"w":16,"h":4}, "approximation-of-marioai-top-only")
    if b["blockLower"] and not b["blockUpper"]: return ({"kind":"none"}, "unsupported-ceiling-only-preserved-in-marioAI-metadata")
    if b["blockUpper"] and b["blockLower"]: return ({"kind":"rect","x":0,"y":0,"w":16,"h":16}, "approximation-of-two-way-vertical-blocking")
    return ({"kind":"none"}, "exact-nonblocking")


def construction_catalog() -> dict:
    """Construction behavior references canonical assets directly; no role lookup map."""
    return {"version":1,"topologyContract":{"neighborOrder":["top","right","bottom","left"],"note":"Catalog keys are explicit editor topology; MarioAI mask suffixes are provenance and are not decoded at runtime."},"families":{
      "terrain.overground":{"id":"terrain.overground","name":"Overground terrain","authoringGroup":"world","defaultSceneLayer":"world","category":"terrain","type":"terrain","dimensions":{"cell":16},"manualAssets":["map.terrain.overground.grass_top.left","map.terrain.overground.grass_top.middle","map.terrain.overground.grass_top.right","map.terrain.overground.grass_top.alt_left","map.terrain.overground.grass_top.alt_middle","map.terrain.overground.grass_top.alt_right","map.terrain.overground.grass_edge.curved_left","map.terrain.overground.grass_edge.curved_middle","map.terrain.overground.grass_edge.curved_right","map.terrain.overground.rounded_corner.top_left","map.terrain.overground.rounded_corner.top_right","map.terrain.overground.rounded_corner.bottom_left","map.terrain.overground.rounded_corner.bottom_right","map.terrain.overground.dirt_fill.variant_0","map.terrain.overground.dirt_fill.variant_1","map.terrain.overground.dirt_fill.variant_2","map.terrain.overground.dirt_fill.variant_3","map.terrain.overground.dirt_fill.variant_4","map.terrain.overground.dirt_fill.variant_5"],"components":{"topology":{"0000":"map.terrain.overground.grass_top.middle","0100":"map.terrain.overground.grass_top.left","0001":"map.terrain.overground.grass_top.right","0101":"map.terrain.overground.grass_top.middle","0010":"map.terrain.overground.grass_top.middle","0110":"map.terrain.overground.grass_top.left","0011":"map.terrain.overground.grass_top.right","0111":"map.terrain.overground.grass_top.middle","1000":"map.terrain.overground.dirt_fill.variant_1","1100":"map.terrain.overground.dirt_fill.variant_1","1001":"map.terrain.overground.dirt_fill.variant_1","1101":"map.terrain.overground.dirt_fill.variant_1","1111":"map.terrain.overground.dirt_fill.variant_1"},"topologyFallback":{"strategy":"procedural","asset":"terrain.overground.procedural","style":{"fill":"#75451f","top":"#6abf31","topRatio":0.3125,"stroke":"rgba(0,0,0,.45)"}}},"ascii":{"import":"X","export":"X"},"topologyVerification":"Associations use only the visually named grass-top and dirt-fill pieces. Unclear corner and edge topologies retain the procedural fallback; historic MarioAI mask suffixes are not decoded."},
      "pipe.vertical":{"id":"pipe.vertical","authoringGroup":"world","defaultSceneLayer":"world","name":"Vertical pipe","category":"system","type":"resizable","dimensions":{"cell":16,"minW":2,"maxW":2,"defaultW":2,"minH":2,"defaultH":4},"components":{"cap":[{"asset":"map.pipe.vertical.mouth.left","x":0},{"asset":"map.pipe.vertical.mouth.right","x":1}],"body":[{"asset":"map.pipe.vertical.body.left","x":0},{"asset":"map.pipe.vertical.body.right","x":1}]},"ascii":None,"authoringBinding":{"noun":"pipe","path":"resourceScenery.pipes","defaults":{"direction":"up","solid":True,"global":True,"travel":False}}},
      "cannon.vertical":{"id":"cannon.vertical","authoringGroup":"world","defaultSceneLayer":"world","name":"Vertical cannon stack","category":"system","type":"fixed","dimensions":{"cell":16},"components":{"parts":[{"asset":"map.cannon.vertical.muzzle","x":0,"y":0},{"asset":"map.cannon.vertical.neck","x":0,"y":1},{"asset":"map.cannon.vertical.body","x":0,"y":2}]},"ascii":None},
      "ladder.vertical":{"id":"ladder.vertical","authoringGroup":"world","defaultSceneLayer":"world","name":"Ladder strip","category":"system","type":"resizable","dimensions":{"cell":16,"minW":1,"maxW":1,"defaultW":1,"minH":2,"defaultH":5},"components":{"cap":[{"asset":"map.ladder.top","x":0}],"body":[{"asset":"map.ladder.body","x":0}]},"ascii":None,"authoringBinding":{"noun":"climbZone","path":"resourceScenery.sprites","defaults":{"kind":"ladder","climbable":True,"collision":{"kind":"climb"},"alpha":0}}}
      ,"bush.span":{"id":"bush.span","name":"Bush","authoringGroup":"deco","defaultSceneLayer":"background","category":"decor","type":"span","dimensions":{"cell":16,"minW":2,"defaultW":3},"components":{"left":"map.bush.left","middle":"map.bush.middle","right":"map.bush.right"},"ascii":None}
      ,"mushroom.platform":{"id":"mushroom.platform","authoringGroup":"world","defaultSceneLayer":"world","name":"Mushroom Platform","category":"terrain","type":"parametric","dimensions":{"cell":16,"minW":3,"defaultW":3,"minH":2,"defaultH":3},"components":{"cap":{"left":"map.mushroom_platform.cap.left","middle":"map.mushroom_platform.cap.middle","right":"map.mushroom_platform.cap.right"},"stem":{"left":"map.mushroom_platform.stem.left","middle":"map.mushroom_platform.stem.middle","right":"map.mushroom_platform.stem.right"}},"ascii":None}
    }}


def make_theme(src: Path) -> tuple[dict, dict]:
    tiles = src / "tiles.dat"
    if not tiles.is_file(): raise FileNotFoundError("missing required file: tiles.dat")
    behavior = tiles.read_bytes()
    if len(behavior) != 256: raise ValueError(f"tiles.dat must be exactly 256 bytes; got {len(behavior)}")
    entries, metadata = semantic_entries(src, behavior)
    images, catalog, collisions = {}, {}, {}
    source_index = defaultdict(list)
    animations = defaultdict(list)
    map_tiles = []
    for e in entries:
        asset = e["asset"]
        source_index[e["file"]].append({"index":e["index"],"x":e["x"],"y":e["y"],"asset":asset,"emptyVisual":e["empty"]})
        if e["sheet"] == "map":
            collision, projection = collision_projection(e["behavior_byte"])
            map_tiles.append({"index":e["index"],"hex":f"{e['index']:02X}","asset":asset,
                "emptyVisual":e["empty"],"behaviorByte":e["behavior_byte"],"behaviorHex":e["behavior_hex"],
                "behaviorFlags":e["behavior_flags"],"llmarioCollision":collision,"projection":projection})
        if not asset: continue
        images[asset] = png_data_url(e["image"])
        catalog[asset] = {"category":CATEGORY[e["sheet"]],"authoringGroup":"deco" if e["file"] == "bgsheet.png" else "world","scope":"theme","sourceSheet":e["file"],
            "sourceIndex":e["index"],"sourceCell":{"x":e["x"],"y":e["y"]},
            "defaultSize":{"w":e["cell_width"],"h":e["cell_height"]},"emptyVisual":False,
            "semanticRoles":e["roles"]}
        if e["file"] == "bgsheet.png":
            catalog[asset].update({"defaultSceneLayer":"background","paletteExposure":"relationshipOnly","decoRelationship":"unresolved"})
        if e["sheet"] == "map":
            collision, projection = collision_projection(e["behavior_byte"])
            collisions[asset] = {"defaultSize":{"w":16,"h":16},"collision":collision,"verified":True,
                "source":"MarioAI tiles.dat","projection":projection,"marioAI":{"tileIndex":e["index"],
                "tileHex":f"{e['index']:02X}","behaviorByte":e["behavior_byte"],"behaviorHex":e["behavior_hex"],
                **decode_behavior(e["behavior_byte"])}}
        for role in e["roles"]:
            if "animation" in role:
                animations[role["animation"]].append({"asset":asset,"frame":role.get("frame"),
                    "sheet":e["sheet"],"sourceIndex":e["index"]})
    for frames in animations.values(): frames.sort(key=lambda x:(str(x["frame"]),x["sheet"],x["sourceIndex"]))
    license_text = (src/"LICENSE").read_text(encoding="utf-8",errors="replace") if (src/"LICENSE").is_file() else None
    resource={"id":"medovina_marioai_resources","title":"MarioAI resource sheets","source":"medovina/MarioAI","url":"https://github.com/medovina/MarioAI","sourceFiles":list(THEME_SHEETS)+["tiles.dat"],"copyright":"Copyright (c) 2009-2015, Sergey Karakovskiy, Julian Togelius and Jakub Gemrot; all rights reserved.","license":"MarioAI BSD-style license; retain copyright, conditions, and disclaimer."}
    if license_text: resource["licenseText"]=license_text
    theme={"format":"llmario-theme-pack-v1","themeVersion":1,"id":"marioai-semantic-nonempty","title":"MarioAI Complete Nonempty Reference Theme","engineContract":"llmario-theme-pack-v1+marioai-semantics-v1",
      "source":{"repository":"https://github.com/medovina/MarioAI","resourcePath":"src/engine/resources","converter":"marioai_to_llmtheme.py","semanticCompiler":"compile_marioai_semantics.py","notes":["Only visually non-empty cells are embedded as image assets.","Canonical names and semantic metadata are owned by the semantic compiler.","All map behavior bytes remain preserved even when a tile has no visual asset."]},
      "resources":[resource],"sceneLayers":["background","world","actors","foreground"],"assets":{"images":images},"assetCatalog":catalog,"animationGroups":dict(sorted(animations.items())),
      "collisionTruth":{"source":"MarioAI tiles.dat","tileSize":16,"assets":collisions},"sourceIndex":dict(source_index),
      "marioAI":{"tileSize":16,"mapTiles":map_tiles,"autotile":metadata["autotile"],"sheets":metadata["sheets"]},
      "summary":{"themeSourceCells":len(entries),"themeNonEmptyAssets":len(images),"themeEmptyCellsDiscarded":len(entries)-len(images),"embeddedImageAssets":len(images),"animationGroupCount":len(animations),"includeUIFont":False},
      "recipes":{"platforms":{},"blocks":{}},"defaults":{"hud":{},"messages":{"welcome":["MarioAI-derived theme loaded."],"win":"Clear!"},"audio":{},"placement":{"grid":16}},"constructionCatalog":construction_catalog()}
    manifest={"format":"marioai-tile-manifest-v1","tileSize":16,"source":"medovina/MarioAI src/engine/resources","tiles":map_tiles}
    return theme, manifest


def main() -> int:
    parser=argparse.ArgumentParser(); parser.add_argument("source_dir",nargs="?",default="."); parser.add_argument("-o","--output",default="theme_marioai.llmtheme.txt"); parser.add_argument("--manifest",default="marioai_tile_manifest.json")
    args=parser.parse_args(); src=Path(args.source_dir).expanduser().resolve()
    try: theme,manifest=make_theme(src)
    except Exception as exc: print(f"ERROR: {exc}",file=sys.stderr); return 1
    out=Path(args.output); out=out if out.is_absolute() else src/out
    mout=Path(args.manifest); mout=mout if mout.is_absolute() else src/mout
    out.write_text(json.dumps(theme,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    mout.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(f"wrote {out}\nwrote {mout}\ntheme images: {len(theme['assets']['images'])}\nmapsheet nonempty: {sum(v['sourceSheet']=='mapsheet.png' for v in theme['assetCatalog'].values())}")
    return 0
if __name__ == "__main__": raise SystemExit(main())
