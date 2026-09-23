'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');

const root=path.resolve(__dirname,'..');
const appPath=path.join(root,'editor/theme_pack_editor.html');
const themePath=path.join(root,'themes/theme_marioai_reference_pack.llmtheme.txt');
const html=fs.readFileSync(appPath,'utf8');
const theme=JSON.parse(fs.readFileSync(themePath,'utf8'));

function scripts(source){
  return [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1]);
}

test('theme pack workbench is a standalone readonly single-file application',()=>{
  assert.match(html,/THEME PACK WORKBENCH/);
  assert.match(html,/Phase 1 · readonly inspector/);
  assert.match(html,/id="fileInput"/);
  assert.match(html,/window\.ThemePackWorkbench=\{loadThemeDocument,validateTheme,refsIn,report\}/);
  assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+href=/i);
  assert.doesNotMatch(html,/fetch\s*\(|XMLHttpRequest|import\s*\(/);
  assert.doesNotMatch(html,/contenteditable\s*=|Save theme|Export theme/i);
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
