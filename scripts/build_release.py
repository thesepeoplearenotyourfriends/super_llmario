#!/usr/bin/env python3
"""Build Super LLMario's single-file, project-specific GitHub Release asset."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "engine" / "engine.html"
OUTPUT = ROOT / "dist" / "super_llmario.html"
THEMES = [
    ROOT / "themes" / "theme_desert.llmtheme.txt",
    ROOT / "themes" / "theme_jungle.llmtheme.txt",
    ROOT / "themes" / "theme_marioai_nonempty.llmtheme.txt",
    ROOT / "themes" / "theme_wooded.llmtheme.txt",
]
MAPS = [
    ROOT / "maps" / "map_browntown.txt",
    ROOT / "maps" / "map_marioai_reference.llmmap.txt",
]
DEFAULT_THEME_ID = "marioai-semantic-nonempty"
DEFAULT_MAP_ID = "marioai-reference-playground"
BEGIN = "/* BEGIN RELEASE CONTENT (kept empty in editable source) */"
END = "/* END RELEASE CONTENT */"


def load_documents(paths: list[Path]) -> list[object]:
    return [json.loads(path.read_text(encoding="utf-8")) for path in paths]


def javascript_json_parse(document: object) -> str:
    compact = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
    literal = json.dumps(compact, ensure_ascii=False)
    literal = literal.replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    return f"JSON.parse({literal})"


def packed_block() -> str:
    theme_docs = load_documents(THEMES)
    map_docs = load_documents(MAPS)
    if DEFAULT_THEME_ID not in {doc.get("id") for doc in theme_docs if isinstance(doc, dict)}:
        raise RuntimeError("default release theme is not packed")
    default_map = next((doc for doc in map_docs if isinstance(doc, dict) and doc.get("id") == DEFAULT_MAP_ID), None)
    if default_map is None or default_map.get("theme") != DEFAULT_THEME_ID:
        raise RuntimeError("default release map is missing or does not use the default theme")
    themes = ",\n  ".join(javascript_json_parse(doc) for doc in theme_docs)
    maps = ",\n  ".join(javascript_json_parse(doc) for doc in map_docs)
    return "\n".join(
        (
            BEGIN,
            f"const PACKED_THEMES = [\n  {themes}\n];",
            f"const PACKED_MAPS = [\n  {maps}\n];",
            f"const PACKED_DEFAULT_THEME_ID = {json.dumps(DEFAULT_THEME_ID)};",
            f"const PACKED_DEFAULT_MAP_ID = {json.dumps(DEFAULT_MAP_ID)};",
            END,
        )
    )


def build(source: str) -> str:
    start = source.find(BEGIN)
    finish = source.find(END, start)
    if start < 0 or finish < 0:
        raise RuntimeError("engine release-content markers are missing or out of order")
    finish += len(END)
    return source[:start] + packed_block() + source[finish:]


def main() -> int:
    source = ENGINE.read_text(encoding="utf-8")
    output = build(source)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(output, encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(output.encode('utf-8'))} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
