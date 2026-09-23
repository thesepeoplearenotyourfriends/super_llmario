#!/usr/bin/env python3
"""Build Super LLMario's single-file reference-pack release."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "engine" / "reference_pack_engine.html"
EDITOR = ROOT / "editor" / "reference_pack_editor.html"
THEME = ROOT / "themes" / "theme_marioai_reference_pack.llmtheme.txt"
MAPS = ROOT / "maps"
OUTPUT = ROOT / "dist" / "super_llmario.html"
DEFAULT_EXPERIENCE_ID = "demo"
MAP_SUFFIX = ".llmmap.txt"
MAP_FORMAT = "llmario-reference-editor-map"
MAP_VERSION = 1

SCRIPT_BOUNDARY = "</script>\n<script>\n(()=>{\n'use strict';"
RUNTIME_BOOT = "refreshPair();resize();requestAnimationFrame(frame);"
EDITOR_BOOT = "window.addEventListener('resize',resize);resize();renderIssues();\n})();"

RELEASE_STYLE = r"""
#releaseEditorButton{margin-left:auto}
#releaseMapPicker{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.08em}
#releaseMenu{border:1px solid #55dbe9;border-radius:8px;padding:6px 8px;background:#17465b;color:var(--ink);font:inherit;font-weight:700;letter-spacing:0}
#releaseEditorShell{position:fixed;inset:0;z-index:1000;display:grid;grid-template-rows:48px minmax(0,1fr);background:#07131d}
#releaseEditorShell[hidden]{display:none}
#releaseEditorBar{display:flex;align-items:center;gap:12px;padding:7px 12px;background:#0d2635;border-bottom:1px solid #48d7e866;color:var(--ink)}
#releaseEditorBar span{color:var(--muted);font-size:12px}#releaseEditorBack{margin-left:auto}
#releaseEditorFrame{width:100%;height:100%;border:0;background:#0b1216}
""".strip()

RELEASE_EDITOR_SHELL = """
<div id="releaseEditorShell" hidden>
  <div id="releaseEditorBar"><strong>MAP EDITOR</strong><span>embedded release tool</span><button id="releaseEditorBack">Back to game</button></div>
  <iframe id="releaseEditorFrame" title="Map editor"></iframe>
