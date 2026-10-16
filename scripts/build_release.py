#!/usr/bin/env python3
"""Build Super LLMario's single-file reference-pack release."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "engine" / "reference_pack_engine.html"
EDITOR = ROOT / "editor" / "reference_pack_editor.html"
THEME = ROOT / "themes" / "theme_marioai_reference_pack.llmtheme.txt"
MAPS = ROOT / "maps"
WORLD_ROOMS = ROOT / "world" / "rooms"
OUTPUT = ROOT / "dist" / "super_llmario.html"
DEFAULT_EXPERIENCE_ID = "demo"
MAP_SUFFIX = ".llmmap.txt"
MAP_FORMAT = "llmario-reference-editor-map"
MAP_VERSION = 1

SCRIPT_BOUNDARY = "</script>\n<script>\n(()=>{\n'use strict';"
RUNTIME_BOOT = "refreshPair();resize();requestAnimationFrame(frame);"
EDITOR_BOOT = "window.addEventListener('resize',resize);resize();renderIssues();\n})();"
EDITOR_HEADER = '<header><b>Reference Pack Editor</b><span class="status" id="status">Load a reference-contract theme to begin.</span><span id="dirty" class="dirty" hidden>● Unsaved</span><span class="spacer"></span><button id="undoBtn" title="Undo (Ctrl/Cmd+Z)" disabled>Undo</button><button id="redoBtn" title="Redo (Ctrl/Cmd+Shift+Z)" disabled>Redo</button><button id="eraserBtn" aria-label="Eraser tool" aria-pressed="false" title="Eraser — drag to remove authored objects">⌫</button><button id="paletteToggle" aria-label="Toggle Palette" aria-pressed="true" title="Show or hide Palette">Palette</button><button id="detailsToggle" aria-label="Toggle Details" aria-pressed="true" title="Show or hide Details">Details</button><button id="openMapBtn" title="Open an authored map">Open…</button><button id="saveMapBtn" title="Save authored map (Ctrl/Cmd+S)" disabled>Save</button><button id="saveAsMapBtn" title="Save authored map as (Ctrl/Cmd+Shift+S)" disabled>Save As…</button><button id="helpBtn" aria-label="Open help" title="Help and shortcuts">?</button><button id="clearBtn" disabled>Clear</button><button id="loadBtn">Theme…</button><input id="themeFile" type="file" accept=".txt,.json,.llmtheme" hidden><input id="mapFile" type="file" accept=".llmmap.txt,.json,.txt" hidden></header>'

PACKED_EDITOR_HEADER = """
<header class="packed-editor-header">
  <div class="packed-menu-row">
    <div class="packed-menu">
      <button class="packed-menu-trigger" type="button" aria-haspopup="true" aria-expanded="false" data-menu="packedFileMenu">File</button>
      <div class="packed-menu-popup" id="packedFileMenu" role="menu" hidden>
        <button id="openMapBtn" role="menuitem" title="Open an authored map">Open map… <span>Ctrl+O</span></button>
        <button id="saveMapBtn" role="menuitem" title="Save authored map" disabled>Save map <span>Ctrl+S</span></button>
        <button id="saveAsMapBtn" role="menuitem" title="Save authored map as" disabled>Save map as… <span>Ctrl+Shift+S</span></button>
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
    <button id="playFromHereBtn" aria-label="Play From Here tool" aria-pressed="false" title="Play from an exact, unsnapped point">Play From Here</button>
    <button id="rangeTestBtn" aria-label="Range Test tool" aria-pressed="false" title="Test real-engine reachability from an exact point">Range Test</button>
    <dialog id="rangeModeDialog" class="range-mode-dialog" aria-labelledby="rangeModeTitle"><strong id="rangeModeTitle">Range Test</strong><button data-range-profile="standing">Standing / Jump</button><button data-range-profile="raccoonFlight">Flight From Here</button><button value="cancel">Cancel</button></dialog>
    <button id="paletteToggle" aria-label="Toggle Palette" aria-pressed="true" title="Show or hide Palette">Palette</button>
    <button id="detailsToggle" aria-label="Toggle Details" aria-pressed="true" title="Show or hide Details">Details</button>
    <button id="helpBtn" aria-label="Open help" title="Help and shortcuts">?</button>
    <span class="status" id="status">Load a reference-contract theme to begin.</span>
  </div>
  <input id="themeFile" type="file" accept=".txt,.json,.llmtheme" hidden><input id="mapFile" type="file" accept=".llmmap.txt,.json,.txt" hidden>
