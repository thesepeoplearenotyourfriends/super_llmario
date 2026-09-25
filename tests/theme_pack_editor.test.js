'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const appPath=path.join(root,'editor/theme_pack_editor.html');
const themePath=path.join(root,'themes/theme_marioai_reference_pack.llmtheme.txt');
const html=fs.readFileSync(appPath,'utf8');
const theme=JSON.parse(fs.readFileSync(themePath,'utf8'));

const coreSource=html.match(/\/\* IMPORT_CORE_START[\s\S]*?const ImportCore=(\{[\s\S]*?\});\n\/\* IMPORT_CORE_END \*\//)?.[1];
assert(coreSource,'import core is embedded in the standalone workbench');
const ImportCore=vm.runInNewContext(`(${coreSource})`,{structuredClone});

function scripts(source){
  return [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1]);
}

test('theme pack workbench remains standalone while exposing authoring actions',()=>{
  assert.match(html,/THEME PACK WORKBENCH/);
  assert.match(html,/id="fileInput"/);
  assert.match(html,/id="importButton"[^>]*>Import Atlas…/);
  assert.match(html,/id="saveButton"[^>]*>Save Theme…/);
  assert.match(html,/window\.ThemePackWorkbench=\{loadThemeDocument,validateTheme,refsIn,report,ImportCore/);
  assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+href=/i);
  assert.doesNotMatch(html,/fetch\s*\(|XMLHttpRequest|import\s*\(/);
  assert.doesNotMatch(html,/contenteditable\s*=/i);
});

test('grid generation uses source pixels, offsets, gutters, and excludes partial edge cells',()=>{
  assert.deepEqual(Array.from(ImportCore.gridCells(72,45,{cellW:20,cellH:16,offsetX:4,offsetY:3,gutterX:2,gutterY:3}),cell=>({...cell})),[
    {id:'r0c0',row:0,column:0,x:4,y:3,w:20,h:16},
    {id:'r0c1',row:0,column:1,x:26,y:3,w:20,h:16},
    {id:'r0c2',row:0,column:2,x:48,y:3,w:20,h:16},
    {id:'r1c0',row:1,column:0,x:4,y:22,w:20,h:16},
    {id:'r1c1',row:1,column:1,x:26,y:22,w:20,h:16},
    {id:'r1c2',row:1,column:2,x:48,y:22,w:20,h:16}
  ]);
  assert.equal(ImportCore.gridCells(19,16,{cellW:20,cellH:16}).length,0,'partial cells are excluded, never clipped');
});

test('candidate selection is transactional and commit creates only selected atlas regions',()=>{
  const original={format:'llmario-theme-pack-reference',packVersion:1,atlases:{old:{mediaType:'image/png',encoding:'base64',data:'OLD'}},resources:{existing:{kind:'decoration'}}};
  const before=JSON.stringify(original),cells=ImportCore.gridCells(34,16,{cellW:16,cellH:16,offsetX:0,offsetY:0,gutterX:2,gutterY:0});
  let selection=new Set();selection=ImportCore.toggleCandidate(selection,cells[1]);
  assert.equal(JSON.stringify(original),before,'selecting a candidate does not mutate the document');
  const tx={cells,selection,atlasId:'spritesheet_1',prefix:'imported',mediaType:'image/png',base64:'iVBORw0KGgo=',sourceName:'sheet.png',settings:{cellW:16,cellH:16}};
  const result=ImportCore.commit(original,tx);
  assert.equal(Object.keys(result.theme.atlases).length,2);
  assert.equal(Object.keys(result.theme.resources).length,2);
  assert.equal(result.dirty,true);
  assert.deepEqual({...result.theme.resources['imported.001'].image.rect},{x:18,y:0,w:16,h:16});
  assert.equal(Object.hasOwn(result.theme.resources['imported.001'],'kind'),false,'unassigned imported resources have no premature semantic kind');
  assert.equal(result.theme.resources['imported.002'],undefined,'unselected candidates create no resources');
  assert.deepEqual(JSON.parse(JSON.stringify(result.theme.atlases.spritesheet_1)),{mediaType:'image/png',encoding:'base64',data:'iVBORw0KGgo=',sourceFile:'sheet.png',imageSize:{},authoring:{grid:{cellW:16,cellH:16}}});
  assert.equal(JSON.stringify(original),before,'commit returns a new working document');
});

test('editing grid geometry clears selection and synchronizes persistent Atlas controls',()=>{
  const transaction={settings:{cellW:16,cellH:16},selection:new Set(['r0c0']),cells:[{id:'r0c0'}]};
  const returned=ImportCore.changeGridSetting(transaction,'cellW','32',1);
  assert.equal(returned,transaction);
  assert.equal(transaction.settings.cellW,32);
  assert.equal(transaction.selection.size,0);
  assert.equal(transaction.cells.length,0);
  assert.match(html,/session\.gridSelection\.clear\(\);recordEdit\('Change Atlas Grid'\);renderCenter\(\)/);
  assert.match(html,/session=\{gridSelection:new Set\(\),selectedRegions:new Set\(\),activeRegion:null/);
});

test('resource creation is row-major and continues after existing IDs without overwriting',()=>{
  const cells=ImportCore.gridCells(32,32,{cellW:16,cellH:16,offsetX:0,offsetY:0,gutterX:0,gutterY:0});
  const base={atlases:{},resources:{'imported.001':{sentinel:true}}};
  const tx={cells,selection:new Set([cells[3].id,cells[0].id]),atlasId:'sheet',prefix:'imported',mediaType:'image/webp',base64:'AAAA',sourceName:'sheet.webp',settings:{cellW:16,cellH:16}};
  const result=ImportCore.commit(base,tx);
  assert.equal(base.resources['imported.001'].sentinel,true);
  assert.equal(base.atlases.sheet,undefined);
  assert.deepEqual(Array.from(result.resourceIds),['imported.002','imported.003']);
});

test('save serialization round-trips committed embedded data',()=>{
  const cells=ImportCore.gridCells(8,8,{cellW:8,cellH:8});
  const source={atlases:{},resources:{}};
  const result=ImportCore.commit(source,{cells,selection:new Set(['r0c0']),atlasId:'sheet',prefix:'new',mediaType:'image/png',base64:'EMBEDDED',sourceName:'tiny.png',settings:{cellW:8,cellH:8}});
  const serialized=ImportCore.serialize(result.theme),reloaded=JSON.parse(serialized);
  assert.equal(reloaded.atlases.sheet.data,'EMBEDDED');
  assert.equal(reloaded.atlases.sheet.encoding,'base64');
  assert.deepEqual(reloaded.resources['new.001'].image.rect,{x:0,y:0,w:8,h:8});
  assert.equal(source.atlases.sheet,undefined,'cancel-before-commit is equivalent to discarding the detached transaction');
});

test('theme pack workbench keeps inventory entries reachable and exposes status logging',()=>{
  assert.match(html,/#sectionList\{[^}]*flex:0 1 44%/);
  assert.match(html,/#itemList\{[^}]*flex:1 1 56%/);
  assert.match(html,/const first=INVENTORY_SECTIONS\.has\(section\)\?entries\(state\.theme\?\.\[section\]\)\[0\]\?\.\[0\]:null/);
  for(const id of ['statusBar','statusMessage','logButton','logPanel','logEntries'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/function report\(level,message,/);
  assert.match(html,/Could not decode embedded atlas/);
});

test('theme pack workbench covers the complete canonical reference-pack surface',()=>{
  const required=['atlases','resources','families','animations','constructions','objects','parameterSchemas','placeables','frameGroups','coverage','contract','attribution','sceneLayers','extended'];
  for(const section of required){
    assert(Object.hasOwn(theme,section),`canonical theme has ${section}`);
    assert(html.includes(`'${section}'`)||html.includes(`${section}:`),`workbench names ${section}`);
  }
  assert.match(html,/resourceCanvas/);
  assert.match(html,/animationCanvas/);
  assert.match(html,/Referenced by/);
  assert.match(html,/Component resources/);
  assert.match(html,/Parameter Schemas/);
});

test('resource and atlas inspectors provide integer zoom, drag panning, and atlas region drill-down',()=>{
  for(const token of ['zoomViewport','zoomStage','zoomReadout','atlasCanvas','atlasRegions','atlasRegion'])assert.match(html,new RegExp(token));
  assert.match(html,/Ctrl\+wheel to zoom/);
  assert.match(html,/function setPreviewZoom\(/);
  assert.match(html,/function fitPreview\(/);
  assert.match(html,/function wireZoom\(/);
  assert.match(html,/viewport\.scrollLeft=drag\.left-dx/);
  assert.match(html,/imageSmoothingEnabled=false/);
  assert.match(html,/resource\?\.image\?\.atlas===atlasId/);
  assert.match(html,/navigate\('resources',button\.dataset\.resource\)/);
});

test('semantic navigation keeps global back-forward history and turns resources into usage gateways',()=>{
  for(const token of ['historyNav','historyBack','historyForward','usageSummary','usageGroup'])assert.match(html,new RegExp(token));
  assert.match(html,/history:\[\],historyIndex:-1/);
  assert.match(html,/function recordHistory\(/);
  assert.match(html,/state\.history\.splice\(state\.historyIndex\+1\)/);
  assert.match(html,/function historyGo\(delta\)/);
  assert.match(html,/function renderHistoryNav\(/);
  assert.match(html,/Where this resource is used/);
  assert.match(html,/function resourceUsage\(resourceId\)/);
  assert.match(html,/backlinks\('resources',resourceId\)/);
  assert.match(html,/resource\.belongsTo===familyKey/);
  assert.match(html,/RESOURCE_USAGE_ORDER=\['families','frameGroups','animations','constructions','objects','placeables','resources','parameterSchemas'\]/);
});

test('narrow layouts preserve navigation while transient inspectors overlay the workspace',()=>{
  assert.match(html,/#layout\{[^}]*grid-template-columns:250px minmax\(360px,1fr\)/);
  assert.match(html,/#inspector\{[^}]*position:absolute[^}]*right:0[^}]*bottom:0/);
  assert.match(html,/@media\(max-width:720px\)\{[\s\S]*?#layout\{grid-template-columns:190px minmax\(300px,1fr\);overflow:auto\}[\s\S]*?#nav\{position:sticky/);
  assert.doesNotMatch(html,/@media\(max-width:720px\)\{[^}]*#nav\{display:none/);
});


test('Atlas model supports persistent grids, resource creation, and atomic rename',()=>{
  const original={atlases:{map:{mediaType:'image/png',encoding:'base64',data:'AA',cellSize:{w:8,h:9}}},resources:{tile:{image:{atlas:'map',rect:{x:1,y:2,w:3,h:4}}}}};
  assert.deepEqual({...ImportCore.gridFromAtlas(original.atlases.map)},{cellW:8,cellH:9,offsetX:0,offsetY:0,gutterX:0,gutterY:0});
  const renamed=ImportCore.renameAtlas(original,'map','world');
  assert.equal(renamed.theme.resources.tile.image.atlas,'world');
  assert.equal(renamed.theme.atlases.map,undefined);
  assert.equal(original.resources.tile.image.atlas,'map','rename is atomic and does not mutate its input');
  assert.throws(()=>ImportCore.renameAtlas({atlases:{map:{},world:{}},resources:{}},'map','world'),/already exists/);
});

test('Atlas rename rewrites every matching navigation-history destination',()=>{
  const history=[{section:'overview',key:null},{section:'atlases',key:'map'},{section:'resources',key:'map'},{section:'atlases',key:'map'}];
  const rewritten=Array.from(ImportCore.rewriteAtlasHistory(history,'map','world'),entry=>({...entry}));
  assert.deepEqual(rewritten,[{section:'overview',key:null},{section:'atlases',key:'world'},{section:'resources',key:'map'},{section:'atlases',key:'world'}]);
  assert.equal(history[1].key,'map','history rewriting does not mutate the input');
  assert.match(html,/state\.history=ImportCore\.rewriteAtlasHistory\(state\.history,oldId,result\.atlasId\)/);
});

test('Resource remapping is transactional and preserves stable identities and metadata',()=>{
  const original={atlases:{old:{},replacement:{}},resources:{
    'player.run.1':{image:{atlas:'old',rect:{x:0,y:0,w:16,h:16}},display:{w:20},role:'player',provenance:{author:'keep'}},
    'player.run.2':{image:{atlas:'old',rect:{x:16,y:0,w:16,h:16}},kind:'sprite'},
    untouched:{image:{atlas:'old',rect:{x:32,y:0,w:16,h:16}}}
  },animations:{run:{frames:[{resource:'player.run.1'},{resource:'player.run.2'}]}}};
  const before=JSON.stringify(original),cells=ImportCore.gridCells(32,16,{cellW:16,cellH:16});
  const assignments=ImportCore.pairRemap(['player.run.1','player.run.2'],cells,['r0c1','r0c0']);
  assert.equal(JSON.stringify(original),before,'draft pairing does not mutate the theme');
  const result=ImportCore.applyRemap(original,'replacement',['player.run.1','player.run.2'],assignments);
  assert.deepEqual({...result.theme.resources['player.run.1'].image.rect},{x:16,y:0,w:16,h:16});
  assert.equal(result.theme.resources['player.run.1'].image.atlas,'replacement');
  assert.deepEqual(JSON.parse(JSON.stringify(result.theme.resources['player.run.1'].provenance)),{author:'keep'});
  assert.equal(result.theme.resources.untouched.image.atlas,'old','resources outside the explicit scope stay untouched');
  assert.deepEqual(JSON.parse(JSON.stringify(result.theme.animations)),original.animations,'higher-level references stay byte-for-byte equivalent');
  assert.deepEqual(Object.keys(result.theme.resources),Object.keys(original.resources),'no Resource is created or renamed');
  assert.equal(JSON.stringify(original),before,'apply returns a detached atomic document');
});

test('Resource remapping requires complete unique assignments',()=>{
  const theme={atlases:{old:{},replacement:{}},resources:{a:{image:{atlas:'old',rect:{x:0,y:0,w:8,h:8}}},b:{image:{atlas:'old',rect:{x:8,y:0,w:8,h:8}}}}};
  assert.throws(()=>ImportCore.applyRemap(theme,'replacement',['a','b'],new Map([['a',{x:0,y:0,w:8,h:8}]])),/not mapped: b/);
  assert.throws(()=>ImportCore.applyRemap(theme,'replacement',['a','b'],new Map([['a',{x:0,y:0,w:8,h:8}],['b',{x:0,y:0,w:8,h:8}]])),/assigned more than once/);
  assert.throws(()=>ImportCore.pairRemap(['a','b'],[{id:'r0c0',x:0,y:0,w:8,h:8}],['r0c0']),/needs 2 selected regions/);
});

test('Atlas editor exposes visual scoped remapping and review-before-apply',()=>{
  for(const text of ['Remap Resources…','Destination Atlas:','Pair by order','Back to Mapping','Apply Remap','to assign and advance.'])assert.match(html,new RegExp(text));
  assert.match(html,/resource\?\.image\?\.atlas===atlasId/,'scope derives from authoritative Resource image bindings');
  assert.match(html,/state\.theme=result\.theme;state\.remapSession=null;recordEdit\('Apply Resource Remap'\)/,'only Apply commits and dirties the theme');
  assert.match(html,/Resource identities and semantic references were preserved/);
});

test('Import Atlas is only a constructor; grid authoring lives in the persistent Atlas editor',()=>{
  const workspace=html.match(/function renderImportWorkspace\(\)\{[\s\S]*?\n\}/)?.[0]||'';
  assert.match(workspace,/Atlas ID/);
  assert.match(workspace,/Create Atlas/);
  assert.doesNotMatch(workspace,/Cell width|Cell height|X offset|Y offset|gutter|data-grid/);
  assert.match(html,/function renderAtlas\(\)[\s\S]*?data-atlas-grid/);
});

test('every Atlas uses the persistent editor without exposing embedded payloads as normal metadata',()=>{
  for(const text of ['Create Resources from Grid Selection','Rename…','Export Image…','Existing Resource regions','authoring.grid','sourceFile','imageSize'])assert.match(html,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(html,/resource\?\.image\?\.atlas===atlasId/);
  assert.match(html,/function inspectorRawValue\(\)/);
  assert.match(html,/if\(state.section==='atlases'&&value\)/);
  assert.match(html,/Embedded base64 image/);
});

test('desktop menus advertise file, inspection, diagnostics, and contextual Atlas capabilities',()=>{
  for(const label of ['File','Edit','View','Atlas','Help','Open Theme…','Save Theme…','Import Atlas…','Details…','References…','Raw Entry…','Log…'])assert.match(html,new RegExp(`>${label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`));
  assert.match(html,/id="atlasMenu" hidden/);
  assert.match(html,/const atlasContext=state\.section==='atlases'&&state\.key!=null/);
  assert.match(html,/aria-haspopup="menu" aria-expanded="false"/);
  assert.match(html,/id="undoEdit"[\s\S]*Ctrl\+Z/);
  assert.match(html,/id="redoEdit"[\s\S]*Ctrl\+Shift\+Z/);
  assert.match(html,/\$\('menuBar'\)\.addEventListener\('click',event=>\{if\(event\.target\.closest\('\[role="menuitem"\]'\)\)closeMenus\(\)\}\)/,'all menu commands dismiss through one delegated handler');
});

test('secondary information uses context-preserving drawer, modal, and diagnostics surfaces',()=>{
  for(const id of ['inspector','inspectorScroll','rawDialog','rawContent','logPanel'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/function openInspector\(kind\)/);
  assert.match(html,/function closeInspector\(\)/);
  assert.match(html,/function openRawInspector\(\)/);
  assert.match(html,/state\.inspector=null;closeRawInspector\(\);closeMenus\(\);[\s\S]*state\.section=section/,'navigation dismisses transient aids before changing selection');
  assert.doesNotMatch(html,/id="detail"/);
});

test('layout helpers distinguish repeating cells from rows and columns',()=>{
  assert.match(html,/layout==='regular'.*Regular grid/);
  assert.match(html,/layout==='loose'.*Split into Rows \/ Columns/);
  assert.match(html,/id="regionColumns"[\s\S]*id="regionRows"[\s\S]*Split into Rows \/ Columns/);
  assert.doesNotMatch(html,/All tools · alternate helpers|repeating grid is primary/);
});

test('Atlas import requires an explicit visible layout choice',()=>{
  assert.match(html,/id="importLayout"/);
  for(const text of ['One repeating grid across the whole image.','Frames follow rough rows or columns','Frames have arbitrary positions and sizes.'])assert.match(html,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(html,/Origin and filename do not determine layout/);
  assert.match(html,/layout:''/);
  assert.doesNotMatch(html,/layout:'loose'/);
});

test('Regions support direct drawing, moving, resizing, and pixel color picking',()=>{
  assert.match(html,/function wireRegionPointerEditing/);
  assert.match(html,/session\.tool!=='draw'/);
  assert.match(html,/resize=rect\.right-e\.clientX<12/);
  assert.match(html,/getImageData\(p\.x,p\.y,1,1\)/);
  assert.doesNotMatch(html,/prompt\('Region x, y, width, height'/);
  assert.doesNotMatch(html,/Exact edge-connected background color/);
});

test('packing is an explicit selection extract that preserves the source Atlas',()=>{
  assert.match(html,/Extract \/ Pack Selection/);
  assert.match(html,/newId=suggestedId\(sourceId\+'\.extract'/);
  assert.match(html,/source Atlas and its imagery remain unchanged/);
  assert.doesNotMatch(html,/Normalize \/ Pack/);
});

test('destination-first replacement prefers authored Regions over grid cells',()=>{
  assert.match(html,/if\(regions\?\.length\)return regions\.map/);
});

test('authoring overlays follow the active interaction mode',()=>{
  assert.match(html,/const gridActive=!\(atlas\.authoring\?\.regions\|\|\[\]\)\.length&&\(atlas\.layout==='regular'\|\|session\.gridActive===true\)/);
  assert.match(html,/candidates\.style\.pointerEvents=gridActive&&!session\.tool\?'auto':'none'/);
  assert.match(html,/regions\.style\.pointerEvents=session\.tool\?'none':'auto'/);
  assert.match(html,/data-activate-grid/);
});

test('authored Regions have batch selection, direct Resource creation, sticky tools, and edit history',()=>{
  assert.match(html,/selectedRegions:new Set\(\),activeRegion:null/);
  assert.match(html,/e\.ctrlKey\|\|e\.metaKey/);
  assert.match(html,/createSelectedResources\(false\)/);
  assert.match(html,/selectedAuthoringRegions/);
  assert.match(html,/position:sticky/);
  assert.match(html,/function recordEdit\(label\)/);
  assert.match(html,/restoreEdit\(event\.shiftKey\?1:-1\)/);
});

test('remap review thumbnails reopen one assignment without clearing it',()=>{
  assert.match(html,/data-reassign/);
  assert.match(html,/s\.activeId=button\.dataset\.reassign;s\.review=false/);
  assert.doesNotMatch(html,/data-reassign[^}]+assignments\.delete/);
});


test('sticky Atlas zoom controls use the established zoom event contract',()=>{
  assert.match(html,/data-zoom="-1"/);
  assert.match(html,/data-zoom="1"/);
  assert.match(html,/data-zoom-value="1"/);
  assert.match(html,/data-zoom-fit/);
  assert.doesNotMatch(html,/data-zoom="(?:out|in|actual|fit)"/);
});

test('grid selection synchronizes its persistent Resource action without rebuilding the workspace',()=>{
  assert.match(html,/id="createGridResources"[^>]*disabled/);
  assert.match(html,/id="gridSelectionCount"/);
  assert.match(html,/function syncGridSelectionUi\(session\)/);
  assert.match(html,/classList\.toggle\('selected',[^;]+;syncGridSelectionUi\(session\)/);
});

test('edit restore reconciles deleted navigation targets and tracks saved snapshots by identity',()=>{
  assert.match(html,/function reconcileSelectionAfterRestore\(\)/);
  assert.match(html,/!Object\.hasOwn\(dict\(state\.theme\?\.\[state\.section\]\),state\.key\)/);
  assert.match(html,/state\.key=siblings\[0\]\?\?null/);
  assert.match(html,/savedEditId/);
  assert.match(html,/newEditEntry\(label\)/);
  assert.doesNotMatch(html,/savedEditIndex/);
});

test('global mutation undo leaves native field undo intact',()=>{
  assert.match(html,/closest\?\.\('input,textarea'\)/);
  assert.match(html,/!event\.target\.isContentEditable/);
});

test('Fit zoom never exceeds the mathematical viewport ratio',()=>{
  const ratio=ImportCore.fitZoom(1600,970,701,441);
  assert.equal(ratio,Math.min(701/1600,441/970));
  assert.ok(1600*ratio<=701+Number.EPSILON);
  assert.ok(970*ratio<=441+Number.EPSILON);
  assert.equal(ImportCore.fitZoom(16000,9700,500,300),300/9700,'Fit may go below 1/16 when required');
});

test('every inline workbench script is syntactically valid JavaScript',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'llmario-theme-editor-'));
  try{
    const inline=scripts(html);
    assert.equal(inline.length,1);
    inline.forEach((source,index)=>{
      const file=path.join(dir,`${index}.js`);
      fs.writeFileSync(file,source);
      cp.execFileSync('node',['--check',file],{stdio:'pipe'});
    });
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
