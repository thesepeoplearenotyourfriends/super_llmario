# MarioAI complete reference theme pack

`themes/theme_marioai_reference_pack.llmtheme.txt` is a hand-authored **reference contract**, not a replacement for or a new version of the legacy theme format. No current editor or engine is expected to consume it. Its purpose is to show what a future theme must say so consumers never infer presentation semantics from filenames or sprite coordinates.

## Contract at a glance

The pack uses only six primary resource kinds: `ground`, `block`, `pickup`, `actor`, `decoration`, and `effect`. More specific meaning lives in ordinary fields.

- **`atlases`** embeds each static MarioAI world sheet once, with its media type, cell size, checksum, and provenance. The pack is self-contained; source filenames are provenance rather than runtime lookup instructions.
- **`resources`** inventories every nontransparent world-sheet cell. Each entry declares a kind, semantic role, declared family membership, purpose, atlas rectangle, display size, normalized bottom-center anchor, and source provenance. A resource is a visual atom—not automatically something a map author can place.
- **`families`** declares every semantic membership target used by resources. This keeps `belongsTo` references inside a checkable semantic graph rather than treating them as arbitrary labels.
- **`animations`** owns temporal sequences through the order of their `frames`. Timing and looping are omitted when unknown; optional playback metadata may be added when evidence establishes it and consumers do not infer either property from adjacent sheet cells.
- **`frameGroups`** preserves related source-backed poses or state slots when runtime selection is known to exist but ordering and timing are not. A frame group is deliberately not a timed animation.
- **`constructions`** assembles visual components into backgrounds, pipes, ladders, bushes, signs, mushroom platforms, and three terrain autotiles. It records fixed layouts, repeatable axes, known source holes, and mirroring as presentation metadata rather than pseudo-kinds or duplicate resources.
- **`objects`** binds presentation targets to a small engine-noun vocabulary, composable capabilities, and visual states. Moving-platform semantics belong to a distinct object definition, not to a placeable. The engine remains responsible for behavior.
- **`parameterSchemas`** declares reusable, editor-visible authored variables. Generic `extent` fields let ladders, bushes, and platforms share value types without pretending to be pipes or terrain; walker, pipe, moving-platform, reward, and terrain semantics remain explicitly named.
- **`placeables`** is the authoring palette. Each complete placeable chooses an object and explicitly lists the instance parameters it exposes. A placeable configures its object but never adds gameplay capabilities.
- **`coverage`** records totals, sheet-by-sheet counts, explicit unresolved resources, and UI material deliberately outside this world-theme contract.
- **`extended`** is reserved for genuinely private metadata and intentionally contains no ordinary gameplay/editor semantics.

## Coverage and reviewed backgrounds

The pack accounts for **298 visually nonempty cells** across the ten world/presentation PNG sheets. The integrity test independently decodes those static PNGs, counts alpha-bearing cells, and proves a one-to-one match with resource provenance. Font, logo, ending scene, and world-map artwork are explicitly excluded as engine/UI presentation rather than silently omitted.

All **62 nonempty background-sheet cells now have human-reviewed semantics**. They describe two dome variants, a sky gradient, red/brown and yellow/brown arches, grey and green architectural families, rockpiles, wall companions, repeatable fills, and a green fringe. Fixed and extensible assemblies are declared as constructions. Mirroring/flipping is metadata, and transparent source cell 22 remains correctly absent. There are **zero unresolved background resources**.

## Semantic completion

All **298 visually nonempty world/presentation resources are semantically accounted for**. The final reviewed resources identify the red and green Koopa turnaround frames; slide and kick states for normal, small, fire, and carrying-player forms; the carrying/raccoon alternate-tail airborne frame; and the goal actor’s second celebration frame. Both total and background unresolved counts are zero, and no resource ID contains `unresolved`.

The carrying/raccoon airborne presentation groups source indices 7 and 15 as related tail-state resources, but marks their selection as runtime-defined rather than inventing a frame sequence or timing. The normal, fire, and carrying-form carry poses use the same honest grouping model. Semantic completion therefore does not claim that every future runtime presentation detail is settled.

The goal strip is represented as one standing/idle resource followed by a two-frame celebration animation. It remains goal/end-scene presentation and is not added to the general placeable palette.

## Semantic integrity

The test protects the pack as a graph, not only as an inventory. It verifies embedded atlas identity and one-to-one nonempty-cell coverage; resource-to-family membership; animation-to-frame, frame-group-to-resource, construction-to-component, object-state-to-presentation, placeable-to-object, and placeable-to-parameter references; and the zero-unresolved invariant for both background and total resources. It also verifies all manually audited `mapsheet.png` cells by exact provenance index and rejects reward semantics on question-block frames.

## Presentation-semantics audit

Static turnaround, idle, duck, jump, run-jump, skid, slide, kick, and single carry poses now bind directly to their source resources. The pack no longer manufactures one-frame animations or 120 ms pose timers. The retained temporal sequences are question-block idle, breakable-block idle gleam, coin spin, rotating-block spin, debris, the two source-backed sparkle sequences, flower emergence, enemy walks/shell spins/wing flap, princess celebration, player walks/runs, and the fireball sequence. Frame-array order describes each sequence; unknown timing and looping are omitted rather than encoded as invariants. The former debris-backed `effect.sparkle.default` assertion was removed rather than claiming that debris is sparkle. The brick intact state targets the complete breakable idle animation. The question block’s used state targets the hidden/revealed frame group—not an arbitrary first frame—because those four identical source slots collectively represent that temporary revealed state while their runtime selection remains unknown.

The mapsheet audit is intentionally narrow and provenance-driven. It assigns cells `04`–`07` to four distinct hidden/revealed state slots; `10`–`13` to the breakable idle gleam; `14`–`17` to question-block frames; `20`–`23` to coin frames; and `24`–`27` to rotating-block frames. It assigns bush construction components at `50`–`52` and `60`–`62`, sign components at `43`, `44`, `53`, and `54`, castle positions at `88`–`8A`, `98`–`9A`, and `A8`–`AA`, and underground positions at `8C`–`8E`, `9C`–`9E`, and `AC`–`AE`. Neighboring and otherwise unaudited source cells retain their existing identities.

## Deliberately deferred

This reference does not define serialization for maps, runtime state-machine rules, collision algorithms, autotile editing UX, atlas upload UX, mirroring policy, palette variants, or how a consumer migrates legacy themes. Those belong to later editor and engine work. Anchors remain presentation data, while animation timing awaits actual behavioral evidence; no compatibility branch has been added now.

The source images, legacy themes, existing converter/compiler, editor, Cartbench, and engine are unchanged.
