# Moonforge Garden replacement theme

Moonforge Garden is an original platformer art set built to the resource contract
of `theme_marioai.llmtheme.txt`. The reference was used only to identify resource
counts, cell dimensions, transparency, and broad semantic roles. No reference
pixels are copied into this directory.

## Art direction

The set depicts a moonlit clockwork conservatory. Moss-draped slate, warm brass,
coral glass, cyan crystal, and deep indigo unify the five source-sheet families.
Its silhouettes are designed for tiny gameplay sizes: terrain has a bright organic
lip over a dark structural body; distant scenery layers luminous skies over muted
mountains and foundry towers; enemies use large wings, shells, or hoods; rewards
and particles reserve the brightest values.

## Inventory interpretation

The theme pack exposes 784 addressable image resources in `assetCatalog`. They are
cells from five sheets rather than 784 named source files. For reviewability, every
cell is represented as a standalone file while retaining its source sheet and index:

| Family | Cell size | Count | Interpretation |
| --- | ---: | ---: | --- |
| `mapsheet` | 16×16 | 256 | 69 terrain and 187 scenery cells |
| `bgsheet` | 32×32 | 80 | parallax/background cells |
| `enemysheet` | 16×32 | 128 | enemy silhouettes and animation-frame slots |
| `itemsheet` | 16×16 | 256 | collectible/item slots |
| `particlesheet` | 8×8 | 64 | sparks, motes, leaves, and bubbles |

The reference marks 546 cells as visually empty. Those slots remain deliberately
transparent so sheet indexing and frame layout do not change. The remaining 238
cells contain original Moonforge Garden art. `theme_manifest.json` records every
cell's original sheet/index address, size, family, replacement paths, transparency,
and completion state.

## Directory layout

* `replacement_svg/<sheet>/` contains editable SVG source, one file per contract cell.
* `replacement_png/<sheet>/` is the default location for locally generated runtime
  PNG exports. It is intentionally absent from this source-only deliverable.
* `build_replacement_theme.py` reproducibly rebuilds SVG sources and the initial manifest.
* `export_theme.py` parses those SVGs and rasterizes them through the system Cairo library.
* `theme_manifest.json` is the machine-readable coverage ledger.

## Rebuild and export

Run from the repository root:

```sh
python3 theme_work/build_replacement_theme.py
python3 theme_work/export_theme.py --force --output-dir /path/to/exported-png
```

The builder writes the manifest before generating assets and checkpoints it every
32 resources. Exporting requires `libcairo.so.2`, but no third-party Python package,
browser, or network access. Cairo writes PNGs directly at each resource's contract
dimensions. The exporter does not modify the source manifest, and `--output-dir`
allows all binary output to remain outside this repository. If omitted, the output
directory defaults to the untracked `theme_work/replacement_png/` path.

To persist only a fresh inventory before starting an interrupted art pass:

```sh
python3 theme_work/build_replacement_theme.py --inventory-only
```

Do not run that inventory-only command over a completed manifest unless you intend
to reset its statuses; the SVG and PNG assets themselves are not deleted.

## Completeness

All 784 SVG source resources are complete: 238 illustrated replacements and 546
intentional transparent placeholders matching empty reference slots. No assets are
currently listed as ambiguous or incomplete. Raster PNGs are intentionally not
included; they are produced downstream with `export_theme.py`.
