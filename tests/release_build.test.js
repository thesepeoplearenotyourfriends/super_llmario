'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');

const root=path.resolve(__dirname,'..'),enginePath=path.join(root,'engine/reference_pack_engine.html'),editorPath=path.join(root,'editor/reference_pack_editor.html'),releasePath=path.join(root,'dist/super_llmario.html'),mapDir=path.join(root,'maps');
const theme=JSON.parse(fs.readFileSync(path.join(root,'themes/theme_marioai_reference_pack.llmtheme.txt'),'utf8'));
function build(){cp.execFileSync('python3',['scripts/build_release.py'],{cwd:root,stdio:'pipe'});return fs.readFileSync(releasePath,'utf8')}
function mapFiles(){return fs.readdirSync(mapDir).filter(name=>name.endsWith('.llmmap.txt'))}
function scripts(html){return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1])}
function packedScript(html){const match=html.match(/<script id="packedReleaseContent">([\s\S]*?)<\/script>/);assert(match,'missing packed release content');return match[1]}

test('release builder is deterministic and never mutates editable engine/editor sources',()=>{
  const engineBefore=fs.readFileSync(enginePath),editorBefore=fs.readFileSync(editorPath),first=build(),engineBetween=fs.readFileSync(enginePath),editorBetween=fs.readFileSync(editorPath),second=build();
  assert.deepEqual(engineBetween,engineBefore);assert.deepEqual(editorBetween,editorBefore);assert.deepEqual(fs.readFileSync(enginePath),engineBefore);assert.deepEqual(fs.readFileSync(editorPath),editorBefore);assert.equal(second,first);assert(first.length>engineBefore.length);
});
test('active Block/Brick stamp brush takes pointer priority over ordinary hit-selection',()=>{
  const editor=fs.readFileSync(editorPath,'utf8'),pointerDown=editor.slice(editor.indexOf("canvas.addEventListener('pointerdown'"),editor.indexOf("canvas.addEventListener('pointermove'"));
  assert(pointerDown.indexOf('else if(state.brush&&semantics.squareStampCapability')<pointerDown.indexOf('else {const found=hit(p)'),
    'an active Block/Brick stamp brush must start stamping before object hit-selection can cancel it');
});
test('release packs every repository map with one shared reference theme and embedded map editor',()=>{
  const html=build(),source=packedScript(html),sandbox={};vm.createContext(sandbox);vm.runInContext(source.replace(/^const /gm,'var '),sandbox);
  const expectedFiles=mapFiles(),expectedIds=expectedFiles.map(name=>name.slice(0,-'.llmmap.txt'.length)),packedFiles=Array.from(sandbox.PACKED_EXPERIENCES,x=>x.filename),packedIds=Array.from(sandbox.PACKED_EXPERIENCES,x=>x.id);
  assert.deepEqual([...packedFiles].sort(),[...expectedFiles].sort());assert.deepEqual([...packedIds].sort(),[...expectedIds].sort());if(expectedIds.includes('demo'))assert.equal(packedIds[0],'demo');
  for(const experience of sandbox.PACKED_EXPERIENCES){const map=JSON.parse(fs.readFileSync(path.join(mapDir,experience.filename),'utf8'));assert.deepEqual(JSON.parse(JSON.stringify(experience.map)),map);assert.strictEqual(experience.theme,sandbox.PACKED_THEME)}
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.PACKED_THEME)),theme);assert.equal(sandbox.PACKED_DEFAULT_EXPERIENCE_ID,expectedIds.includes('demo')?'demo':packedIds[0]);
  const caves=sandbox.PACKED_EXPERIENCES.find(x=>x.id==='breakout_caves');if(caves)assert.equal(caves.label,'Breakout Caves');
  assert(sandbox.PACKED_EDITOR_HTML.includes('Reference Pack Editor'));assert(sandbox.PACKED_EDITOR_HTML.includes('ReferencePackEditorReleaseLoad'));assert(sandbox.PACKED_EDITOR_HTML.includes("mapName='packed.llmmap.txt'"));
  assert(sandbox.PACKED_EDITOR_HTML.includes('class="packed-editor-header"'));assert(sandbox.PACKED_EDITOR_HTML.includes('id="packedMapName"'));assert(sandbox.PACKED_EDITOR_HTML.includes('id="backToGameBtn"'));
  assert(sandbox.PACKED_EDITOR_HTML.includes('data-menu="packedFileMenu"'));assert(sandbox.PACKED_EDITOR_HTML.includes('data-menu="packedEditMenu"'));assert(sandbox.PACKED_EDITOR_HTML.includes('role="toolbar" aria-label="Map editor tools"'));
  assert(sandbox.PACKED_EDITOR_HTML.includes('id="playFromHereBtn"'));assert(sandbox.PACKED_EDITOR_HTML.includes('id="rangeTestBtn"'));
  for(const obsolete of ['id="testPointBtn"','id="clearTestPointBtn"','id="rangesBtn"','id="testProfile"'])assert(!sandbox.PACKED_EDITOR_HTML.includes(obsolete),`${obsolete} is no longer user-facing`);
  assert(sandbox.PACKED_EDITOR_HTML.includes('const chosen={x:point.x,y:point.y}'),'point tools preserve exact world coordinates');
  assert(sandbox.PACKED_EDITOR_HTML.includes('map=semantics.serializeMap(theme,document)'),'play/ranges consume the current in-memory editor document');
  assert(sandbox.PACKED_EDITOR_HTML.includes('semantics.normalizePointForSingleMap(document,point)'),'test spawn follows canonical map-origin normalization');
  assert(sandbox.PACKED_EDITOR_HTML.includes('ReferencePackSimulateReachability'),'packed editor delegates ranges to its parent runtime');
  assert(sandbox.PACKED_EDITOR_HTML.includes("window.parent?.ReferencePackCloseEditor?.()"));assert(html.includes('ReferencePackCloseEditor=closePackedEditor'));assert(!html.includes('id="releaseEditorBar"'));
  assert(html.includes('B.simulateReachability(theme,map,startPoint,{profile})'));assert(html.includes('ReferencePackPlayFromEditor=playPackedEditorMap'));
  assert(sandbox.PACKED_EDITOR_HTML.includes("return{theme,map,startPoint:normalized,profile:packedTestState.profile||'standing'}"),'runtime requests include the current editor theme, map, point, and profile');
  assert(sandbox.PACKED_EDITOR_HTML.includes("selectEditorTool(active?'select':'playFromHere')"),'Play From Here uses the shared mutually exclusive tool selector');
  assert(sandbox.PACKED_EDITOR_HTML.includes("selectEditorTool('rangeTest')"),'Range Test uses the shared mutually exclusive tool selector');
  assert(sandbox.PACKED_EDITOR_HTML.includes("if(!['playFromHere','rangeTest'].includes(state.tool)||event.button!==0)return false"),'the point interceptor follows central tool state');
  assert(sandbox.PACKED_EDITOR_HTML.includes("selectEditorTool('select');setStatus(`Playing from"),'Play From Here consumes one point and disarms itself');
  assert(sandbox.PACKED_EDITOR_HTML.includes("range.textContent=rangeActive?(packedTestState.profile==='raccoonFlight'?'Range: Flight':'Range: Standing'):'Range Test'"),'the active Range button reports its selected mode');
  assert(sandbox.PACKED_EDITOR_HTML.includes("packedTestState.point=chosen;recomputePackedRanges()"),'repeated Range clicks replace the origin without reopening the picker');
  assert(sandbox.PACKED_EDITOR_HTML.includes("kind==='themeLoad'||kind==='mapLoad'"),'document replacement clears stale test/range state');
  assert.match(html,/grid-template-rows:32px 44px/);assert.match(html,/height:calc\(100vh - 76px\)/);assert.match(html,/\.side\.right\{top:76px\}/);
  assert(html.includes("if(frame.dataset.loaded)return"),'returning to the editor reuses its existing iframe and ephemeral state');
  assert(html.includes('bootPackedRelease();'));assert(!/fetch\s*\(|XMLHttpRequest|import\s*\(/.test(html));
  assert.match(html,/id="releaseMapPicker"/);assert.match(html,/id="releaseMenu"/);assert.match(html,/<button id="releaseEditorButton">Editor<\/button><\/header>/);
  assert.match(html,/getElementById\('releaseEditorButton'\).*addEventListener\('click',openPackedEditor\)/);assert.match(html,/experience\.theme,experience\.map,experience\.filename/);
});
test('release build fails when any map in maps is incompatible with the packed theme',()=>{
  const temp=path.join(mapDir,'__release_incompatible.llmmap.txt');assert.equal(fs.existsSync(temp),false);
  fs.writeFileSync(temp,JSON.stringify({format:'llmario-reference-editor-map',mapVersion:1,theme:{id:'wrong-theme',packVersion:theme.packVersion},instances:[]}));
  try{let error;try{build()}catch(caught){error=caught}assert(error,'expected build failure');assert.match(String(error.stderr),/__release_incompatible\.llmmap\.txt does not target the packed reference theme/)}finally{fs.rmSync(temp,{force:true})}
});
test('every generated inline script is syntactically valid JavaScript',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'llmario-release-'));
  try{scripts(build()).forEach((source,index)=>{const file=path.join(dir,index+'.js');fs.writeFileSync(file,source);cp.execFileSync('node',['--check',file],{stdio:'pipe'})})}finally{fs.rmSync(dir,{recursive:true,force:true})}
});
