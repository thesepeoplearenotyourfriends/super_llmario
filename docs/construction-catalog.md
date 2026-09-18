# Semantic construction catalog v1

`theme.constructionCatalog` is the single, versioned authoring vocabulary. Its
`families` entries have an `id`, editor `name`/`category`, a generic `type`
(`terrain`, `resizable`, `span`, `fixed`, or `parametric`), semantic component
roles, role-to-theme-asset mappings, dimensions, and an optional `ascii` object.
`ascii: null` and omission are valid.

An entry may also declare `authoringBinding`. This names an existing map noun
and destination path plus authoring defaults. Cartbench keeps that ordinary
gameplay/collision object associated with the construction group and updates
its geometry when the group is resized; the catalog does not define physics.
The reference pipe binds to `resourceScenery.pipes`, while the ladder binds to
an ordinary climb-zone sprite.

## Invariant

Semantic intent is compiled by Cartbench through the active theme catalog. The
editor writes every resulting `{family, role, group, x, y, w, h}` visual piece
to `resourceScenery.sprites`. The engine only resolves `role` to the active
theme's asset and draws that stored rectangle. It never examines neighbors or
reconstructs a group. Collision and travel remain ordinary map gameplay data.

Terrain topology keys are explicitly declared by each family. Catalog v1 uses
the documented order `top,right,bottom,left`; this is a new editor contract,
not an interpretation of a source filename. MarioAI's historic `mask_....`
suffixes remain provenance only; no mapping is asserted until it is verified,
and unknown `map.map-cell.*` images remain unclassified.

Terrain edits reconsider the edited cell plus its four orthogonal neighbors.
Native maps retain the resolved roles and are authoritative. ASCII import maps
one symbol to family intent and invokes editor resolution; export collapses all
roles in that family to one symbol. Consequently ASCII is intentionally lossy.

To add slopes, bridges, ice, water, or original assemblies, add a family and
assets to theme data. Renderer/import/export changes should not normally be
needed. Themes without a catalog and old maps without semantic roles retain
their existing recipe/image fallbacks.

## MarioAI identification boundary

The reference theme does **not** interpret the historic `mask_XXXX` suffix as
our top/right/bottom/left bit order. Until the original generator relationship
is verified, all 16 overground editor topologies explicitly take the procedural
fallback; the named mask images remain available provenance, not guessed roles.

No left/middle/right scenery family or width-and-height mushroom platform can be
cataloged confidently from the current semantic inventory. The source cells
still requiring semantic identification before those real acceptance fixtures
can be added are:

- `map.map-cell.05.x05.y00`, `.06.x06.y00`, `.07.x07.y00`, `.09.x09.y00`,
  `.0c.x12.y00`, and `.13.x03.y01`;
- `map.map-cell.18.x08.y01`, `.19.x09.y01`, `.1c.x12.y01`, and
  `.24.x04.y02` through `.29.x09.y02`;
- `map.map-cell.38.x08.y03`, `.39.x09.y03`, `.3c.x12.y03`, `.43.x03.y04`,
  `.44.x04.y04`, `.46.x06.y04`, `.47.x07.y04`, and `.49.x09.y04` through
  `.4d.x13.y04`;
- `map.map-cell.50.x00.y05` through `.54.x04.y05`, `.56.x06.y05`,
  `.57.x07.y05`, `.59.x09.y05` through `.5c.x12.y05`;
- `map.map-cell.60.x00.y06` through `.62.x02.y06`, `.66.x06.y06` through
  `.69.x09.y06`, `.76.x06.y07` through `.79.x09.y07`;
- `map.map-cell.84.x04.y08` through `.87.x07.y08`, `.94.x04.y09` through
  `.97.x07.y09`, `.a4.x04.y10` through `.a7.x07.y10`;
- `map.map-cell.b0.x00.y11` through `.b2.x02.y11`, `.b4.x04.y11` through
  `.b7.x07.y11`, `.e0.x00.y14` through `.e2.x02.y14`, and
  `.f0.x00.y15` through `.f2.x02.y15`.

None is promoted merely from its atlas position. Consequently generic `span`
and `parametric` support is implemented and integration-tested with fixtures,
but the reference palette intentionally does not claim a MarioAI bush, cloud,
or mushroom-platform family yet.
