# Semantic construction catalog v1

`theme.constructionCatalog` is the single, versioned authoring vocabulary. Its
`families` entries have an `id`, editor `name`/`category`, a generic `type`
(`terrain`, `resizable`, `span`, `fixed`, or `parametric`), semantic component
roles, role-to-theme-asset mappings, dimensions, and an optional `ascii` object.
`ascii: null` and omission are valid.

## Invariant

Semantic intent is compiled by Cartbench through the active theme catalog. The
editor writes every resulting `{family, role, group, x, y, w, h}` visual piece
to `resourceScenery.sprites`. The engine only resolves `role` to the active
theme's asset and draws that stored rectangle. It never examines neighbors or
reconstructs a group. Collision and travel remain ordinary map gameplay data.

Terrain topology keys are explicitly declared by each family. Catalog v1 uses
the documented order `top,right,bottom,left`; this is a new editor contract,
not an interpretation of a source filename. MarioAI's historic `mask_....`
suffixes remain provenance only: each mapping is stated explicitly, and unknown
`map.map-cell.*` images remain unclassified.

Terrain edits reconsider the edited cell plus its four orthogonal neighbors.
Native maps retain the resolved roles and are authoritative. ASCII import maps
one symbol to family intent and invokes editor resolution; export collapses all
roles in that family to one symbol. Consequently ASCII is intentionally lossy.

To add slopes, bridges, ice, water, or original assemblies, add a family and
assets to theme data. Renderer/import/export changes should not normally be
needed. Themes without a catalog and old maps without semantic roles retain
their existing recipe/image fallbacks.
