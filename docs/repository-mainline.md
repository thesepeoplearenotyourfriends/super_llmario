# Repository mainline and archive

The canonical product is the release build, `dist/super_llmario.html`, which `scripts/build_release.py` produces as one self-contained file: the game, the map picker and world, and the map editor with its menus and world plot tools. UI checks and screenshots target it.

Its build inputs are:

- `engine/reference_pack_engine.html` — the standalone, single-file runtime;
- `editor/reference_pack_editor.html` — the map, unit and capability editor;
- `themes/theme_marioai_reference_pack.llmtheme.txt` — the theme contract with its runtime atlas images embedded as base64 text; and
- the maps in `maps/` and the world rooms in `world/rooms/`.

The engine and editor still open on their own, but as build inputs their UI may lag the release build's. None of these files fetch sibling repository files at runtime. The canonical theme has no runtime PNG, GIF, or DAT filesystem dependency; source image names are provenance only.

Everything under `archived/`—including editors, themes, tools, tests, and fixtures—is historical and is not an active input. `archived/engine/legacy_engine.html` is retained solely as an explicit behavioral oracle, never as an active runtime.

Canonical maps may author a finite `worldBounds` rectangle. The editor requires complete object and marker geometry to remain inside that rectangle, uses it for navigation and fitting, and the runtime uses the same rectangle for camera and fall-death behavior. Older maps without `worldBounds` remain loadable through a finite derived compatibility envelope and an explicit diagnostic; saving from the editor persists that derived envelope.

Rows and row transitions are not part of the current canonical reference map/runtime contract. A future row contract may give each row its own finite bounds without changing the current top-level finite-map rule.

The immutable original sprite sheets remain in `themes/marioai_theme_files/` only as protected conversion inputs. They are not runtime dependencies and must not be moved or recommitted.
