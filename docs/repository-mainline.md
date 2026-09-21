# Repository mainline and archive

The active reference regime has one canonical authoring pair:

- `editor/reference_pack_editor.html`
- `themes/theme_marioai_reference_pack.llmtheme.txt`

Runtime work for that pair belongs in `engine/reference_pack_engine.html`. The release builder consumes only those reference-pack files and the canonical demo map.

Previous editors, themes, conversion tools, tests, and fixtures are retained under `archived/`. They are historical material, not inputs to the active editor, runtime, release build, or default test discovery. The archived editor may be read only by an explicitly named regression assertion.

`engine/engine.html` remains the deliberately preserved legacy gameplay oracle. It is not a second mainline and should only be used when a test explicitly compares established behavior.

The immutable original sprite sheets remain in `themes/marioai_theme_files/` because repository policy forbids moving or recommitting those binary inputs. Active reference applications do not load those PNG/GIF files at runtime: the canonical theme embeds its atlas data and both HTML applications remain standalone. No DAT input is required.
