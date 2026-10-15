# LLMario ASCII v3

A text sketch of a reference editor map (`llmario-reference-editor-map` v1). One glyph per
16px cell, with each object drawn at its true footprint, plus a few directives for whatever
a glyph can't say. People and language models can both read it and write it.

The codec lives in `editor/reference_pack_editor.html` (`<script id="llmarioAscii">`,
`window.LLMarioAscii`). The editor's **ASCII sketch** panel and `scripts/llmario_ascii.js`
both use that same code.

```
node scripts/llmario_ascii.js to-map sketch.txt -o maps/new_level.llmmap.txt
node scripts/llmario_ascii.js to-ascii maps/breakout_caves.llmmap.txt
node scripts/reachability_report.js maps/new_level.llmmap.txt   # is it beatable?
```

v1/v2 (the archived editor's 21px construction-catalog sketches) are a different format,
and v3 refuses them with a pointer to the archive. The v2 ideas carried over: pipe
lettering by mouth position, `@pipe A -> B` / `A <-> B` topology, a visible grid that is
authoritative, and per-object properties kept on directive lines.

## Example

```
@llmario-ascii 3
@cell 16

........................................ooo.........
.......................................=====........
..........?M?.......................................
....................====..................PP........
.S........g...................s....PP.....pp....G...
XXXXXXXXXXXXXXXXXXXXXX....XXXXXXXXXpp.....pp...XXXXX
XXXXXXXXXXXXXXXXXXXXXX....XXXXXXXXXXX..XXXXXXXXXXXXX

@pipe A -> B
@at 11,2 rewardBlock.uses=3
@at 39,1 movingPlatform.range=40 movingPlatform.speed=1
@place arrowSign 33 5
```

`tests/fixtures/ascii_sample.llmascii.txt` is a complete, tested sketch.

## Grid glyphs

| Glyph | Object | Shape rule |
|---|---|---|
| `.` | empty | |
| `X` `C` `U` | ground: overground / castle / underground | merged into maximal rectangles, row-major |
| `#` `%` `&` | solid block: stone / wood / glassBlue | one cell each |
| `B` | brick | one cell |
| `?` `M` `F` `L` `1` | question block: coin / growMushroom / fireFlower / raccoonFeather (leaf) / lifeMushroom | one cell |
| `r` `h` | rotating block, hidden/revealed block | one cell |
| `=` | white platform | horizontal run → `extent.width` |
| `m` | mushroom platform | rectangle → `extent.width × extent.height` |
| `H` | ladder | vertical run → `extent.length` |
| `PP` + `pp` | pipe mouth + body, always 2 cells thick | body below = up, above = down, mouth on the left = left, mouth on the right = right; length = mouth + body cells |
| `V` | vertical cannon | feet cell |
| `o` | coin | one cell |
| `g` `w` `k` `K` `s` | goomba, wave goomba, green koopa, red koopa, spiky (facing left) | **feet cell**. The sprite stands on the cell below. |
| `S` `G` | start / goal marker | feet cell. Keep one cell clear of the world's side and bottom edges. |

Enemies are 2 cells tall but drawn only at their feet, so `g` directly above an `X`
stands on that ground.

## Directives

* `@llmario-ascii 3`: required, before the grid.
* `@cell 16`: optional, and only 16 is accepted.
* `@origin X Y`: world pixel position of the grid's top-left corner (default `0 0`).
* `@world X Y W H` or `@world W H`: map area. The default is the grid's size at the origin.
* `@pipe A -> B`, `@pipe A <-> B`, `@pipe A -> COL,ROW`: pipe travel. Pipes are lettered
  `A, B, … Z, AA, …` by mouth column, then mouth row. A point destination is in cell units,
  and fractions are allowed.
* `@at COL,ROW key=value …`: sets parameters on the glyph object covering that cell, such as
  `walker.direction=right`, `walker.patrolRange=48`, `rewardBlock.uses=3`,
  `movingPlatform.path=[{"x":0,"y":0},{"x":64,"y":0}]`, or `layer=foreground`. `dx=`/`dy=`
  shift the object by pixels (see the lattice note below).
* `@place PLACEABLE COL ROW key=value …`: adds any placeable at its own anchor, in cell units.
  For most objects that's the bottom-centre; for pipes it's the centre of the base. This is
  how decorations and anything off-grid travel. Special keys: `layer=`, and `id=` for pipe
  targets.
* `@start COL ROW` / `@goal COL ROW`: markers that sit off the cell lattice.
* `@note …`, `@legend …`: ignored.

Values are JSON when they parse as JSON, and plain words otherwise. Spaces inside a value
must be JSON-escaped (` `). Errors name the line, or the column and row.

## Round trip and the half-cell lattice

`mapToAscii` is lossless. Every repository map converts to ASCII and back with the same
objects, values, layers, markers, bounds and pipe wiring (`tests/llmario_ascii.test.js`).
Anything a glyph can't represent exactly becomes an `@place` line. Nothing is dropped
silently.

The editor snaps an object's **anchor** (`transform.x`) to 16px, not its footprint. So
1-wide objects (blocks, coins, enemies) sit half a cell off from 2-wide ones (ground of
even width, pipes). Export picks the lattice phase that draws the most objects (`@origin`
gets a −8 offset when that helps) and tags the minority with `@at … dx=8`. Sketches written
by hand don't need this: their footprints all land flush on one lattice. But an editor
drag will re-snap an odd-width object's anchor and move it half a cell.

## Writing a level (notes for people and models)

* Draw the walkable silhouette first (`X` rows), then gaps, then platforms, then things.
  Keep gaps honest. Measured with the engine's own physics on flat ground: a walking jump
  clears up to 9 empty cells, a running jump 14, and a full jump lands on a ledge 8 cells
  up. 15+ cells across or 9+ up needs flight or another route.
* Run `scripts/reachability_report.js` on the result. Then decide whether each pocket and
  each unreachable surface is a design choice or a bug.
