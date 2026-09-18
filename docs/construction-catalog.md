# Semantic construction catalog v1

`theme.constructionCatalog` is the single, versioned authoring vocabulary. Its
`families` entries have an `id`, editor `name`/`category`, a generic `type`
(`terrain`, `resizable`, `span`, `fixed`, or `parametric`), components that reference canonical theme asset IDs directly, dimensions, and an
optional `ascii` object.
`ascii: null` and omission are valid.

An entry may also declare `authoringBinding`. This names an existing map noun
and destination path plus authoring defaults. Cartbench keeps that ordinary
gameplay/collision object associated with the construction group and updates
its geometry when the group is resized; the catalog does not define physics.
The reference pipe binds to `resourceScenery.pipes`, while the ladder binds to
an ordinary climb-zone sprite.

The catalog runtime remains canonical in `construction/catalog.js`. Running
`python3 scripts/sync_editor_catalog.py` deterministically embeds that exact
runtime into the standalone editor and engine HTML files; `--check` fails when
either generated copy has drifted. The HTML artifacts therefore retain their
one-file/offline behavior without a second handwritten implementation.

## Invariant

Semantic intent is compiled by Cartbench through the active theme catalog. The
editor writes every resulting `{semanticFamily, image, constructionGroup, x, y,
w, h}` visual piece to `resourceScenery.sprites`, where `image` is already the
canonical asset ID. The engine looks up that exact ID and draws the stored
rectangle. It never examines neighbors or
reconstructs a group. Collision and travel remain ordinary map gameplay data.

Terrain topology keys are explicitly declared by each family. Catalog v1 uses
the documented order `top,right,bottom,left`; this is a new editor contract,
not an interpretation of a source filename. MarioAI's historic `mask_....`
suffixes remain provenance only; no mapping is asserted until it is verified,
and canonical compiler names remain authoritative.

Terrain edits reconsider the edited cell plus its four orthogonal neighbors.
Native maps retain the resolved canonical asset IDs and are authoritative. ASCII import maps
one symbol to family intent and invokes editor resolution; export collapses all
roles in that family to one symbol. Consequently ASCII is intentionally lossy.
Every ASCII document still has one world-space lattice: `@cell` positions all
catalog and legacy nouns. On import Cartbench projects each semantic terrain
cell's world rectangle onto the native family grid before resolving topology;
it never treats an ASCII column number as a native construction-cell number.
Procedural fallback colors and proportions live in the family's
`topologyFallback.style`; both Cartbench and the engine call the same generated
draw helper, so fallback cells are WYSIWYG without runtime topology analysis.

To add slopes, bridges, ice, water, or original assemblies, add a family and
assets to theme data. Renderer/import/export changes should not normally be
needed. Themes without a catalog and old maps without semantic roles retain
their existing recipe/image fallbacks.

## MarioAI identification boundary

The reference theme does **not** interpret the historic `mask_XXXX` suffix as
our top/right/bottom/left bit order. Until the original generator relationship
is verified, all 16 overground editor topologies explicitly take the procedural
fallback; the named mask images remain available provenance, not guessed roles.

The semantic compiler now owns the canonical names for every retained mapsheet
visual. The construction catalog consumes those IDs directly and does not maintain
a family-local naming or translation layer.
