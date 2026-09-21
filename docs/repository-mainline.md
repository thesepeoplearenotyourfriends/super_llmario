# Repository mainline and archive

The canonical reference-pack regime consists of exactly:

- `editor/reference_pack_editor.html` — the active standalone map editor;
- `themes/theme_marioai_reference_pack.llmtheme.txt` — the active theme contract with its runtime atlas images embedded as base64 text; and
- `engine/reference_pack_engine.html` — the active standalone, single-file runtime.

`scripts/build_release.py` consumes those canonical files and `maps/demo.llmmap.txt`. The editable HTML files do not fetch sibling repository files at runtime. The canonical theme has no runtime PNG, GIF, or DAT filesystem dependency; source image names are provenance only.

Everything under `archived/`—including editors, themes, tools, tests, and fixtures—is historical and is not an active input. `archived/engine/legacy_engine.html` is retained solely as an explicit behavioral oracle, never as an active runtime.

Canonical maps may author a finite `worldBounds` rectangle. The editor requires complete object and marker geometry to remain inside that rectangle, uses it for navigation and fitting, and the runtime uses the same rectangle for camera and fall-death behavior. Older maps without `worldBounds` remain loadable through a finite derived compatibility envelope and an explicit diagnostic; saving from the canonical editor persists that derived envelope.

Rows and row transitions are not part of the current canonical reference map/runtime contract. A future row contract may give each row its own finite bounds without changing the current top-level finite-map rule.

The immutable original sprite sheets remain in `themes/marioai_theme_files/` only as protected conversion inputs. They are not runtime dependencies and must not be moved or recommitted.
