#!/usr/bin/env python3
"""
Compile a source-backed semantic inventory for medovina/MarioAI resources.

Names/roles are derived from how MarioAI's source indexes the sheets where
source usage is known. Visually unambiguous mapsheet art also receives curated
structural names. Every remaining cell keeps a stable coordinate fallback so
nothing can disappear from the inventory.

Expected directory (downloaded from src/engine/resources):
    mapsheet.png
    bgsheet.png
    enemysheet.png
    itemsheet.png
    particlesheet.png
    mariosheet.png
    smallmariosheet.png
    firemariosheet.png
    racoonmariosheet.png
    princess.png
    font.gif                 optional for theme work, inventoried as UI
    logo.gif                 optional for theme work, inventoried as UI
    endscene.gif             optional for theme work, inventoried as UI
    tiles.dat
    test.lvl                 optional metadata/reference level

Outputs:
    marioai_semantics/
        semantic_manifest.json
        *_contact.png

Source facts used by this compiler:
  Art.java
    mario/fire/racoon/princess: 32x32 cells
    smallMario/items/level:     16x16 cells
    enemies:                    16x32 cells
    particles/font:             8x8 cells
    bg:                         32x32 cells

  Mario.java calcPic():
    large/racoon frame indices:
      0,1,2 walking/idle; 3,4,5 fast run; 6 jump; 7 fast jump;
      9 skid; 10,11,12 carry; 14 duck.
    small frame indices:
      0,1 walking/idle; 2,3 fast run; 4 jump; 5 fast jump;
      7 skid; 8,9 carry.

  Enemy.java / FlowerEnemy.java / Shell.java / BulletBill.java:
    enemy rows:
      0 red koopa, 1 green koopa, 2 goomba, 3 spiky,
      4 wing overlay, 5 bullet bill, 6 flower enemy, 7 wave goomba.
    x 0/1 are walking/flap frames where applicable.
    shell frames use x 3..6 on koopa rows.
    flower enemy uses x 0..3.

  Mushroom.java / FireFlower.java / GreenMushroom.java:
    items row 0:
      x0 mushroom, x1 fire flower, x2 green mushroom.

  Fireball.java / Sparkle.java / Particle.java:
    particles row 3 x0..3: fireball animation.
    row 1 is general sparkle usage, row 2 pickup sparkle usage.
    row 0 x0/x1 are also used as generic debris/static particles.

  TileGeneralizer.java / LevelGenerator.java / LevelRenderer.java:
    known map logical tile IDs, animated groups, pipe/cannon pieces,
    and exact blockify/autotile lookup rules.

The semantic manifest is deliberately neutral enough to become an LLMario
theme-completeness template later.  It records MarioAI names as provenance,
while `contract_role` is the franchise-neutral role to replace with original art.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


SHEETS = {
    # filename: (sheet_id, cell_w, cell_h, scope)
    "mapsheet.png":        ("map",          16, 16, "theme"),
    "bgsheet.png":         ("background",   32, 32, "theme"),
    "enemysheet.png":      ("enemy",        16, 32, "theme"),
    "itemsheet.png":       ("item",         16, 16, "theme"),
    "particlesheet.png":   ("particle",      8,  8, "theme"),
    "mariosheet.png":      ("player_large", 32, 32, "theme"),
    "smallmariosheet.png": ("player_small", 16, 16, "theme"),
    "firemariosheet.png":  ("player_fire",  32, 32, "theme"),
    # In this MarioAI fork this sheet is selected while carrying a shell.
    "racoonmariosheet.png":("player_carry", 32, 32, "theme"),
    "princess.png":        ("goal_actor",    32, 32, "theme"),
    "font.gif":            ("font",           8,  8, "engine_ui"),
}

WHOLE_IMAGES = {
    "logo.gif": "engine_ui",
    "endscene.gif": "engine_ui",
}

BITS = [
    ("BLOCK_UPPER", 1 << 0),
    ("BLOCK_ALL",   1 << 1),
    ("BLOCK_LOWER", 1 << 2),
    ("SPECIAL",     1 << 3),
    ("BUMPABLE",    1 << 4),
    ("BREAKABLE",   1 << 5),
    ("PICKUPABLE",  1 << 6),
    ("ANIMATED",    1 << 7),
]


def behavior_flags(v: int) -> list[str]:
    return [name for name, bit in BITS if v & bit]


def add_role(entry: dict, source_name: str, contract_role: str, **extra):
    role = {
        "source_name": source_name,
        "contract_role": contract_role,
    }
    role.update(extra)
    if role not in entry["roles"]:
        entry["roles"].append(role)


def player_role(sheet: str, x: int, y: int) -> tuple[str, str] | None:
    if y != 0:
        return None

    family = {
        "player_large": "player.normal",
        "player_fire":  "player.powered",
        "player_carry": "player.carrying",
        "player_small": "player.small",
    }[sheet]

    if sheet == "player_small":
        mapping = {
            0: ("idle_walk_0", "player.motion.idle_walk_0"),
            1: ("walk_1",      "player.motion.walk_1"),
            2: ("fast_run_0",  "player.motion.fast_run_0"),
            3: ("fast_run_1",  "player.motion.fast_run_1"),
            4: ("jump",        "player.motion.jump"),
            5: ("fast_jump",   "player.motion.fast_jump"),
            7: ("skid",        "player.motion.skid"),
            8: ("carry_0",     "player.motion.carry_0"),
            9: ("carry_1_jump","player.motion.carry_1_or_jump"),
        }
    else:
        mapping = {
            0:  ("idle_walk_0", "player.motion.idle_walk_0"),
            1:  ("walk_1",      "player.motion.walk_1"),
            2:  ("walk_2",      "player.motion.walk_2"),
            3:  ("fast_run_0",  "player.motion.fast_run_0"),
            4:  ("fast_run_1",  "player.motion.fast_run_1"),
            5:  ("fast_run_2",  "player.motion.fast_run_2"),
            6:  ("jump",        "player.motion.jump"),
            7:  ("fast_jump",   "player.motion.fast_jump"),
            9:  ("skid",        "player.motion.skid"),
            10: ("carry_0",     "player.motion.carry_0"),
            11: ("carry_1",     "player.motion.carry_1"),
            12: ("carry_2_jump","player.motion.carry_2_or_jump"),
            14: ("duck",        "player.motion.duck"),
        }

    if x not in mapping:
        return None
    src, role = mapping[x]
    return f"{family}.{src}", role


def apply_enemy_roles(entry: dict, x: int, y: int):
    row = {
        0: ("red_koopa",   "enemy.walker.armored.red"),
        1: ("green_koopa", "enemy.walker.armored.green"),
        2: ("goomba",      "enemy.walker.basic"),
        3: ("spiky",       "enemy.walker.spiked"),
        4: ("wing",        "enemy.overlay.wing"),
        5: ("bullet_bill", "enemy.projectile.horizontal"),
        6: ("flower",      "enemy.hazard.emerging"),
        7: ("wave_goomba", "enemy.flyer.wave"),
    }.get(y)

    if row is None:
        return

    src, contract = row

    if y in (0, 1, 2, 3, 7) and x in (0, 1):
        add_role(entry, f"enemy.{src}.walk_{x}", f"{contract}.frame_{x}",
                 animation=f"enemy.{src}.walk", frame=x)

    if y in (0, 1) and 3 <= x <= 6:
        n = x - 3
        add_role(entry, f"enemy.{src}.shell_{n}", f"{contract}.shell.frame_{n}",
                 animation=f"enemy.{src}.shell", frame=n)

    if y == 4 and x in (0, 1):
        add_role(entry, f"enemy.wing.flap_{x}", f"{contract}.frame_{x}",
                 animation="enemy.wing.flap", frame=x)

    if y == 5 and x == 0:
        add_role(entry, "enemy.bullet_bill", contract)

    if y == 6 and 0 <= x <= 3:
        # FlowerEnemy.java cycles 0..3 with:
        # ((tick/2)&1)*2 + ((tick/6)&1)
        add_role(entry, f"enemy.flower.frame_{x}", f"{contract}.frame_{x}",
                 animation="enemy.flower", frame=x)


def apply_item_roles(entry: dict, x: int, y: int):
    if y != 0:
        return
    mapping = {
        0: ("item.mushroom",       "pickup.powerup.grow"),
        1: ("item.fire_flower",     "pickup.powerup.projectile"),
        2: ("item.green_mushroom",  "pickup.special.green"),
    }
    if x in mapping:
        src, role = mapping[x]
        add_role(entry, src, role)


def apply_particle_roles(entry: dict, x: int, y: int):
    if y == 0 and x in (0, 1):
        add_role(entry, f"particle.debris_{x}", f"effect.debris.variant_{x}")

    if y in (0, 1, 2):
        # Sparkle animation uses start..start+4 and x7 while life > 10.
        # Row 1 is used broadly for deaths/skids/fireball impact.
        # Row 2 is used when collecting map coins.
        if 0 <= x <= 4 or x == 7:
            group = {0: "default", 1: "general", 2: "pickup"}[y]
            frame = "lead" if x == 7 else x
            add_role(
                entry,
                f"particle.sparkle.{group}.{frame}",
                f"effect.sparkle.{group}.frame_{frame}",
                animation=f"effect.sparkle.{group}",
                frame=frame,
            )

    if y == 3 and 0 <= x <= 3:
        add_role(entry, f"particle.fireball.frame_{x}",
                 f"projectile.fireball.frame_{x}",
                 animation="projectile.fireball", frame=x)


def apply_goal_roles(entry: dict, x: int, y: int):
    if y == 0 and x in (0, 1):
        add_role(entry, f"goal.princess.frame_{x}",
                 f"goal.actor.frame_{x}",
                 animation="goal.actor.idle", frame=x)


def map_logical_roles() -> dict[int, list[tuple[str, str]]]:
    """Logical tile IDs from TileGeneralizer.java / LevelGenerator.java."""
    out: dict[int, list[tuple[str, str]]] = defaultdict(list)

    def r(i, src, role):
        out[i].append((src, role))

    r(0,   "tile.empty",                     "tile.empty")
    r(1,   "tile.hidden_block",              "block.hidden")
    r(4,   "tile.hidden_block_revealed",     "block.hidden.revealed")

    r(10,  "pipe.vertical.mouth_left",        "pipe.vertical.mouth.left")
    r(11,  "pipe.vertical.mouth_right",       "pipe.vertical.mouth.right")
    r(26,  "pipe.vertical.body_left",         "pipe.vertical.body.left")
    r(27,  "pipe.vertical.body_right",        "pipe.vertical.body.right")

    r(14,  "cannon.muzzle",                   "cannon.vertical.muzzle")
    r(30,  "cannon.barrel_base",              "cannon.vertical.neck")
    r(46,  "cannon.trunk",                    "cannon.vertical.body")

    r(16,  "brick.breakable",                 "block.breakable")
    r(17,  "brick.breakable_hidden_coin",     "block.breakable.coin")
    r(18,  "brick.breakable_hidden_powerup",  "block.breakable.powerup")

    r(21,  "question.coin",                   "block.question.coin")
    r(22,  "question.powerup",                "block.question.powerup")
    r(23,  "question.multicoin",              "block.question.multicoin")

    r(34,  "coin.map_pickup",                 "pickup.coin")

    r(61,  "ladder.body",                     "ladder.body")
    r(93,  "ladder.top",                      "ladder.top")
    r(255, "goal.marker",                     "goal.marker")

    # TileGeneralizer calls 15 a sparkle/irrelevant tile.
    r(15,  "tile.sparkle_marker",             "effect.map_marker")

    # Visually unambiguous mapsheet components. These names describe visible
    # structure only; they do not invent gameplay behavior beyond source truth.
    r(5,   "visual.block.brown_face.variant_1",              "block.brown_face.variant_1")
    r(6,   "visual.block.brown_face.variant_2",              "block.brown_face.variant_2")
    r(7,   "visual.block.brown_face.variant_3",              "block.brown_face.variant_3")
    r(9,   "visual.block.stone",                             "block.stone")
    r(12,  "visual.block.wood",                              "block.wood")
    r(19,  "visual.block.brick_solid",                       "block.brick_solid")
    r(24,  "visual.pipe.narrow.vertical.top",                "pipe.narrow.vertical.top")
    r(25,  "visual.log_column.cap",                          "log_column.cap")
    r(28,  "visual.block.glass_blue",                        "block.glass_blue")
    r(36,  "visual.block.yellow_face",                       "block.yellow_face")
    r(37,  "visual.platform.yellow_striped",                 "platform.yellow_striped")
    r(38,  "visual.platform.yellow_face",                    "platform.yellow_face")
    r(39,  "visual.platform.thin_brown",                     "platform.thin_brown")
    r(40,  "visual.pipe.narrow.vertical.body",               "pipe.narrow.vertical.body")
    r(41,  "visual.log_column.body_upper",                   "log_column.body_upper")
    r(56,  "visual.pipe.narrow.vertical.bottom",             "pipe.narrow.vertical.bottom")
    r(57,  "visual.log_column.body_lower",                   "log_column.body_lower")
    r(60,  "visual.platform.white.rounded_end_cap",           "platform.white.rounded_end_cap")

    r(67,  "visual.sign.arrow_right.top_left",               "sign.arrow_right.top_left")
    r(68,  "visual.sign.arrow_right.top_right",              "sign.arrow_right.top_right")
    r(83,  "visual.sign.arrow_right.bottom_left",            "sign.arrow_right.bottom_left")
    r(84,  "visual.sign.arrow_right.bottom_right",           "sign.arrow_right.bottom_right")

    r(70,  "visual.hill.large.top_left",                     "hill.large.top_left")
    r(71,  "visual.hill.large.top_right",                    "hill.large.top_right")
    r(86,  "visual.hill.large.upper_left",                   "hill.large.upper_left")
    r(87,  "visual.hill.large.upper_right",                  "hill.large.upper_right")
    r(102, "visual.hill.large.lower_left",                   "hill.large.lower_left")
    r(103, "visual.hill.large.lower_right",                  "hill.large.lower_right")
    r(118, "visual.hill.large.bottom_left",                  "hill.large.bottom_left")
    r(119, "visual.hill.large.bottom_right",                 "hill.large.bottom_right")

    r(73,  "visual.hill.wide.top_left",                      "hill.wide.top_left")
    r(74,  "visual.hill.wide.top_middle",                    "hill.wide.top_middle")
    r(75,  "visual.hill.wide.top_right",                     "hill.wide.top_right")
    r(89,  "visual.hill.wide.middle_left",                   "hill.wide.middle_left")
    r(90,  "visual.hill.wide.middle",                        "hill.wide.middle")
    r(91,  "visual.hill.wide.middle_right",                  "hill.wide.middle_right")
    r(104, "visual.hill.wide.lower_left",                    "hill.wide.lower_left")
    r(105, "visual.hill.wide.lower_right",                   "hill.wide.lower_right")
    r(120, "visual.hill.wide.bottom_left",                   "hill.wide.bottom_left")
    r(121, "visual.hill.wide.bottom_right",                  "hill.wide.bottom_right")

    r(76,  "visual.pillar_glass.light.top",                  "pillar_glass.light.top")
    r(77,  "visual.pillar_glass.dark.top",                   "pillar_glass.dark.top")
    r(92,  "visual.pillar_glass.light.body",                 "pillar_glass.light.body")

    r(80,  "visual.foliage_canopy.left",                     "foliage_canopy.left")
    r(81,  "visual.foliage_canopy.middle",                   "foliage_canopy.middle")
    r(82,  "visual.foliage_canopy.right",                    "foliage_canopy.right")
    r(96,  "visual.bush.left",                               "bush.left")
    r(97,  "visual.bush.middle",                             "bush.middle")
    r(98,  "visual.bush.right",                              "bush.right")

    r(132, "visual.terrain.overground.grass_top.left",       "terrain.overground.grass_top.left")
    r(133, "visual.terrain.overground.grass_top.middle",     "terrain.overground.grass_top.middle")
    r(134, "visual.terrain.overground.grass_top.right",      "terrain.overground.grass_top.right")
    r(135, "visual.terrain.overground.rounded_corner.top_left",
           "terrain.overground.rounded_corner.top_left")
    r(148, "visual.terrain.overground.dirt_fill.variant_0",  "terrain.overground.dirt_fill.variant_0")
    r(149, "visual.terrain.overground.dirt_fill.variant_1",  "terrain.overground.dirt_fill.variant_1")
    r(150, "visual.terrain.overground.dirt_fill.variant_2",  "terrain.overground.dirt_fill.variant_2")
    r(151, "visual.terrain.overground.rounded_corner.top_right",
           "terrain.overground.rounded_corner.top_right")
    r(164, "visual.terrain.overground.dirt_fill.variant_3",  "terrain.overground.dirt_fill.variant_3")
    r(165, "visual.terrain.overground.dirt_fill.variant_4",  "terrain.overground.dirt_fill.variant_4")
    r(166, "visual.terrain.overground.dirt_fill.variant_5",  "terrain.overground.dirt_fill.variant_5")
    r(167, "visual.terrain.overground.rounded_corner.bottom_right",
           "terrain.overground.rounded_corner.bottom_right")
    r(176, "visual.terrain.overground.grass_edge.curved_left",
           "terrain.overground.grass_edge.curved_left")
    r(177, "visual.terrain.overground.grass_edge.curved_middle",
           "terrain.overground.grass_edge.curved_middle")
    r(178, "visual.terrain.overground.grass_edge.curved_right",
           "terrain.overground.grass_edge.curved_right")
    r(180, "visual.terrain.overground.grass_top.alt_left",   "terrain.overground.grass_top.alt_left")
    r(181, "visual.terrain.overground.grass_top.alt_middle", "terrain.overground.grass_top.alt_middle")
    r(182, "visual.terrain.overground.grass_top.alt_right",  "terrain.overground.grass_top.alt_right")
    r(183, "visual.terrain.overground.rounded_corner.bottom_left",
           "terrain.overground.rounded_corner.bottom_left")

    r(224, "visual.mushroom_platform.cap.left",              "mushroom_platform.cap.left")
    r(225, "visual.mushroom_platform.cap.middle",            "mushroom_platform.cap.middle")
    r(226, "visual.mushroom_platform.cap.right",             "mushroom_platform.cap.right")
    r(240, "visual.mushroom_platform.stem.left",             "mushroom_platform.stem.left")
    r(241, "visual.mushroom_platform.stem.middle",           "mushroom_platform.stem.middle")
    r(242, "visual.mushroom_platform.stem.right",            "mushroom_platform.stem.right")

    return out


def map_visual_animation_roles() -> dict[int, list[tuple[str, str, str, int]]]:
    """
    LevelRenderer groups animated map cells in runs of four horizontally.
    These are the known visual frame groups used by logical question/coin tiles.
    """
    out = defaultdict(list)

    # row 1, x 4..7 => IDs 20..23
    for frame, idx in enumerate(range(20, 24)):
        out[idx].append((
            f"block.question.visual_frame_{frame}",
            f"block.question.visual.frame_{frame}",
            "block.question.visual",
            frame,
        ))

    # row 2, x 0..3 => IDs 32..35
    for frame, idx in enumerate(range(32, 36)):
        out[idx].append((
            f"coin.visual_frame_{frame}",
            f"pickup.coin.visual.frame_{frame}",
            "pickup.coin.visual",
            frame,
        ))
    return out


def blockify_tile(mask: int, to: int) -> int | None:
    """
    Exact port of LevelGenerator.blockify() decision tree.

    mask bits:
      bit0 = b[0][0] top-left
      bit1 = b[1][0] top-right
      bit2 = b[0][1] bottom-left
      bit3 = b[1][1] bottom-right

    Returns None for the all-false case where MarioAI says KEEP OLD BLOCK.
    """
    tl = bool(mask & 1)
    tr = bool(mask & 2)
    bl = bool(mask & 4)
    br = bool(mask & 8)

    if tl == tr and bl == br:
        if tl == bl:
            if tl:
                return 1 + 9 * 16 + to
            return None
        return (1 + 10 * 16 + to) if tl else (1 + 8 * 16 + to)

    elif tl == bl and tr == br:
        return (2 + 9 * 16 + to) if tl else (0 + 9 * 16 + to)

    elif tl == br and bl == tr:
        return 1 + 9 * 16 + to

    elif tl == tr:
        if tl:
            return (3 + 10 * 16 + to) if bl else (3 + 11 * 16 + to)
        return (2 + 8 * 16 + to) if bl else (0 + 8 * 16 + to)

    elif bl == br:
        if bl:
            return (3 + 9 * 16 + to) if tl else (3 + 8 * 16 + to)
        return (2 + 10 * 16 + to) if tl else (0 + 10 * 16 + to)

    return 0 + 1 * 16 + to


def autotile_rules():
    styles = {
        "overground": 0,
        "castle": 8,
        "underground": 12,
    }
    result = {}
    reverse = defaultdict(list)

    for style, offset in styles.items():
        rules = {}
        for mask in range(16):
            idx = blockify_tile(mask, offset)
            rules[f"{mask:04b}"] = idx
            if idx is not None:
                reverse[idx].append((style, mask))
        result[style] = rules
    return result, reverse


def canonical_asset_name(sheet: str, x: int, y: int, idx: int, roles: list[dict]) -> str:
    """Return the stable public theme ID for one source cell.

    Contract roles stay neutral metadata. Public IDs retain the established
    source-family vocabulary consumed by the engine, while map IDs use the
    canonical structural names owned by this compiler.
    """
    if sheet == "map":
        name = roles[0]["contract_role"] if roles else f"cell_{idx:02x}"
        return f"map.{name}"

    public_prefix = {
        "background": "bg",
        "enemy": "enemy",
        "item": "item",
        "particle": "particle",
        "player_large": "mario",
        "player_small": "smallmario",
        "player_fire": "firemario",
        "player_carry": "racoonmario",
        "goal_actor": "princess",
        "font": "font",
    }[sheet]
    if roles:
        # Existing public IDs join the first two neutral role segments with a
        # hyphen: player.motion.* -> mario.player-motion.*, for example.
        role = roles[0]["contract_role"]
        head, separator, tail = role.partition(".")
        public_role = head + (("-" + tail) if separator else "")
        return f"{public_prefix}.{public_role}"

    family = sheet.replace("_", "-")
    return f"{public_prefix}.{family}-cell.x{x:02d}.y{y:02d}"


def fallback_name(sheet: str, x: int, y: int, idx: int) -> str:
    """Compatibility helper for callers constructing an unclassified entry."""
    return canonical_asset_name(sheet, x, y, idx, [])


def make_contact(entries: list[dict], image: Image.Image, cw: int, ch: int, output: Path):
    cols = image.width // cw
    rows = image.height // ch
    scale = 4
    boxw = max(cw * scale, 170)
    boxh = ch * scale + 46
    canvas = Image.new("RGBA", (cols * boxw, rows * boxh), (22, 22, 22, 255))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()

    by_xy = {(e["x"], e["y"]): e for e in entries}

    for y in range(rows):
        for x in range(cols):
            e = by_xy[(x, y)]
            crop = image.crop((x*cw, y*ch, (x+1)*cw, (y+1)*ch)).convert("RGBA")
            big = crop.resize((cw*scale, ch*scale), Image.Resampling.NEAREST)

            ox, oy = x * boxw, y * boxh
            canvas.alpha_composite(big, (ox + (boxw-big.width)//2, oy + 2))

            label1 = f"{e['index']:02X}" if e["sheet"] == "map" else f"{e['index']:03d}"
            label2 = e["canonical_name"]
            if len(label2) > 26:
                label2 = label2[:23] + "..."

            draw.text((ox+3, oy+ch*scale+4), label1, fill="white", font=font)
            draw.text((ox+3, oy+ch*scale+17), label2, fill=(215,215,215,255), font=font)

            if e.get("behavior_hex") is not None:
                fs = ",".join(e.get("behavior_flags", [])) or "-"
                draw.text(
                    (ox+3, oy+ch*scale+30),
                    f"{e['behavior_hex']} {fs[:22]}",
                    fill=(180,180,180,255), font=font
                )

    canvas.save(output)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source_dir", nargs="?", default=".")
    ap.add_argument("--no-contact-sheets", action="store_true")
    args = ap.parse_args()

    src = Path(args.source_dir).expanduser().resolve()
    outdir = src / "marioai_semantics"
    outdir.mkdir(exist_ok=True)

    tiles_dat = src / "tiles.dat"
    if not tiles_dat.is_file():
        raise SystemExit("missing tiles.dat")
    tile_behaviors = tiles_dat.read_bytes()
    if len(tile_behaviors) != 256:
        raise SystemExit(f"tiles.dat must be 256 bytes; got {len(tile_behaviors)}")

    logical = map_logical_roles()
    visual_anims = map_visual_animation_roles()
    autotiles, reverse_autotiles = autotile_rules()

    manifest = {
        "format": "llmario-reference-theme-semantics-v1",
        "source": {
            "repository": "https://github.com/medovina/MarioAI",
            "resource_path": "src/engine/resources",
            "notes": [
                "Canonical names come from source usage or curated visually unambiguous structure.",
                "Unclassified cells remain present with deterministic coordinate names.",
                "MarioAI-specific source names are provenance only; contract_role is the neutral replacement target for original artwork.",
            ],
        },
        "scope": {
            "theme": "world/player visual material suitable for a theme completeness contract",
            "engine_ui": "reference UI/branding material; not necessarily theme-owned in LLMario",
            "metadata": "non-image behavior/test data",
        },
        "autotile": {
            "mask_bit_order": ["top_left", "top_right", "bottom_left", "bottom_right"],
            "styles": autotiles,
        },
        "assets": [],
        "whole_images": [],
        "metadata_files": [],
        "animation_groups": defaultdict(list),
    }

    for filename, (sheet_id, cw, ch, scope) in SHEETS.items():
        p = src / filename
        if not p.is_file():
            # Full completeness inventory should say what's absent, not silently skip it.
            manifest["assets"].append({
                "file": filename,
                "sheet": sheet_id,
                "scope": scope,
                "missing_file": True,
            })
            continue

        im = Image.open(p).convert("RGBA")
        if im.width % cw or im.height % ch:
            raise SystemExit(
                f"{filename}: {im.width}x{im.height} is not divisible by {cw}x{ch}"
            )

        cols, rows = im.width // cw, im.height // ch
        entries = []

        for y in range(rows):
            for x in range(cols):
                idx = y * cols + x
                entry = {
                    "file": filename,
                    "sheet": sheet_id,
                    "scope": scope,
                    "index": idx,
                    "x": x,
                    "y": y,
                    "cell_width": cw,
                    "cell_height": ch,
                    "canonical_name": fallback_name(sheet_id, x, y, idx),
                    "roles": [],
                }

                if sheet_id == "map":
                    if idx < 256:
                        v = tile_behaviors[idx]
                        entry["behavior_byte"] = v
                        entry["behavior_hex"] = f"{v:02X}"
                        entry["behavior_flags"] = behavior_flags(v)

                    for src_name, contract_role in logical.get(idx, []):
                        add_role(entry, src_name, contract_role)

                    for src_name, contract_role, group, frame in visual_anims.get(idx, []):
                        add_role(entry, src_name, contract_role, animation=group, frame=frame)

                    for style, mask in reverse_autotiles.get(idx, []):
                        add_role(
                            entry,
                            f"terrain.{style}.mask_{mask:04b}",
                            f"terrain.autotile.{style}.mask_{mask:04b}",
                            autotile_style=style,
                            neighbor_mask=f"{mask:04b}",
                        )

                elif sheet_id.startswith("player_"):
                    pr = player_role(sheet_id, x, y)
                    if pr:
                        add_role(entry, pr[0], pr[1])

                elif sheet_id == "enemy":
                    apply_enemy_roles(entry, x, y)

                elif sheet_id == "item":
                    apply_item_roles(entry, x, y)

                elif sheet_id == "particle":
                    apply_particle_roles(entry, x, y)

                elif sheet_id == "goal_actor":
                    apply_goal_roles(entry, x, y)

                # Backgrounds and font deliberately retain coordinate-stable names.
                # Their generator/use context is sheet-level rather than a simple
                # one-cell/one-semantic-object relationship.

                entry["canonical_name"] = canonical_asset_name(
                    sheet_id, x, y, idx, entry["roles"]
                )

                for role in entry["roles"]:
                    if "animation" in role:
                        manifest["animation_groups"][role["animation"]].append({
                            "sheet": sheet_id,
                            "index": idx,
                            "x": x,
                            "y": y,
                            "frame": role.get("frame"),
                            "contract_role": role["contract_role"],
                        })

                entries.append(entry)
                manifest["assets"].append(entry)

        if not args.no_contact_sheets:
            make_contact(entries, im, cw, ch, outdir / f"{Path(filename).stem}_semantic_contact.png")

    for filename, scope in WHOLE_IMAGES.items():
        p = src / filename
        manifest["whole_images"].append({
            "file": filename,
            "scope": scope,
            "present": p.is_file(),
            "canonical_name": {
                "logo.gif": "ui.logo.reference",
                "endscene.gif": "ui.end_scene.reference",
            }[filename],
        })

    for filename, role in [
        ("tiles.dat", "metadata.tile_behaviors"),
        ("test.lvl", "metadata.reference_level"),
    ]:
        manifest["metadata_files"].append({
            "file": filename,
            "scope": "metadata",
            "present": (src / filename).is_file(),
            "canonical_name": role,
        })

    # Convert defaultdict before JSON.
    manifest["animation_groups"] = {
        k: sorted(v, key=lambda e: (str(e.get("frame")), e["sheet"], e["index"]))
        for k, v in sorted(manifest["animation_groups"].items())
    }

    # A compact completeness section: every source cell exists, even if the exact
    # visual semantics were not needed by MarioAI source.
    present_assets = [a for a in manifest["assets"] if not a.get("missing_file")]
    manifest["summary"] = {
        "cells_total": len(present_assets),
        "cells_with_source_backed_semantic_role": sum(bool(a.get("roles")) for a in present_assets),
        "cells_coordinate_named_only": sum(not bool(a.get("roles")) for a in present_assets),
        "theme_cells": sum(a.get("scope") == "theme" for a in present_assets),
        "engine_ui_cells": sum(a.get("scope") == "engine_ui" for a in present_assets),
        "animation_group_count": len(manifest["animation_groups"]),
    }

    out = outdir / "semantic_manifest.json"
    out.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(f"wrote {out}")
    print(json.dumps(manifest["summary"], indent=2))
    if not args.no_contact_sheets:
        print(f"contact sheets: {outdir}/*_semantic_contact.png")


if __name__ == "__main__":
    main()
