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
EDITOR_HEADER = '<header><b>Reference Pack Editor</b><span class="status" id="status">Load a reference-contract theme to begin.</span><span id="dirty" class="dirty" hidden>● Unsaved</span><span class="spacer"></span><button id="undoBtn" title="Undo (Ctrl/Cmd+Z)" disabled>Undo</button><button id="redoBtn" title="Redo (Ctrl/Cmd+Shift+Z)" disabled>Redo</button><button id="eraserBtn" aria-label="Eraser tool" aria-pressed="false" title="Eraser — drag to remove authored objects">⌫</button><button id="paletteToggle" aria-label="Toggle Palette" aria-pressed="true" title="Show or hide Palette">Palette</button><button id="detailsToggle" aria-label="Toggle Details" aria-pressed="true" title="Show or hide Details">Details</button><button id="openMapBtn" title="Open an authored map">Open…</button><button id="saveMapBtn" title="Save authored map" disabled>Save</button><button id="helpBtn" aria-label="Open help" title="Help and shortcuts">?</button><button id="clearBtn" disabled>Clear</button><button id="loadBtn">Theme…</button><input id="themeFile" type="file" accept=".txt,.json,.llmtheme" hidden><input id="mapFile" type="file" accept=".llmmap.txt,.json,.txt" hidden></header>'

PACKED_EDITOR_HEADER = """
<header class="packed-editor-header">
  <div class="packed-menu-row">
    <div class="packed-menu">
      <button class="packed-menu-trigger" type="button" aria-haspopup="true" aria-expanded="false" data-menu="packedFileMenu">File</button>
      <div class="packed-menu-popup" id="packedFileMenu" role="menu" hidden>
        <button id="openMapBtn" role="menuitem" title="Open an authored map">Open map… <span>Ctrl+O</span></button>
        <button id="saveMapBtn" role="menuitem" title="Save authored map" disabled>Save map <span>Ctrl+S</span></button>
        <div class="packed-menu-separator"></div>
        <button id="loadBtn" role="menuitem">Load theme…</button>
      </div>
    </div>
    <div class="packed-menu">
      <button class="packed-menu-trigger" type="button" aria-haspopup="true" aria-expanded="false" data-menu="packedEditMenu">Edit</button>
      <div class="packed-menu-popup" id="packedEditMenu" role="menu" hidden>
        <button id="undoBtn" role="menuitem" title="Undo (Ctrl/Cmd+Z)" disabled>Undo <span>Ctrl+Z</span></button>
        <button id="redoBtn" role="menuitem" title="Redo (Ctrl/Cmd+Shift+Z)" disabled>Redo <span>Ctrl+Shift+Z</span></button>
        <div class="packed-menu-separator"></div>
        <button id="clearBtn" role="menuitem" disabled>Clear map</button>
      </div>
    </div>
    <span class="spacer"></span>
    <span class="packed-map-name" id="packedMapName">Untitled map</span><span id="dirty" class="dirty" hidden>*</span>
    <button id="backToGameBtn" type="button">Back to game</button>
  </div>
  <div class="packed-toolbar" role="toolbar" aria-label="Map editor tools">
    <button id="eraserBtn" aria-label="Eraser tool" aria-pressed="false" title="Eraser — drag to remove authored objects">⌫</button>
    <button id="testPointBtn" aria-label="Test Point tool" aria-pressed="false" title="Place an exact, unsnapped test point">Test Point</button>
    <button id="clearTestPointBtn" disabled title="Remove the test point">Clear Test</button>
    <button id="rangesBtn" aria-pressed="false" disabled title="Show real-engine reachability from the test point">Ranges</button>
    <select id="testProfile" aria-label="Starting movement state" title="Starting movement state"><option value="standing">Standing</option><option value="raccoonFlight">Raccoon P-speed</option></select>
    <button id="playFromHereBtn" disabled title="Play the current in-memory map from the test point">Play From Here</button>
    <button id="paletteToggle" aria-label="Toggle Palette" aria-pressed="true" title="Show or hide Palette">Palette</button>
    <button id="detailsToggle" aria-label="Toggle Details" aria-pressed="true" title="Show or hide Details">Details</button>
    <button id="helpBtn" aria-label="Open help" title="Help and shortcuts">?</button>
    <span class="status" id="status">Load a reference-contract theme to begin.</span>
  </div>
  <input id="themeFile" type="file" accept=".txt,.json,.llmtheme" hidden><input id="mapFile" type="file" accept=".llmmap.txt,.json,.txt" hidden>
</header>
""".strip()