</header>
""".strip()

PACKED_EDITOR_STYLE = r"""
header.packed-editor-header{height:76px;display:grid;grid-template-rows:32px 44px;gap:0;padding:0;background:#111c21;border-bottom:1px solid var(--line)}
.packed-menu-row,.packed-toolbar{display:flex;align-items:center;gap:5px;min-width:0;padding:3px 8px}
.packed-menu-row{position:relative;border-bottom:1px solid #263940}.packed-toolbar{background:#101a1f}
.packed-menu{position:relative;height:100%;display:flex;align-items:center}.packed-menu-trigger{border-color:transparent;background:transparent;padding:4px 9px}
.packed-menu-trigger:hover,.packed-menu-trigger[aria-expanded="true"]{border-color:var(--line);background:#29372f}
.packed-menu-popup{position:absolute;left:0;top:29px;z-index:30;min-width:205px;padding:4px;border:1px solid var(--line);border-radius:7px;background:#111c21;box-shadow:0 10px 28px #000b}
.packed-menu-popup[hidden]{display:none}.packed-menu-popup button{width:100%;display:flex;justify-content:space-between;gap:18px;border:0;background:transparent;text-align:left;padding:6px 9px}.packed-menu-popup button:hover:not(:disabled){background:#29372f}.packed-menu-popup button span{color:var(--muted);font-size:11px}.packed-menu-separator{height:1px;margin:4px;background:var(--line)}
.packed-map-name{max-width:min(42vw,430px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink);font-size:12px}.packed-editor-header .dirty{font-weight:800}.packed-toolbar .status{flex:1;margin-left:4px;font-size:12px}.range-mode-dialog{width:min(280px,calc(100% - 32px));max-width:280px;padding:12px;border:1px solid #f1c84b;border-radius:10px;background:#15242a;color:var(--ink);box-shadow:0 14px 40px #000b}.range-mode-dialog::backdrop{background:#0007}.range-mode-dialog strong{display:block;margin-bottom:8px;color:#ffe477}.range-mode-dialog button{display:block;width:100%;margin-top:6px;text-align:left}
.packed-toolbar select{display:inline-block;width:auto;min-width:104px;border:1px solid var(--line);border-radius:7px;padding:4px 6px;background:#18272e;color:var(--ink)}.packed-toolbar button.active{background:#7dd3a7;color:#07131d}
.packed-editor-header+#shell,.shell{height:calc(100vh - 76px)}
body:not(.plot-mode) .plot-only,body:not(.plot-mode) .plot-help{display:none}body.plot-mode details.map-area{display:none}
.plot-pad{display:grid;grid-template-columns:repeat(3,38px);gap:4px;justify-content:center;margin:8px 0}.plot-pad button{padding:6px 0}.plot-dot{text-align:center;line-height:30px;color:var(--muted)}
.packed-menu-label{padding:4px 9px 2px;color:var(--muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase}
@media(max-width:850px){.side.right{top:76px}.packed-map-name{max-width:32vw}.packed-menu-popup{top:29px}}
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
const PACKED_WORLD_ID='world';
// Plots: your saved screens for the world you're exploring. The working copy lives in this browser, one per world source
// (a seed, or a world file packed from /maps); the editor saves into it and the game rebuilds around you at once.
const WORLD_PLOTS_KEY='super_llmario_world_plots_v1:';
let activeWorldSource=null;
function storedWorldFile(key){try{const text=localStorage.getItem(WORLD_PLOTS_KEY+key);return text?JSON.parse(text):null}catch(_){return null}}
function storeWorldFile(key,file){try{localStorage.setItem(WORLD_PLOTS_KEY+key,JSON.stringify(file));return true}catch(_){return false}}
window.ReferenceWorldPlotsFor=seed=>{activeWorldSource={key:`seed:${seed}`,filename:`world-${seed}.llmmap.txt`};const file=storedWorldFile(activeWorldSource.key);return file?B.worldPlots(file):null};
function screenLabel(cx,cy){const dx=cx?`${cx<0?'←':'→'}${Math.abs(cx)}`:'',dy=cy?`${cy<0?'↑':'↓'}${Math.abs(cy)}`:'';return dx||dy?[dx,dy].filter(Boolean).join(' '):'home'}
function worldCaptureExperience(plotId=null){
  // The editor opens on a plot: the one you're standing in, or a new one-screen plot where you stand.
  const world=state.world,p=state.behavior?.player;if(!world||!p)return null;
  const C=B.WORLD_SCREEN,W=C.cols*C.cell,H=C.rows*C.cell,here=B.worldScreenAt(p.x+p.w/2,p.y+p.h-1),plots=world.plots?.plots||[],inside=(r,s)=>s.cx>=r.cx&&s.cx<r.cx+r.w&&s.cy>=r.cy&&s.cy<r.cy+r.h;
  let plot=(plotId&&plots.find(x=>x.id===plotId))||(!plotId&&plots.find(x=>inside(x,here)));
  if(!plot)plot={id:`plot-${Date.now().toString(36)}`,name:`Plot ${screenLabel(here.cx,here.cy)}`,cx:here.cx,cy:here.cy,w:1,h:1};
  const start=inside(plot,here)?{x:p.x+p.w/2,y:p.y+p.h}:{x:plot.cx*W+5*C.cell,y:plot.cy*H+C.interiorRows*C.cell};
  const {map}=B.worldAreaMap(state.theme,world.def,world.seed,plot,{plots:world.plots,mergeFloors:false,start});
  return{id:PACKED_WORLD_ID,theme:PACKED_THEME,map,filename:activeWorldSource?.filename||`world-${world.seed}.llmmap.txt`,plot:{id:plot.id,name:plot.name,screen:{w:W,h:H}}};
}
window.ReferencePackWorld={
  screens(rect){const w=state.world;return w?B.worldAreaMap(state.theme,w.def,w.seed,rect,{plots:w.plots,mergeFloors:false}).map.instances:[]},
  original(cx,cy){const w=state.world;if(!w)return[];const others={saved:new Map([...(w.plots?.saved||[])].filter(([key])=>key!==`${cx},${cy}`))};return B.worldAreaMap(state.theme,w.def,w.seed,{cx,cy,w:1,h:1},{plots:others,mergeFloors:false}).map.instances},
  isSaved(cx,cy){return!!state.world?.plots?.saved?.has(`${cx},${cy}`)},
  differs(cx,cy,instances){const mine=instances.filter(i=>{const a=B.worldAnchorScreen(i);return a.cx===cx&&a.cy===cy});return this.isSaved(cx,cy)||B.worldScreenKey(mine)!==B.worldScreenKey(this.original(cx,cy))},
  changes(rect,instances){const w=state.world;return w?B.worldSaveScreens(state.theme,w.def,w.seed,w.plots,rect,instances).changed.length:0},
  save(plot,instances){
    const w=state.world;if(!w)return 0;const {plots,changed}=B.worldSaveScreens(state.theme,w.def,w.seed,w.plots,plot,instances);
    const view={id:plot.id,name:plot.name,cx:plot.cx,cy:plot.cy,w:plot.w,h:plot.h},at=plots.plots.findIndex(x=>x.id===plot.id);
    if(at>=0)plots.plots[at]=view;else if(changed.length)plots.plots.push(view);
    const file=B.worldPlotFile(state.theme,w.seed,plots);if(!storeWorldFile(activeWorldSource.key,file))report('Plots saved for this session only: browser storage is unavailable or full.');
    setWorldPlots(B.worldPlots(file));return changed.length;
  },
  plots(){return structuredClone(state.world?.plots?.plots||[])},
  open(plotId){return worldCaptureExperience(plotId)},
  file(){const w=state.world;return w?{text:JSON.stringify(B.worldPlotFile(state.theme,w.seed,w.plots||{saved:new Map(),plots:[]})),filename:activeWorldSource?.filename||`world-${w.seed}.llmmap.txt`}:null}
};
async function loadPackedExperienceIntoEditor(experience){
  const frame=document.getElementById('releaseEditorFrame');
  if(!frame?.dataset.loaded)return;
  if(state.world)experience=worldCaptureExperience();if(!experience)return;
  try{await frame.contentWindow?.ReferencePackEditorReleaseLoad?.(experience.theme,experience.map,experience.filename,experience.plot||null)}
  catch(error){report(`Embedded editor failed: ${error.message||error}`)}
}
async function startPackedWorld(experience=null){
  // The plain World uses seed 1987; a world file from /maps brings its own seed and plots. Either way the browser's working
  // copy, once there is one, wins over the packed starting point.
  state.theme=PACKED_THEME;await loadAtlases();
  const seed=experience?.map?.world?.seed??1987,key=experience?`file:${experience.id}`:`seed:${seed}`;
  activeWorldSource={key,filename:experience?experience.filename:`world-${seed}.llmmap.txt`};
  const source=storedWorldFile(key)||experience?.map||null,errors=startWorld(PACKED_WORLD,{seed,plots:source?B.worldPlots(source):null});
  if(errors.length){report(errors);return false}
  activePackedExperienceId=experience?experience.id:PACKED_WORLD_ID;const menu=document.getElementById('releaseMenu');if(menu)menu.value=activePackedExperienceId;return true;
}
async function applyPackedExperience(experience){
  if(!experience)throw new Error('Unknown packed experience.');
  if(experience.map?.world)return startPackedWorld(experience);
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
  if(frame.dataset.loaded){if(state.world)void loadPackedExperienceIntoEditor({id:PACKED_WORLD_ID});return}
  frame.onload=async()=>{frame.dataset.loaded='1';const experience=state.world?{id:PACKED_WORLD_ID}:PACKED_EXPERIENCES.find(item=>item.id===activePackedExperienceId)||PACKED_EXPERIENCES[0];await loadPackedExperienceIntoEditor(experience)};
  frame.srcdoc=PACKED_EDITOR_HTML;
}
function closePackedEditor(){
  const shell=document.getElementById('releaseEditorShell');if(shell)shell.hidden=true;
}
async function playPackedEditorMap({theme,map,startPoint,profile='standing'}){
  const errors=B.validateReferencePair(theme,map);if(errors.length)throw new Error(errors[0]);
  const playable=structuredClone(map);playable.markers={...(playable.markers||{}),start:{x:startPoint.x,y:startPoint.y}};
  state.theme=structuredClone(theme);state.map=playable;await loadAtlases();refreshPair();if(!state.behavior)throw new Error('The edited map could not start.');
  if(profile==='raccoonFlight'){state.behavior.setForm('raccoon');Object.assign(state.behavior.player,{runCharge:90,pSpeed:true,flightFrames:150})}
  closePackedEditor();followPlayer(true);return true;
}
function simulatePackedEditorReachability({theme,map,startPoint,profile='standing'}){return B.simulateReachability(theme,map,startPoint,{profile})}
window.ReferencePackCloseEditor=closePackedEditor;
window.ReferencePackPlayFromEditor=playPackedEditorMap;
window.ReferencePackSimulateReachability=simulatePackedEditorReachability;
async function bootPackedRelease(){
  if(!PACKED_EXPERIENCES.length){refreshPair();return}
  document.getElementById('releaseEditorButton')?.addEventListener('click',openPackedEditor);
  const menu=document.getElementById('releaseMenu'),picker=document.getElementById('releaseMapPicker');
  if(menu){
    for(const experience of PACKED_EXPERIENCES){const option=document.createElement('option');option.value=experience.id;option.textContent=experience.map?.world?`World · ${experience.label}`:experience.label;menu.append(option)}
    if(PACKED_WORLD?.rooms?.length){const option=document.createElement('option');option.value=PACKED_WORLD_ID;option.textContent='World (explore)';menu.append(option)}
    menu.addEventListener('change',()=>{if(menu.value===PACKED_WORLD_ID){void startPackedWorld();return}const experience=PACKED_EXPERIENCES.find(item=>item.id===menu.value);if(experience)void applyPackedExperience(experience)});
  }
  if(picker)picker.hidden=PACKED_EXPERIENCES.length+(PACKED_WORLD?.rooms?.length?1:0)<2;
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
    if source.count(draw_marker) != 1 or source.count(pointer_marker) != 1:
        raise RuntimeError("packed editor ephemeral-tool integration marker is missing or ambiguous")
    source = source.replace(draw_marker, ";window.ReferencePackEditorDrawEphemera?.(ctx,state.camera);drawMarker('start',state.markers.start);", 1)
    source = source.replace(pointer_marker, "if(!state.theme)return;\n  const screen=canvasPoint(e),p=worldPoint(e);if(window.ReferencePackEditorHandleTestPoint?.(e,p))return;const ", 1)
    hook = """const packedTestState={point:null,profile:null,result:null,pending:0};
function packedCurrentTest(point=packedTestState.point){
  const document=documentState(),theme=structuredClone(state.theme),map=semantics.serializeMap(theme,document),normalized=semantics.normalizePointForSingleMap(document,point);
  if(normalized)map.markers={...(map.markers||{}),start:{...normalized}};
  return{theme,map,startPoint:normalized,profile:packedTestState.profile||'standing'};
}
function updatePackedTestUi(){
  const play=$('playFromHereBtn'),range=$('rangeTestBtn'),playActive=state.tool==='playFromHere',rangeActive=state.tool==='rangeTest';
  play.classList.toggle('active',playActive);play.setAttribute('aria-pressed',String(playActive));range.classList.toggle('active',rangeActive);range.setAttribute('aria-pressed',String(rangeActive));range.textContent=rangeActive?(packedTestState.profile==='raccoonFlight'?'Range: Flight':'Range: Standing'):'Range Test';
}
function recomputePackedRanges(){
  const request=++packedTestState.pending;packedTestState.result=null;draw();if(state.tool!=='rangeTest'||!packedTestState.point)return;
  setStatus('Computing range with the gameplay simulator…');setTimeout(()=>{if(request!==packedTestState.pending)return;const result=window.parent?.ReferencePackSimulateReachability?.(packedCurrentTest());if(request!==packedTestState.pending)return;packedTestState.result=result;setStatus(result?.ok?packedRangeSummary(result):`Range failed: ${result?.errors?.[0]||'runtime unavailable'}`,!result?.ok);draw()},0);
}
function packedRangeSummary(result){
  const spans=result.spans||[],reached=spans.filter(span=>span.hop!==null).length,near=spans.filter(span=>span.hop!==null&&span.hop<=1).length,pipes=new Set((result.edges||[]).filter(edge=>edge.kind==='pipe').map(edge=>edge.pipe)).size,pockets=(result.pockets||[]).filter(pocket=>!pocket.containsGoal).length;
  return`Range (${packedTestState.profile==='raccoonFlight'?'Flight From Here':'Standing / Jump'}): ${reached}/${spans.length} surfaces reachable · ${near} within one move · ${pipes} pipe route${pipes===1?'':'s'}${pockets?` · ${pockets} pocket${pockets===1?'':'s'} with no way back`:''}${result.goal?(result.goal.reachable?` · goal reachable (${result.goal.hop} hop${result.goal.hop===1?'':'s'})`:' · goal NOT reachable'):''}${result.stats?.truncated?' · search budget hit, partial result':''}.`;
}
window.ReferencePackEditorDrawEphemera=(c,camera)=>{
  const point=packedTestState.point,result=packedTestState.result;if(!point||!result?.ok)return;const z=camera.zoom,size=result.cellSize||8,spans=result.spans||[],pocketSpans=new Set((result.pockets||[]).filter(pocket=>!pocket.containsGoal).flatMap(pocket=>pocket.spans));
  // Results live in the serialized map's space; shift them back onto the editor's world coordinates.
  c.save();c.translate(point.x-(result.startPoint?.x??point.x),point.y-(result.startPoint?.y??point.y));
  for(const sample of result.samples){c.fillStyle=sample.classification==='flight'?'rgba(192,132,252,.22)':'rgba(52,211,153,.22)';c.fillRect(sample.x-size/2,sample.y-size/2,size,size)}
  // Surface bars: gold = where you stand, mint = one move away, violet = further (labelled with move count), red = unreachable or a pocket.
  c.lineCap='round';c.textAlign='center';c.textBaseline='bottom';c.font=`bold ${11/z}px system-ui,sans-serif`;
  for(const span of spans){const hop=span.hop,color=hop===null?'rgba(255,107,107,.6)':pocketSpans.has(span.id)?'#ff6b6b':hop===0?'#ffdf6e':hop===1?'#7dd3a7':'#b78cff';c.beginPath();c.moveTo(span.x,span.y);c.lineTo(span.x+span.w,span.y);c.lineWidth=(hop===null?4:8)/z;c.strokeStyle='rgba(6,12,16,.8)';c.stroke();c.lineWidth=(hop===null?2:5)/z;c.strokeStyle=color;c.stroke();if(hop>0){c.lineWidth=3/z;c.strokeStyle='rgba(6,12,16,.9)';c.strokeText(String(hop),span.x+span.w/2,span.y-5/z);c.fillStyle=color;c.fillText(String(hop),span.x+span.w/2,span.y-5/z)}}
  const drawnPipes=new Set();c.setLineDash([6/z,5/z]);c.lineWidth=1.5/z;c.strokeStyle='rgba(192,132,252,.9)';for(const edge of result.edges||[]){if(edge.kind!=='pipe'||!edge.entry||drawnPipes.has(edge.pipe))continue;drawnPipes.add(edge.pipe);c.beginPath();c.moveTo(edge.entry.x,edge.entry.y);c.lineTo(edge.landing.x,edge.landing.y);c.stroke();c.beginPath();c.arc(edge.landing.x,edge.landing.y,4/z,0,Math.PI*2);c.stroke()}
  c.strokeStyle='#ff6b6b';for(const pocket of result.pockets||[]){if(pocket.containsGoal)continue;const members=pocket.spans.map(id=>spans[id]).filter(Boolean);if(!members.length)continue;const x=Math.min(...members.map(s=>s.x))-8,y=Math.min(...members.map(s=>s.y))-40,r=Math.max(...members.map(s=>s.x+s.w))+8,b=Math.max(...members.map(s=>s.y))+8;c.strokeRect(x,y,r-x,b-y)}
  c.setLineDash([]);c.restore();c.save();c.strokeStyle='#ffdf6e';c.fillStyle='#ffdf6e';c.lineWidth=2/z;c.beginPath();c.arc(point.x,point.y,9/z,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(point.x-14/z,point.y);c.lineTo(point.x+14/z,point.y);c.moveTo(point.x,point.y-14/z);c.lineTo(point.x,point.y+14/z);c.stroke();c.beginPath();c.moveTo(point.x,point.y);c.lineTo(point.x,point.y-24/z);c.stroke();c.restore();
};
window.ReferencePackEditorHandleTestPoint=(event,point)=>{if(!['playFromHere','rangeTest'].includes(state.tool)||event.button!==0)return false;event.preventDefault();const chosen={x:point.x,y:point.y};if(state.tool==='playFromHere'){const current=packedCurrentTest(chosen);selectEditorTool('select');setStatus(`Playing from ${point.x.toFixed(1)}, ${point.y.toFixed(1)}…`);void window.parent?.ReferencePackPlayFromEditor?.(current)}else{packedTestState.point=chosen;recomputePackedRanges()}return true};
window.ReferencePackEditorDocumentChanged=kind=>{if(kind==='themeLoad'||kind==='mapLoad'){packedTestState.point=null;packedTestState.result=null;packedTestState.pending++;selectEditorTool('select',null,{render:false});updatePackedTestUi();draw()}else if(state.tool==='rangeTest'&&packedTestState.point)recomputePackedRanges()};
window.ReferencePackEditorToolChanged=tool=>{if(tool!=='rangeTest')packedTestState.pending++;updatePackedTestUi()};
function focusPackedEditorMap(){
  const rect=stage.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height),start=state.markers?.start;
  if(start&&Number.isFinite(start.x)&&Number.isFinite(start.y)){
    state.camera={x:w*.28-start.x,y:h*.62-start.y,zoom:1};
    draw();
    return;
  }
  const boxes=[];
  for(const inst of state.instances){
    try{const b=instanceBounds(inst);if(b&&[b.x,b.y,b.w,b.h].every(Number.isFinite))boxes.push(b)}catch{}
  }
  for(const marker of Object.values(state.markers||{}))if(marker&&Number.isFinite(marker.x)&&Number.isFinite(marker.y))boxes.push({x:marker.x-16,y:marker.y-32,w:32,h:36});
  if(!boxes.length){state.camera={x:0,y:0,zoom:1};draw();return}
  const minX=Math.min(...boxes.map(b=>b.x)),minY=Math.min(...boxes.map(b=>b.y)),maxX=Math.max(...boxes.map(b=>b.x+b.w)),maxY=Math.max(...boxes.map(b=>b.y+b.h)),pad=48,contentW=Math.max(1,maxX-minX),contentH=Math.max(1,maxY-minY),zoom=Math.max(.1,Math.min(2,(w-pad*2)/contentW,(h-pad*2)/contentH));
  state.camera={x:(w-contentW*zoom)/2-minX*zoom,y:(h-contentH*zoom)/2-minY*zoom,zoom};
  draw();
}
function installPackedEditorChrome(){
  const closeMenus=()=>{for(const menu of document.querySelectorAll('.packed-menu-popup'))menu.hidden=true;for(const trigger of document.querySelectorAll('.packed-menu-trigger'))trigger.setAttribute('aria-expanded','false')};
  for(const trigger of document.querySelectorAll('.packed-menu-trigger'))trigger.onclick=event=>{event.stopPropagation();const menu=$(trigger.dataset.menu),open=menu.hidden;closeMenus();if(open){menu.hidden=false;trigger.setAttribute('aria-expanded','true')}};
  for(const menu of document.querySelectorAll('.packed-menu-popup'))menu.addEventListener('click',event=>{if(event.target.closest('button'))closeMenus()});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.packed-menu'))closeMenus()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.querySelector('.packed-menu-popup:not([hidden])')){event.preventDefault();event.stopImmediatePropagation();closeMenus();return}if(!(event.metaKey||event.ctrlKey)||event.altKey||event.shiftKey)return;const key=event.key.toLowerCase();if(key==='o'){event.preventDefault();$('mapFile').click()}else if(key==='s'&&!$('saveMapBtn').disabled){event.preventDefault();$('saveMapBtn').click()}},true);
  const mapFile=$('mapFile');if(mapFile)mapFile.onchange=async event=>{const file=event.target.files[0];if(file){await openMap(file);if($('status').textContent===`Opened ${file.name}`){const name=$('packedMapName');if(name)name.textContent=file.name}}event.target.value=''};
  const back=$('backToGameBtn');if(back)back.onclick=()=>window.parent?.ReferencePackCloseEditor?.();
  $('playFromHereBtn').onclick=()=>{const active=state.tool==='playFromHere';selectEditorTool(active?'select':'playFromHere');if(!active)setStatus('Play From Here: click any exact, unsnapped feet position.')};
  $('rangeTestBtn').onclick=()=>{if(state.tool==='rangeTest'){selectEditorTool('select');setStatus('Range Test off.');return}$('rangeModeDialog').showModal()};
  $('rangeModeDialog').addEventListener('click',event=>{const profile=event.target.dataset.rangeProfile;if(!profile){if(event.target.value==='cancel')$('rangeModeDialog').close();return}packedTestState.profile=profile;$('rangeModeDialog').close();selectEditorTool('rangeTest');setStatus(`${profile==='raccoonFlight'?'Flight From Here':'Standing / Jump'}: click anywhere to calculate; click again to replace the origin.`)});
  updatePackedTestUi();
}
installPackedEditorChrome();
window.ReferencePackEditorReleaseLoad=async(theme,map,mapName='packed.llmmap.txt',plot=null)=>{
  const themeFile=new File([JSON.stringify(theme)],'theme_marioai_reference_pack.llmtheme.txt',{type:'application/json'});
  await loadTheme(themeFile);
  await loadPlotMap(map,mapName,plot);
};
// Plots (World only). The view is the plot: its rectangle of screens is always the map area, so undoing an Add screen
// shrinks it back. The editor keeps every map's top-left at 0,0, so the plot's world position (the screen at its top-left)
// is tracked per history entry, and edits cross to the game in world coordinates. The game owns the world; this side asks
// it for screens and hands it edits to save.
const plotUi={plot:null,mapName:'',pointer:null,origin:{cx:0,cy:0},originAt:[]};
const worldDocumentChanged=window.ReferencePackEditorDocumentChanged;
window.ReferencePackEditorDocumentChanged=kind=>{
  worldDocumentChanged?.(kind);if(!plotUi.plot||!state.history)return;const index=state.history.state().index;
  if(kind==='history'){const origin=plotUi.originAt[index];if(origin)plotUi.origin={...origin};renderPlotUi()}else plotUi.originAt[index]={...plotUi.origin};
};
function shiftInstances(instances,dx,dy){return instances.map(i=>{const values=structuredClone(i.values);values['transform.x']+=dx;values['transform.y']+=dy;const d=values['pipe.destination'];if(d?.kind==='point')values['pipe.destination']={...d,x:d.x+dx,y:d.y+dy};return{...i,values}})}
function plotOffset(){const s=plotUi.plot.screen;return{x:plotUi.origin.cx*s.w,y:plotUi.origin.cy*s.h}}
function toWorld(instances){const o=plotOffset();return shiftInstances(instances,o.x,o.y)}
function fromWorld(instances){const o=plotOffset();return shiftInstances(instances,-o.x,-o.y)}
const worldApi=()=>window.parent?.ReferencePackWorld;
async function loadPlotMap(map,mapName,plot){
  state.history?.markClean();
  if(!plot)await openMap(new File([JSON.stringify(map)],mapName,{type:'application/json'}));
  else{
    // Plot edges are screen-aligned by definition, so a sprite overhanging a screen edge is fine here; ordinary maps keep
    // openMap's rule that the map area contains everything.
    applyDocument({worldBounds:map.worldBounds,instances:map.instances,markers:map.markers});selectEditorTool('select',null,{render:false});state.gesture=null;
    state.history.reset(documentState());state.mapFileHandle=null;state.mapFileName=mapName;updateHistoryUi();renderPalette();renderParameters();recomputeIssues();draw();setStatus(`Editing ${plot.name}`);notifyEditorDocumentChanged('mapLoad');
  }
  plotUi.plot=plot;plotUi.mapName=mapName;if(plot){const b=map.worldBounds;plotUi.origin={cx:Math.round(b.x/plot.screen.w),cy:Math.round(b.y/plot.screen.h)};plotUi.originAt=[{...plotUi.origin}]}document.body.classList.toggle('plot-mode',!!plot);
  const name=$('packedMapName');if(name)name.textContent=plot?`${plot.name} · ${mapName}`:mapName;
  renderPlotUi();focusPackedEditorMap();
}
function plotRect(){const s=plotUi.plot.screen,b=state.worldBounds;return{cx:plotUi.origin.cx,cy:plotUi.origin.cy,w:Math.max(1,Math.round(b.w/s.w)),h:Math.max(1,Math.round(b.h/s.h))}}
function anchorScreen(i){const s=plotUi.plot.screen,o=plotOffset();return{cx:Math.floor((i.values['transform.x']+o.x)/s.w),cy:Math.floor((i.values['transform.y']+o.y-1)/s.h)}}
function renderPlotUi(){
  if(!plotUi.plot)return;const r=plotRect();$('plotSize').textContent=`${r.w} × ${r.h} screen${r.w*r.h===1?'':'s'}`;
  const list=$('plotList');list.textContent='';
  const plots=worldApi()?.plots()||[];if(!plots.some(x=>x.id===plotUi.plot.id))plots.push({id:plotUi.plot.id,name:`${plotUi.plot.name} (new)`});
  for(const item of plots){const button=document.createElement('button');button.setAttribute('role','menuitem');button.dataset.plot=item.id;button.textContent=`${item.id===plotUi.plot.id?'✓ ':''}${item.name}`;list.append(button)}
}
function growPlot(direction){
  const r=plotRect(),s=plotUi.plot.screen,strip=direction==='left'?{cx:r.cx-1,cy:r.cy,w:1,h:r.h}:direction==='right'?{cx:r.cx+r.w,cy:r.cy,w:1,h:r.h}:direction==='up'?{cx:r.cx,cy:r.cy-1,w:r.w,h:1}:{cx:r.cx,cy:r.cy+r.h,w:r.w,h:1};
  const next={cx:Math.min(r.cx,strip.cx),cy:Math.min(r.cy,strip.cy),w:direction==='left'||direction==='right'?r.w+1:r.w,h:direction==='up'||direction==='down'?r.h+1:r.h};
  const doc=documentState(),added=fromWorld(worldApi()?.screens(strip)||[]);
  applyDocument({...doc,worldBounds:{x:(next.cx-r.cx)*s.w,y:(next.cy-r.cy)*s.h,w:next.w*s.w,h:next.h*s.h},instances:[...doc.instances,...added]});
  plotUi.origin={cx:next.cx,cy:next.cy};commitDocument();renderBounds();recomputeIssues();renderPlotUi();draw();setStatus(`Added a screen ${direction==='up'?'above':direction==='down'?'below':`to the ${direction}`}.`);
}
function pointedScreen(){const r=plotRect(),p=plotUi.pointer,s=plotUi.plot.screen,o=plotOffset();const at=p&&{cx:Math.floor((p.x+o.x)/s.w),cy:Math.floor((p.y+o.y)/s.h)};return at&&at.cx>=r.cx&&at.cx<r.cx+r.w&&at.cy>=r.cy&&at.cy<r.cy+r.h?at:r.w*r.h===1?{cx:r.cx,cy:r.cy}:null}
function restoreScreens(screens){
  const keys=new Set(screens.map(s=>`${s.cx},${s.cy}`)),doc=documentState();
  const kept=doc.instances.filter(i=>{const a=anchorScreen(i);return!keys.has(`${a.cx},${a.cy}`)}),original=fromWorld(screens.flatMap(s=>worldApi()?.original(s.cx,s.cy)||[]));
  applyDocument({...doc,instances:[...kept,...original]});commitDocument();state.selected=null;renderParameters();recomputeIssues();draw();
}
function askPlotSave(count){
  return new Promise(resolve=>{const dialog=$('plotSaveDialog');$('plotSaveText').textContent=`Save changes to ${count} screen${count===1?'':'s'}?`;dialog.onclose=()=>resolve(dialog.returnValue||'cancel');dialog.returnValue='';dialog.showModal()});
}
async function settlePlot(){
  // Before leaving a plot (back to the game, or to another plot): save, discard or stay.
  if(!plotUi.plot||!state.history?.state().dirty)return true;
  const rect=plotRect(),instances=toWorld(documentState().instances),count=worldApi()?.changes(rect,instances)||0;
  if(count){const choice=await askPlotSave(count);if(choice==='cancel')return false;if(choice==='save')worldApi()?.save({...rect,id:plotUi.plot.id,name:plotUi.plot.name},instances)}
  state.history.markClean();updateHistoryUi();return true;
}
(function installPlotUi(){
  const mapArea=$('boundsX')?.closest('details');mapArea?.classList.add('map-area');
  mapArea?.insertAdjacentHTML('afterend','<details class="box plot-only" id="plotArea" open><summary><h3 style="display:inline">Plot area</h3></summary><div id="plotSize" class="mini"></div><div class="plot-pad"><span></span><button data-grow="up" title="Add screen above">↑</button><span></span><button data-grow="left" title="Add screen to the left">←</button><span class="plot-dot" aria-hidden="true">▦</span><button data-grow="right" title="Add screen to the right">→</button><span></span><button data-grow="down" title="Add screen below">↓</button><span></span></div><div class="mini">Add screen: each arrow adds one whole screen. Only screens you change are saved.</div></details>');
  $('plotArea').addEventListener('click',event=>{const direction=event.target.closest('[data-grow]')?.dataset.grow;if(direction)growPlot(direction)});
  $('packedEditMenu').insertAdjacentHTML('beforeend','<div class="packed-menu-separator plot-only"></div><button id="restoreScreenBtn" class="plot-only" role="menuitem" title="Put the screen you last pointed at back the way the world made it">Restore original</button><button id="restorePlotBtn" class="plot-only" role="menuitem">Restore all screens in this plot</button><div class="packed-menu-separator plot-only"></div><div class="packed-menu-label plot-only">Plots</div><div id="plotList" class="plot-only"></div>');
  $('packedFileMenu').insertAdjacentHTML('beforeend','<div class="packed-menu-separator plot-only"></div><button id="saveWorldBtn" class="plot-only" role="menuitem" title="Download every saved screen of this world as one .llmmap.txt; drop it in /maps to make it part of the game">Save world file…</button>');
  document.body.insertAdjacentHTML('beforeend','<dialog id="plotSaveDialog" class="range-mode-dialog"><form method="dialog"><strong id="plotSaveText">Save changes?</strong><button value="save">Save</button><button value="discard">Discard</button><button value="cancel">Cancel</button></form></dialog>');
  $('helpDialog').querySelector('ul')?.insertAdjacentHTML('afterend','<h3 class="plot-help">Plots (World)</h3><ul class="plot-help"><li>Press <b>Editor</b> while exploring to change the screen you’re standing on. Use <b>Add screen ← ↑ → ↓</b> in the side panel to reach the screens around it.</li><li>Only screens you actually change are saved; looking around changes nothing. A saved screen stays exactly as you left it, whatever the world does around it.</li><li>Each editing visit is a <b>plot</b>: a named place you can jump back to from <b>Edit ▸ Plots</b>. Plots are just bookmarks.</li><li>To undo your work on a screen for good, use <b>Edit ▸ Restore original</b>.</li><li>Your plots live in this browser. Use <b>File ▸ Save world file</b> to keep a copy, and drop the file in <code>/maps</code> to make it part of the game.</li></ul>');
  canvas.addEventListener('pointermove',event=>{plotUi.pointer=worldPoint(event)});canvas.addEventListener('pointerdown',event=>{plotUi.pointer=worldPoint(event)});
  document.querySelector('[data-menu="packedEditMenu"]').addEventListener('click',()=>{
    if(!plotUi.plot)return;const at=pointedScreen(),instances=toWorld(documentState().instances),api=worldApi(),screen=$('restoreScreenBtn');
    screen.disabled=!at||!api?.differs(at.cx,at.cy,instances);screen.textContent=at?'Restore original':'Restore original (point at a screen first)';
    const r=plotRect();let any=false;for(let y=r.cy;y<r.cy+r.h&&!any;y++)for(let x=r.cx;x<r.cx+r.w&&!any;x++)any=!!api?.differs(x,y,instances);$('restorePlotBtn').disabled=!any;renderPlotUi();
  });
  $('restoreScreenBtn').onclick=()=>{const at=pointedScreen();if(at&&confirm('Restore this screen? Your changes here will be lost.')){restoreScreens([at]);setStatus('Screen restored to the original.')}};
  $('restorePlotBtn').onclick=()=>{const r=plotRect(),all=[];for(let y=r.cy;y<r.cy+r.h;y++)for(let x=r.cx;x<r.cx+r.w;x++)all.push({cx:x,cy:y});if(confirm(`Restore all ${all.length} screen${all.length===1?'':'s'} in this plot? Your changes here will be lost.`)){restoreScreens(all);setStatus('Plot restored to the original.')}};
  $('plotList').addEventListener('click',async event=>{const id=event.target.closest('[data-plot]')?.dataset.plot;if(!id||id===plotUi.plot?.id||!await settlePlot())return;const next=worldApi()?.open(id);if(next)await loadPlotMap(next.map,next.filename,next.plot)});
  $('saveWorldBtn').onclick=()=>{const file=worldApi()?.file();if(!file)return;const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([file.text],{type:'text/plain'}));link.download=file.filename;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);setStatus(`Saved ${file.filename}. Drop it in /maps to make it part of the game.`)};
  const back=$('backToGameBtn');if(back)back.onclick=async()=>{if(await settlePlot())window.parent?.ReferencePackCloseEditor?.()};
  // ASCII sketch for plots: the export carries a screen map and the edge rules as @note lines (the codec ignores them),
  // Apply keeps the plot's exact size, and the reachability checker reports places you can't get back from.
  const screenName=(x,y)=>{let n=x,name='';do{name=String.fromCharCode(65+n%26)+name;n=Math.floor(n/26)-1}while(n>=0);return`${name}${y+1}`};
  $('asciiOpenBtn').onclick=()=>{
    openAsciiSketch();if(!plotUi.plot)return;const r=plotRect(),s=plotUi.plot.screen,api=worldApi(),text=$('asciiText').value;
    const origin=(text.match(/^@origin\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)/m)||[0,0,0]).slice(1).map(Number),col=px=>Math.round((px-origin[0])/16),row=px=>Math.round((px-origin[1])/16);
    const grid=[];for(let y=0;y<r.h;y++)grid.push(Array.from({length:r.w},(_,x)=>`${screenName(x,y)}${api?.isSaved(r.cx+x,r.cy+y)?'*':''}`).join(' '));
    const ranges=[];for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++)ranges.push(`${screenName(x,y)} = columns ${col(x*s.w)}–${col((x+1)*s.w)-1}, rows ${row(y*s.h)}–${row((y+1)*s.h)-1}`);
    const notes=[`@note Plot "${plotUi.plot.name}": ${r.w} × ${r.h} screens, each 40 columns × 24 rows. Keep the grid exactly this size; Apply refuses any other.`,
      `@note Screens (* = saved; the rest are what the world generated): ${grid.join(' / ')}`,`@note ${ranges.join('; ')}.`,
      '@note Edges: where a screen meets the world outside this plot, keep its floor in the bottom 4 rows of the screen (rows 20–23 of it). A hole in a floor belongs at columns 17–22 of that screen and needs a way back up from below.'];
    const lines=text.split('\\n');lines.splice(1,0,...notes);$('asciiText').value=lines.join('\\n');
    $('asciiInfo').textContent+=` Screens are labelled in the @note lines, so you can say "redo B2".`;
  };
  $('asciiApplyBtn').onclick=()=>{
    if(!plotUi.plot){applyAsciiSketch();return}
    let converted;try{converted=window.LLMarioAscii.asciiToMap($('asciiText').value,state.theme)}catch(error){$('asciiInfo').textContent=`Not applied: ${error.message}`;return}
    const envelope=converted.map,errors=semantics.validateMap(state.theme,envelope),r=plotRect(),s=plotUi.plot.screen,b=envelope.worldBounds;
    if(errors.length){$('asciiInfo').textContent=`Not applied: ${errors[0]}`;return}
    if(!b||b.w!==r.w*s.w||b.h!==r.h*s.h){$('asciiInfo').textContent=`Not applied: this plot is ${r.w} × ${r.h} screens (${r.w*40} × ${r.h*24} cells) and the sketch is ${b?`${b.w/16} × ${b.h/16}`:'an unknown size'}. Keep the size; use Add screen for more room.`;return}
    const before=documentState();applyDocument({worldBounds:b,instances:envelope.instances,markers:{start:envelope.markers?.start||before.markers.start,goal:envelope.markers?.goal||null}});
    selectEditorTool('select',null,{render:false});state.selected=null;state.gesture=null;if(documentChanged(before))commitDocument();renderPalette();renderParameters();recomputeIssues();draw();$('asciiDialog').close();
    setStatus(`Applied ASCII sketch: ${envelope.instances.length} objects. ${plotCheck()} Undo restores the previous plot.`);
  };
  function plotCheck(){
    // Reachability inside this plot from the start marker (where you stood). Neighbouring screens aren't included, so a
    // way back that runs through the world outside the plot shows up here as a pocket.
    const start=state.markers?.start,simulate=window.parent?.ReferencePackSimulateReachability;if(!start||!simulate)return'';
    let result;try{result=simulate({theme:state.theme,map:semantics.serializeMap(state.theme,documentState()),startPoint:start})}catch(_){return''}
    const s=plotUi.plot.screen,places=(result.pockets||[]).filter(p=>!p.containsOrigin).map(p=>{const span=result.spans[p.spans[0]];return`${screenName(Math.floor(span.x/s.w),Math.floor(span.y/s.h))} (column ${Math.round(span.x/16)}, row ${Math.round(span.y/16)})`});
    return places.length?`Checker: ${places.length} place${places.length===1?'':'s'} you can't get back from inside this plot: ${places.slice(0,4).join(', ')}${places.length>4?', …':''}.`:'Checker: nowhere reachable inside this plot traps you.';
  }
  const plainDraw=draw;draw=function(){
    // Dotted lines on every screen seam; gold where the screen is saved, so you can see where your work is.
    plainDraw();if(!plotUi.plot||!state.theme)return;const r=plotRect(),s=plotUi.plot.screen,cam=state.camera,api=worldApi();
    ctx.save();ctx.setTransform(state.dpr,0,0,state.dpr,0,0);ctx.translate(cam.x,cam.y);ctx.scale(cam.zoom,cam.zoom);ctx.lineWidth=1.5/cam.zoom;ctx.setLineDash([6/cam.zoom,5/cam.zoom]);
    for(let y=r.cy;y<r.cy+r.h;y++)for(let x=r.cx;x<r.cx+r.w;x++){ctx.strokeStyle=api?.isSaved(x,y)?'rgba(241,200,75,.95)':'rgba(255,255,255,.5)';ctx.strokeRect((x-r.cx)*s.w,(y-r.cy)*s.h,s.w,s.h)}
    ctx.restore();
  };
})();
"""
    return source.replace(EDITOR_BOOT, "window.addEventListener('resize',resize);resize();renderIssues();\n" + hook + "})();", 1)


def load_world() -> object:
    # Rooms are ASCII sketches; the editor's codec (JavaScript) compiles them, so the build asks Node for the result.
    if not WORLD_ROOMS.is_dir() or not any(WORLD_ROOMS.glob("*.llmroom.txt")):
        return {"format": "llmario-world-rooms", "version": 1, "rooms": []}
    completed = subprocess.run(["node", str(ROOT / "scripts" / "world_rooms.js"), str(WORLD_ROOMS)], cwd=ROOT, capture_output=True, text=True)
    if completed.returncode != 0:
        raise RuntimeError(f"world rooms failed to compile: {completed.stderr.strip()}")
    return json.loads(completed.stdout)


def release_data(theme: object, experiences: list[dict[str, object]], editor_html: str, world: object) -> str:
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
            f"const PACKED_WORLD = {javascript_json_parse(world)};",
            f"const PACKED_EDITOR_HTML = {javascript_string(editor_html)};",
            "</script>",
        )
    )


def build(engine: str, editor: str, theme: object, experiences: list[dict[str, object]], world: object) -> str:
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
    output = output.replace(SCRIPT_BOUNDARY, "</script>\n" + release_data(theme, experiences, packed_editor, world) + "\n<script>\n(()=>{\n'use strict';", 1)
    output = output.replace(RUNTIME_BOOT, RELEASE_RUNTIME + "\nbootPackedRelease();resize();requestAnimationFrame(frame);", 1)
    return output


def main() -> int:
    theme = load_document(THEME)
    experiences = load_experiences(theme)
    world = load_world()
    output = build(ENGINE.read_text(encoding="utf-8"), EDITOR.read_text(encoding="utf-8"), theme, experiences, world)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(output, encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(output.encode('utf-8'))} bytes, {len(experiences)} maps, {len(world['rooms'])} world rooms)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
