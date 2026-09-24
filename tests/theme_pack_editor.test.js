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

test('editing grid geometry clears selection without replacing the transaction',()=>{
  const transaction={settings:{cellW:16,cellH:16},selection:new Set(['r0c0']),cells:[{id:'r0c0'}]};
  const returned=ImportCore.changeGridSetting(transaction,'cellW','32',1);
  assert.equal(returned,transaction);
  assert.equal(transaction.settings.cellW,32);
  assert.equal(transaction.selection.size,0);
  assert.equal(transaction.cells.length,0);
  assert.match(html,/input\.oninput=\(\)=>\{ImportCore\.changeGridSetting\(tx,input\.dataset\.grid,input\.value,Number\(input\.min\)\|\|0\);updateImportPreview\(\)\}/);
  assert.doesNotMatch(html,/input\.oninput=.*renderCenter\(\)/);
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

test('narrow layouts stack the detail inspector below the center instead of hiding it',()=>{
  assert.match(html,/@media\(max-width:1000px\)\{[\s\S]*?#nav\{grid-row:1\/3\}[\s\S]*?#center\{grid-column:2;grid-row:1\}[\s\S]*?#detail\{grid-column:2;grid-row:2;display:flex/);
  assert.doesNotMatch(html,/@media\(max-width:1000px\)\{[^}]*#detail\{display:none/);
  assert.match(html,/@media\(max-width:720px\)\{[\s\S]*?#center\{grid-column:1;grid-row:1\}[\s\S]*?#detail\{grid-column:1;grid-row:2\}/);
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

test('every Atlas uses the persistent editor without exposing embedded payloads as normal metadata',()=>{
  for(const text of ['Create Resources from Selection','Rename Atlas','Export Atlas Image…','Existing Resource regions','authoring.grid','sourceFile','imageSize'])assert.match(html,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(html,/resource\?\.image\?\.atlas===atlasId/);
  assert.match(html,/rawValue=state.section==='atlases'/);
  assert.match(html,/Embedded base64 image/);
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
