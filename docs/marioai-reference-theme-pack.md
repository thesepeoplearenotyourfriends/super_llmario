# MarioAI complete reference theme pack

`themes/theme_marioai_reference_pack.llmtheme.txt` is a hand-authored **reference contract**, not a replacement for or a new version of the legacy theme format. No current editor or engine is expected to consume it. Its purpose is to show what a future theme must say so consumers never infer presentation semantics from filenames or sprite coordinates.

## Contract at a glance

The pack uses only six primary resource kinds: `ground`, `block`, `pickup`, `actor`, `decoration`, and `effect`. More specific meaning lives in ordinary fields.

- **`atlases`** embeds each static MarioAI world sheet once, with its media type, cell size, checksum, and provenance. The pack is self-contained; source filenames are provenance rather than runtime lookup instructions.
- **`resources`** inventories every nontransparent world-sheet cell. Each entry declares a kind, semantic role, larger membership, purpose, atlas rectangle, display size, normalized bottom-center anchor, and source provenance. A resource is a visual atom—not automatically something a map author can place.
- **`animations`** owns ordered frame references, per-frame offsets, timing, looping, display size, and anchor. Consumers request an animation by semantic ID; they do not discover adjacent sheet cells.
- **`constructions`** assembles visual components into pipes, ladders, bushes, signs, mushroom platforms, and three terrain autotiles. Layout and neighbor-mask information lives here rather than in new pseudo-kinds.
- **`objects`** binds themed presentation to engine nouns, capabilities, and visual states. The engine remains responsible for walking, jumping, bumping, breaking, collecting, transport, and all other behavior.
- **`parameterSchemas`** declares reusable, editor-visible authored variables such as walker direction/range/speed, pipe direction/length/destination, reward contents, terrain extent/style, and moving-platform path/range/speed.
- **`placeables`** is the authoring palette. Each complete placeable chooses an object and explicitly lists the instance parameters it exposes. Frames and construction pieces do not become placeable just because they exist.
- **`coverage`** records totals, sheet-by-sheet counts, explicit unresolved resources, and UI material deliberately outside this world-theme contract.
- **`extended`** is reserved for genuinely private metadata and intentionally contains no ordinary gameplay/editor semantics.

## Coverage and uncertainty

The pack accounts for **298 visually nonempty cells** across the ten world/presentation PNG sheets. The test independently decodes those static PNGs, counts alpha-bearing cells, and proves a one-to-one match with resource provenance. Font, logo, ending scene, and world-map artwork are explicitly excluded as engine/UI presentation rather than silently omitted.

Most source-backed actor, pickup, particle, construction, and terrain cells have direct semantic names. Seventy-four cells have no reliably established exact purpose: 62 background components plus a small set of unused/alternate map, enemy, player, and goal poses. They remain explicit resources with a declared unresolved-component purpose and larger membership; coordinates appear only under `provenance`. The `coverage.unresolvedExactPurpose` list makes the uncertainty machine-readable instead of inventing behavior or hiding the art.

## Deliberately deferred

This reference does not define serialization for maps, runtime state-machine rules, collision algorithms, autotile editing UX, atlas upload UX, mirroring policy, palette variants, or how a consumer migrates legacy themes. Those belong to later editor and engine work. Timing values and anchors are presentation defaults that a future integration may refine after play/render validation; no compatibility branch has been added now.

The source images, legacy themes, existing converter/compiler, editor, Cartbench, and engine are unchanged.