PACKED_EDITOR_STYLE = r"""
header.packed-editor-header{height:64px;display:grid;grid-template-rows:32px 32px;gap:0;padding:0;background:#111c21;border-bottom:1px solid var(--line)}
.packed-menu-row,.packed-toolbar{display:flex;align-items:center;gap:5px;min-width:0;padding:3px 8px}
.packed-menu-row{position:relative;border-bottom:1px solid #263940}.packed-toolbar{background:#101a1f}
.packed-menu{position:relative;height:100%;display:flex;align-items:center}.packed-menu-trigger{border-color:transparent;background:transparent;padding:4px 9px}
.packed-menu-trigger:hover,.packed-menu-trigger[aria-expanded="true"]{border-color:var(--line);background:#29372f}
.packed-menu-popup{position:absolute;left:0;top:29px;z-index:30;min-width:205px;padding:4px;border:1px solid var(--line);border-radius:7px;background:#111c21;box-shadow:0 10px 28px #000b}
.packed-menu-popup[hidden]{display:none}.packed-menu-popup button{width:100%;display:flex;justify-content:space-between;gap:18px;border:0;background:transparent;text-align:left;padding:6px 9px}.packed-menu-popup button:hover:not(:disabled){background:#29372f}.packed-menu-popup button span{color:var(--muted);font-size:11px}.packed-menu-separator{height:1px;margin:4px;background:var(--line)}
.packed-map-name{max-width:min(42vw,430px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink);font-size:12px}.packed-editor-header .dirty{font-weight:800}.packed-toolbar .status{flex:1;margin-left:4px;font-size:12px}
.packed-toolbar select{display:inline-block;width:auto;min-width:104px;border:1px solid var(--line);border-radius:7px;padding:4px 6px;background:#18272e;color:var(--ink)}.packed-toolbar button.active{background:#7dd3a7;color:#07131d}
.packed-toolbar select{display:inline-block;width:auto;min-width:104px;border:1px solid var(--line);border-radius:7px;padding:4px 6px;background:#18272e;color:var(--ink)}.packed-toolbar button.active{background:#7dd3a7;color:#07131d}
.packed-editor-header+#shell,.shell{height:calc(100vh - 64px)}
@media(max-width:850px){.side.right{top:64px}.packed-map-name{max-width:32vw}.packed-menu-popup{top:29px}}
""".strip()

RELEASE_STYLE = r"""
#releaseEditorButton{margin-left:auto}
#releaseMapPicker{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.08em}
#releaseMenu{border:1px solid #55dbe9;border-radius:8px;padding:6px 8px;background:#17465b;color:var(--ink);font:inherit;font-weight:700;letter-spacing:0}
#releaseEditorShell{position:fixed;inset:0;z-index:1000;background:#07131d}
#releaseEditorShell[hidden]{display:none}
#releaseEditorFrame{display:block;width:100%;height:100%;border:0;background:#0b1216}
""".strip()

RELEASE_EDITOR_SHELL = """
<div id="releaseEditorShell" hidden>
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
function playPackedEditorMap(map,startPoint,profile='standing'){
  const errors=B.validateReferenceEditorMap(map,state.theme);if(errors.length)throw new Error(errors[0]);
  const playable=structuredClone(map);playable.markers={...(playable.markers||{}),start:{x:startPoint.x,y:startPoint.y}};
  state.map=playable;refreshPair();if(!state.behavior)throw new Error('The edited map could not start.');
  if(profile==='raccoonFlight'){state.behavior.setForm('raccoon');Object.assign(state.behavior.player,{runCharge:90,pSpeed:true,flightFrames:150})}
  closePackedEditor();followPlayer(true);return true;
}
function simulatePackedEditorReachability(map,startPoint,options={}){return B.simulateReachability(state.theme,map,startPoint,options)}
window.ReferencePackCloseEditor=closePackedEditor;
window.ReferencePackPlayFromEditor=playPackedEditorMap;
window.ReferencePackSimulateReachability=simulatePackedEditorReachability;
async function bootPackedRelease(){
  if(!PACKED_EXPERIENCES.length){refreshPair();return}
  document.getElementById('releaseEditorButton')?.addEventListener('click',openPackedEditor);
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
    if source.count(EDITOR_HEADER) != 1:
        raise RuntimeError("editor header marker is missing or ambiguous")
    if source.count("</style>") != 1:
        raise RuntimeError("editor style boundary is missing or ambiguous")
    source = source.replace(EDITOR_HEADER, PACKED_EDITOR_HEADER, 1)
    source = source.replace("</style>", PACKED_EDITOR_STYLE + "\n</style>", 1)
    draw_marker = ";drawMarker('start',state.markers.start);"
    pointer_marker = "if(!state.theme)return;\n  const screen=canvasPoint(e),p=worldPoint(e),"
    commit_marker = "function commitDocument(){if(!state.history)return;state.history.push(documentState());updateHistoryUi()}"
    if source.count(draw_marker) != 1 or source.count(pointer_marker) != 1 or source.count(commit_marker) != 1:
        raise RuntimeError("packed editor ephemeral-tool integration marker is missing or ambiguous")
    source = source.replace(draw_marker, ";window.ReferencePackEditorDrawEphemera?.(ctx,state.camera);drawMarker('start',state.markers.start);", 1)
    source = source.replace(pointer_marker, "if(!state.theme)return;\n  const screen=canvasPoint(e),p=worldPoint(e);if(window.ReferencePackEditorHandleTestPoint?.(e,p))return;const ", 1)
    source = source.replace(commit_marker, commit_marker[:-1] + ";window.ReferencePackEditorDocumentChanged?.()}", 1)
    hook = """const packedTestState={point:null,tool:false,ranges:false,result:null,pending:0};