</div>
""".strip()

RELEASE_MAP_PICKER = '<label id="releaseMapPicker">MAP <select id="releaseMenu" aria-label="Map"></select></label>'

RELEASE_RUNTIME = r"""
let activePackedExperienceId='';
async function loadPackedExperienceIntoEditor(experience){
  const frame=document.getElementById('releaseEditorFrame');
  if(!frame?.dataset.loaded)return;
  try{await frame.contentWindow?.ReferencePackEditorReleaseLoad?.(experience.theme,experience.map,experience.filename)}
  catch(error){report(`Embedded editor failed: ${error.message||error}`)}
}
async function applyPackedExperience(experience){
  if(!experience)throw new Error('Unknown packed experience.');
  const errors=[...B.validateReferenceTheme(experience.theme),...B.validateReferenceEditorMap(experience.map,experience.theme)];
  if(errors.length){report(errors);return false}
  state.theme=experience.theme;state.map=experience.map;await loadAtlases();refreshPair();activePackedExperienceId=experience.id;
  const menu=document.getElementById('releaseMenu');if(menu)menu.value=experience.id;
  await loadPackedExperienceIntoEditor(experience);
  return true;
}
function openPackedEditor(){
  const shell=document.getElementById('releaseEditorShell'),frame=document.getElementById('releaseEditorFrame');
  if(!shell||!frame)return;shell.hidden=false;
  if(frame.dataset.loaded)return;
  frame.onload=async()=>{frame.dataset.loaded='1';const experience=PACKED_EXPERIENCES.find(item=>item.id===activePackedExperienceId)||PACKED_EXPERIENCES[0];await loadPackedExperienceIntoEditor(experience)};
  frame.srcdoc=PACKED_EDITOR_HTML;
}
function closePackedEditor(){
  const shell=document.getElementById('releaseEditorShell');if(shell)shell.hidden=true;
}
async function bootPackedRelease(){
  if(!PACKED_EXPERIENCES.length){refreshPair();return}
  document.getElementById('releaseEditorButton')?.addEventListener('click',openPackedEditor);
  document.getElementById('releaseEditorBack')?.addEventListener('click',closePackedEditor);
  const menu=document.getElementById('releaseMenu'),picker=document.getElementById('releaseMapPicker');
  if(menu){
    for(const experience of PACKED_EXPERIENCES){const option=document.createElement('option');option.value=experience.id;option.textContent=experience.label;menu.append(option)}
    menu.addEventListener('change',()=>{const experience=PACKED_EXPERIENCES.find(item=>item.id===menu.value);if(experience)void applyPackedExperience(experience)});
  }
  if(picker)picker.hidden=PACKED_EXPERIENCES.length<2;
  const initial=PACKED_EXPERIENCES.find(item=>item.id===PACKED_DEFAULT_EXPERIENCE_ID)||PACKED_EXPERIENCES[0];
  await applyPackedExperience(initial);
}
""".strip()


def load_document(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def javascript_string(text: str) -> str:
    literal = json.dumps(text, ensure_ascii=False)
    return literal.replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def javascript_json_parse(document: object) -> str:
    compact = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
    return f"JSON.parse({javascript_string(compact)})"


def experience_id(path: Path) -> str:
    if not path.name.endswith(MAP_SUFFIX):
        raise RuntimeError(f"{path.name}: expected {MAP_SUFFIX} suffix")
    return path.name[: -len(MAP_SUFFIX)]


def experience_label(identifier: str) -> str:
    words = identifier.replace("_", " ").replace("-", " ").split()
    return " ".join(word[:1].upper() + word[1:] for word in words) or identifier


def validate_map_compatibility(theme: object, map_doc: object, path: Path) -> None:
    if not isinstance(map_doc, dict):
        raise RuntimeError(f"{path.relative_to(ROOT)} root must be an object")
    if map_doc.get("format") != MAP_FORMAT:
        raise RuntimeError(f"{path.relative_to(ROOT)} has unsupported map format {map_doc.get('format')!r}")
    if map_doc.get("mapVersion") != MAP_VERSION:
        raise RuntimeError(f"{path.relative_to(ROOT)} has unsupported mapVersion {map_doc.get('mapVersion')!r}")
    map_theme = map_doc.get("theme")
    if not isinstance(map_theme, dict):
        raise RuntimeError(f"{path.relative_to(ROOT)} theme identity must be an object")
    if theme.get("id") != map_theme.get("id"):
        raise RuntimeError(f"{path.relative_to(ROOT)} does not target the packed reference theme")
    if theme.get("packVersion") != map_theme.get("packVersion"):
        raise RuntimeError(f"{path.relative_to(ROOT)} theme version does not match the packed reference theme")


def load_experiences(theme: object) -> list[dict[str, object]]:
    paths = sorted(
        MAPS.glob(f"*{MAP_SUFFIX}"),
        key=lambda path: (experience_id(path) != DEFAULT_EXPERIENCE_ID, experience_id(path).casefold(), path.name),
    )
    if not paths:
        raise RuntimeError(f"no *{MAP_SUFFIX} maps found in {MAPS.relative_to(ROOT)}")
    experiences = []
    for path in paths:
        map_doc = load_document(path)
        validate_map_compatibility(theme, map_doc, path)
        identifier = experience_id(path)
        experiences.append(
            {
                "id": identifier,
                "label": experience_label(identifier),
                "filename": path.name,
                "map": map_doc,
            }
        )
    return experiences


def pack_editor(source: str) -> str:
    if source.count(EDITOR_BOOT) != 1:
        raise RuntimeError("editor boot marker is missing or ambiguous")
    hook = """function focusPackedEditorMap(){\n  const rect=stage.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height),start=state.markers?.start;\n  if(start&&Number.isFinite(start.x)&&Number.isFinite(start.y)){\n    state.camera={x:w*.28-start.x,y:h*.62-start.y,zoom:1};\n    draw();\n    return;\n  }\n  const boxes=[];\n  for(const inst of state.instances){\n    try{const b=instanceBounds(inst);if(b&&[b.x,b.y,b.w,b.h].every(Number.isFinite))boxes.push(b)}catch{}\n  }\n  for(const marker of Object.values(state.markers||{}))if(marker&&Number.isFinite(marker.x)&&Number.isFinite(marker.y))boxes.push({x:marker.x-16,y:marker.y-32,w:32,h:36});\n  if(!boxes.length){state.camera={x:0,y:0,zoom:1};draw();return}\n  const minX=Math.min(...boxes.map(b=>b.x)),minY=Math.min(...boxes.map(b=>b.y)),maxX=Math.max(...boxes.map(b=>b.x+b.w)),maxY=Math.max(...boxes.map(b=>b.y+b.h)),pad=48,contentW=Math.max(1,maxX-minX),contentH=Math.max(1,maxY-minY),zoom=Math.max(.1,Math.min(2,(w-pad*2)/contentW,(h-pad*2)/contentH));\n  state.camera={x:(w-contentW*zoom)/2-minX*zoom,y:(h-contentH*zoom)/2-minY*zoom,zoom};\n  draw();\n}\nwindow.ReferencePackEditorReleaseLoad=async(theme,map,mapName='packed.llmmap.txt')=>{\n  const themeFile=new File([JSON.stringify(theme)],'theme_marioai_reference_pack.llmtheme.txt',{type:'application/json'});\n  await loadTheme(themeFile);\n  const mapFile=new File([JSON.stringify(map)],mapName,{type:'application/json'});\n  await openMap(mapFile);\n  focusPackedEditorMap();\n};\n"""
    return source.replace(EDITOR_BOOT, "window.addEventListener('resize',resize);resize();renderIssues();\n" + hook + "})();", 1)


def release_data(theme: object, experiences: list[dict[str, object]], editor_html: str) -> str:
    entries = []
    for experience in experiences:
        entries.append(
            "\n".join(
                (
                    "{",
                    f"  id: {json.dumps(experience['id'])},",
                    f"  label: {json.dumps(experience['label'])},",
                    f"  filename: {json.dumps(experience['filename'])},",
                    "  theme: PACKED_THEME,",
                    f"  map: {javascript_json_parse(experience['map'])}",
                    "}",
                )
            )
        )
    default_id = DEFAULT_EXPERIENCE_ID if any(item["id"] == DEFAULT_EXPERIENCE_ID for item in experiences) else experiences[0]["id"]
    return "\n".join(
        (
            '<script id="packedReleaseContent">',
            f"const PACKED_THEME = {javascript_json_parse(theme)};",
            f"const PACKED_EXPERIENCES = [\n{','.join(entries)}\n];",
            f"const PACKED_DEFAULT_EXPERIENCE_ID = {json.dumps(default_id)};",
            f"const PACKED_EDITOR_HTML = {javascript_string(editor_html)};",
            "</script>",
        )
    )


def build(engine: str, editor: str, theme: object, experiences: list[dict[str, object]]) -> str:
    if engine.count(SCRIPT_BOUNDARY) != 1:
        raise RuntimeError("engine script boundary is missing or ambiguous")
    if engine.count(RUNTIME_BOOT) != 1:
        raise RuntimeError("engine boot marker is missing or ambiguous")
    if engine.count('<div class="controls">') != 1:
        raise RuntimeError("engine controls marker is missing or ambiguous")
    if engine.count("</style></head>") != 1:
        raise RuntimeError("engine style marker is missing or ambiguous")
    if engine.count("</header>") != 1:
        raise RuntimeError("engine header marker is missing or ambiguous")
    if engine.count("</main>") != 1:
        raise RuntimeError("engine main marker is missing or ambiguous")

    packed_editor = pack_editor(editor)
    output = engine.replace("</style></head>", RELEASE_STYLE + "\n</style></head>", 1)
    output = output.replace("</header>", RELEASE_MAP_PICKER + '<button id="releaseEditorButton">Editor</button></header>', 1)
    output = output.replace("</main>", "</main>\n" + RELEASE_EDITOR_SHELL, 1)
    output = output.replace(SCRIPT_BOUNDARY, "</script>\n" + release_data(theme, experiences, packed_editor) + "\n<script>\n(()=>{\n'use strict';", 1)
    output = output.replace(RUNTIME_BOOT, RELEASE_RUNTIME + "\nbootPackedRelease();resize();requestAnimationFrame(frame);", 1)
    return output


def main() -> int:
    theme = load_document(THEME)
    experiences = load_experiences(theme)
    output = build(ENGINE.read_text(encoding="utf-8"), EDITOR.read_text(encoding="utf-8"), theme, experiences)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(output, encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(output.encode('utf-8'))} bytes, {len(experiences)} maps)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
