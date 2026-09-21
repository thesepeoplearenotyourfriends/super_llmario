#!/usr/bin/env python3
"""Inline the canonical catalog runtime into the offline HTML artifacts."""
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1]
source=(root/'construction/catalog.js').read_text().rstrip()
begin='<!-- BEGIN GENERATED CONSTRUCTION CATALOG -->'; end='<!-- END GENERATED CONSTRUCTION CATALOG -->'
block=f'{begin}\n<script>\n{source}\n</script>\n{end}'
stale=[]
for relative in ('editor/editor.html','engine/engine.html'):
    path=root/relative; html=path.read_text()
    if begin in html:
        before,rest=html.split(begin,1); _,after=rest.split(end,1); generated=before+block+after
    else:
        generated=html.replace('</head>',block+'\n</head>',1)
    if '--check' in sys.argv:
        if generated!=html: stale.append(relative)
    else:path.write_text(generated)
if stale: raise SystemExit('catalog inline is stale: '+', '.join(stale)+'; run scripts/sync_editor_catalog.py')
