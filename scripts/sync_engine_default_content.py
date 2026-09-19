#!/usr/bin/env python3
"""Synchronize the standalone engine's bundled default theme and map."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "engine" / "engine.html"
THEME = ROOT / "themes" / "theme_marioai_nonempty.llmtheme.txt"
MAP = ROOT / "maps" / "map_marioai_reference.llmmap.txt"
BEGIN = "/* BEGIN GENERATED DEFAULT CONTENT */"
END = "/* END GENERATED DEFAULT CONTENT */"


def javascript_json_parse(document: object) -> str:
    compact = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
    # Encode the compact JSON as a JavaScript string, then neutralize every
    # character that can terminate an inline script or act as a JS line break.
    literal = json.dumps(compact, ensure_ascii=False)
    literal = literal.replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    return f"JSON.parse({literal})"


def generated_block() -> str:
    theme = json.loads(THEME.read_text(encoding="utf-8"))
    map_doc = json.loads(MAP.read_text(encoding="utf-8"))
    return "\n".join(
        (
            BEGIN,
            f"const DEFAULT_THEME_DOC = {javascript_json_parse(theme)};",
            f"const DEFAULT_MAP_DOC = {javascript_json_parse(map_doc)};",
            END,
        )
    )


def synchronized_engine(source: str) -> str:
    start = source.find(BEGIN)
    finish = source.find(END)
    if start < 0 or finish < 0 or finish < start:
        raise RuntimeError("engine default-content markers are missing or out of order")
    finish += len(END)
    return source[:start] + generated_block() + source[finish:]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if engine.html is stale")
    args = parser.parse_args()
    source = ENGINE.read_text(encoding="utf-8")
    expected = synchronized_engine(source)
    if args.check:
        if source != expected:
            print("engine/engine.html bundled default content is stale", file=sys.stderr)
            return 1
        print("engine default content is synchronized")
        return 0
    if source != expected:
        ENGINE.write_text(expected, encoding="utf-8")
        print("updated engine/engine.html bundled default content")
    else:
        print("engine default content already synchronized")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