function packedCurrentTest(){
  const document=documentState(),map=semantics.serializeMap(state.theme,document),point=semantics.normalizePointForSingleMap(document,packedTestState.point);
  if(point)map.markers={...(map.markers||{}),start:{...point}};
  return{map,point};
}
function updatePackedTestUi(){
  const ready=!!packedTestState.point,test=$('testPointBtn'),ranges=$('rangesBtn');test?.classList.toggle('active',packedTestState.tool);test?.setAttribute('aria-pressed',String(packedTestState.tool));
  if(ranges){ranges.disabled=!ready;ranges.classList.toggle('active',packedTestState.ranges);ranges.setAttribute('aria-pressed',String(packedTestState.ranges))}$('playFromHereBtn').disabled=!ready;$('clearTestPointBtn').disabled=!ready;
}
function recomputePackedRanges(){
  const request=++packedTestState.pending;packedTestState.result=null;draw();if(!packedTestState.ranges||!packedTestState.point)return;
  setStatus('Computing ranges with the gameplay simulator…');setTimeout(()=>{if(request!==packedTestState.pending)return;const current=packedCurrentTest(),result=window.parent?.ReferencePackSimulateReachability?.(current.map,current.point,{profile:$('testProfile').value});if(request!==packedTestState.pending)return;packedTestState.result=result;setStatus(result?.ok?`Ranges: ${result.samples.length} reachable cells (${result.profile}).`:`Ranges failed: ${result?.errors?.[0]||'runtime unavailable'}`,!result?.ok);draw()},0);
}
window.ReferencePackEditorDrawEphemera=(c,camera)=>{
  const point=packedTestState.point;if(!point)return;const z=camera.zoom,result=packedTestState.result;c.save();if(packedTestState.ranges&&result?.ok){for(const sample of result.samples){c.fillStyle=sample.classification==='flight'?'rgba(192,132,252,.24)':'rgba(52,211,153,.24)';const size=result.cellSize||8;c.fillRect(sample.x-size/2,sample.y-size/2,size,size)}}c.strokeStyle='#ffdf6e';c.fillStyle='#ffdf6e';c.lineWidth=2/z;c.beginPath();c.arc(point.x,point.y,9/z,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(point.x-14/z,point.y);c.lineTo(point.x+14/z,point.y);c.moveTo(point.x,point.y-14/z);c.lineTo(point.x,point.y+14/z);c.stroke();c.beginPath();c.moveTo(point.x,point.y);c.lineTo(point.x,point.y-24/z);c.stroke();c.restore();
};
window.ReferencePackEditorHandleTestPoint=(event,point)=>{if(!packedTestState.tool||event.button!==0)return false;event.preventDefault();packedTestState.point={x:point.x,y:point.y};updatePackedTestUi();if(packedTestState.ranges)recomputePackedRanges();else draw();setStatus(`Test point: ${point.x.toFixed(1)}, ${point.y.toFixed(1)} (exact feet position)`);return true};
window.ReferencePackEditorDocumentChanged=()=>{if(packedTestState.ranges)recomputePackedRanges()};
function focusPackedEditorMap(){\n  const rect=stage.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height),start=state.markers?.start;\n  if(start&&Number.isFinite(start.x)&&Number.isFinite(start.y)){\n    state.camera={x:w*.28-start.x,y:h*.62-start.y,zoom:1};\n    draw();\n    return;\n  }\n  const boxes=[];\n  for(const inst of state.instances){\n    try{const b=instanceBounds(inst);if(b&&[b.x,b.y,b.w,b.h].every(Number.isFinite))boxes.push(b)}catch{}\n  }\n  for(const marker of Object.values(state.markers||{}))if(marker&&Number.isFinite(marker.x)&&Number.isFinite(marker.y))boxes.push({x:marker.x-16,y:marker.y-32,w:32,h:36});\n  if(!boxes.length){state.camera={x:0,y:0,zoom:1};draw();return}\n  const minX=Math.min(...boxes.map(b=>b.x)),minY=Math.min(...boxes.map(b=>b.y)),maxX=Math.max(...boxes.map(b=>b.x+b.w)),maxY=Math.max(...boxes.map(b=>b.y+b.h)),pad=48,contentW=Math.max(1,maxX-minX),contentH=Math.max(1,maxY-minY),zoom=Math.max(.1,Math.min(2,(w-pad*2)/contentW,(h-pad*2)/contentH));\n  state.camera={x:(w-contentW*zoom)/2-minX*zoom,y:(h-contentH*zoom)/2-minY*zoom,zoom};\n  draw();\n}\nfunction installPackedEditorChrome(){\n  const closeMenus=()=>{for(const menu of document.querySelectorAll('.packed-menu-popup'))menu.hidden=true;for(const trigger of document.querySelectorAll('.packed-menu-trigger'))trigger.setAttribute('aria-expanded','false')};\n  for(const trigger of document.querySelectorAll('.packed-menu-trigger'))trigger.onclick=event=>{event.stopPropagation();const menu=$(trigger.dataset.menu),open=menu.hidden;closeMenus();if(open){menu.hidden=false;trigger.setAttribute('aria-expanded','true')}};\n  for(const menu of document.querySelectorAll('.packed-menu-popup'))menu.addEventListener('click',event=>{if(event.target.closest('button'))closeMenus()});\n  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.packed-menu'))closeMenus()});\n  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.querySelector('.packed-menu-popup:not([hidden])')){event.preventDefault();event.stopImmediatePropagation();closeMenus();return}if(!(event.metaKey||event.ctrlKey)||event.altKey||event.shiftKey)return;const key=event.key.toLowerCase();if(key==='o'){event.preventDefault();$('mapFile').click()}else if(key==='s'&&!$('saveMapBtn').disabled){event.preventDefault();$('saveMapBtn').click()}},true);\n  const mapFile=$('mapFile');if(mapFile)mapFile.onchange=async event=>{const file=event.target.files[0];if(file){await openMap(file);if($('status').textContent===`Opened ${file.name}`){const name=$('packedMapName');if(name)name.textContent=file.name}}event.target.value=''};\n  const back=$('backToGameBtn');if(back)back.onclick=()=>window.parent?.ReferencePackCloseEditor?.();\n  $('testPointBtn').onclick=()=>{packedTestState.tool=!packedTestState.tool;if(packedTestState.tool){state.brush=null;setEraserMode(false);setStatus('Test Point tool: click anywhere for an exact, unsnapped feet position.')}updatePackedTestUi()};\n  $('clearTestPointBtn').onclick=()=>{packedTestState.point=null;packedTestState.result=null;packedTestState.ranges=false;packedTestState.pending++;updatePackedTestUi();draw();setStatus('Test point cleared.')};\n  $('rangesBtn').onclick=()=>{packedTestState.ranges=!packedTestState.ranges;updatePackedTestUi();if(packedTestState.ranges)recomputePackedRanges();else{packedTestState.pending++;packedTestState.result=null;draw()}};\n  $('testProfile').onchange=()=>{if(packedTestState.ranges)recomputePackedRanges()};\n  $('playFromHereBtn').onclick=()=>{const current=packedCurrentTest();window.parent?.ReferencePackPlayFromEditor?.(current.map,current.point,$('testProfile').value)};\n  updatePackedTestUi();\n}\ninstallPackedEditorChrome();\nwindow.ReferencePackEditorReleaseLoad=async(theme,map,mapName='packed.llmmap.txt')=>{\n  const themeFile=new File([JSON.stringify(theme)],'theme_marioai_reference_pack.llmtheme.txt',{type:'application/json'});\n  await loadTheme(themeFile);\n  const mapFile=new File([JSON.stringify(map)],mapName,{type:'application/json'});\n  await openMap(mapFile);\n  const name=$('packedMapName');if(name)name.textContent=mapName;\n  focusPackedEditorMap();\n};\n"""
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
