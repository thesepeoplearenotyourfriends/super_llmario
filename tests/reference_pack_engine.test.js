'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('engine/reference_pack_engine.html','utf8');
const legacy=fs.readFileSync('engine/engine.html','utf8');
const theme=JSON.parse(fs.readFileSync('themes/theme_marioai_reference_pack.llmtheme.txt','utf8'));
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/reference_static_scene.llmmap.txt','utf8'));
const boundarySource=html.match(/<script id="referencePackBoundary">([\s\S]*?)<\/script>/)[1];
const context={globalThis:{}};
vm.runInNewContext(boundarySource,context);
const api=context.globalThis.ReferencePackBoundary;
const plain=value=>JSON.parse(JSON.stringify(value));
const validMap={format:'llmario-reference-editor-map',mapVersion:1,theme:{id:theme.id,packVersion:theme.packVersion},instances:[],markers:{start:null,goal:null}};

test('compiles the actual reference theme and representative editor map',()=>{
  const result=api.compileReferenceRuntime(theme,fixture);
  assert.equal(result.ok,true);
  assert.equal(result.runtime.format,'llmario-reference-static-runtime');
  assert.equal(result.runtime.instances.length,fixture.instances.length);
  assert(result.runtime.drawCommands.length>fixture.instances.length);
  assert(result.runtime.drawCommands.every(command=>theme.atlases[command.atlas]&&command.sourceRect));
});

test('orders all five declared layers and resolves default and override layers',()=>{
  const runtime=api.compileReferenceRuntime(theme,fixture).runtime;
  assert.deepEqual(plain(runtime.layers),['sky','background','world','actors','foreground']);
  const used=runtime.drawCommands.map(x=>x.layer);
  assert.deepEqual([...new Set(used)],['sky','background','world','actors','foreground']);
  assert.equal(runtime.instances.find(x=>x.placeable==='goomba').layer,'actors');
  assert.equal(runtime.instances.find(x=>x.placeable==='arrowSign').layer,'foreground');
});

test('resolves atlas rectangles and deterministic animation initial frames',()=>{
  const runtime=api.compileReferenceRuntime(theme,fixture).runtime;
  const actor=runtime.instances.find(x=>x.placeable==='goomba');
  assert.equal(actor.target.kind,'animation');
  assert.equal(actor.target.animation.id,'enemy.goomba.walk');
  assert.equal(actor.target.animation.initialFrame,0);
  assert.equal(actor.target.animation.resource,theme.animations['enemy.goomba.walk'].frames[0].resource);
  const command=actor.drawCommands[0],resource=theme.resources[command.resource];
  assert.deepEqual(plain(command.sourceRect),resource.image.rect);
  assert.equal(command.atlas,resource.image.atlas);
});

test('construction geometry follows editor native-cell, autotile, sky, and rotation rules',()=>{
  const runtime=api.compileReferenceRuntime(theme,fixture).runtime;
  const ground=runtime.instances.find(x=>x.placeable==='ground').target.construction.geometry;
  assert.equal(ground.cells.length,16);
  assert.equal(ground.w,8*ground.cellW);
  const oneRow={...fixture,instances:[{placeable:'ground',values:{'transform.x':0,'transform.y':16,'terrain.width':3,'terrain.height':1,'terrain.style':'overground'}}]};
  const row=api.compileReferenceRuntime(theme,oneRow).runtime.instances[0].target.construction.geometry;
  assert.deepEqual(plain(row.cells.map(x=>x.mask)),['1000','1100','0100']);
  const sky=runtime.instances.find(x=>x.placeable==='skyGradient').target.construction.geometry;
  assert.equal(sky.cells.length,50);
  assert.equal(sky.w,10*sky.cellW);
  assert.equal(sky.h,5*sky.cellH);
  const pipe=runtime.instances.find(x=>x.placeable==='pipe');
  assert.equal(pipe.transform.presentation.quarterTurns,1);
  assert.equal(pipe.bounds.w,pipe.target.bounds.h);
  assert.equal(pipe.bounds.h,pipe.target.bounds.w);
  assert.equal(pipe.target.bounds.anchorX,.5);
  assert.equal(pipe.target.bounds.anchorY,1);
});

test('preserves markers and exposes finite derived preview bounds',()=>{
  const result=api.compileReferenceRuntime(theme,fixture),runtime=result.runtime;
  assert.deepEqual(plain(runtime.markers),fixture.markers);
  assert.equal(runtime.boundsSource,'derived-preview');
  assert([runtime.bounds.x,runtime.bounds.y,runtime.bounds.w,runtime.bounds.h].every(Number.isFinite));
  assert(runtime.bounds.w>0&&runtime.bounds.h>0);
  assert(result.diagnostics.some(x=>x.code==='derived-bounds'&&x.severity==='warning'));
});

test('reports unsupported content without throwing or drawing substitutes',()=>{
  const broken=plain(fixture);
  broken.instances.push({placeable:'missing',values:{'transform.x':0,'transform.y':0}});
  broken.instances.push({placeable:'coin',values:{'transform.x':'bad','transform.y':0}});
  broken.instances.push({placeable:'coin',values:{'transform.x':0,'transform.y':0},sceneLayer:'bogus'});
  const result=api.compileReferenceRuntime(theme,broken);
  assert.equal(result.ok,true);
  assert(result.diagnostics.some(x=>x.code==='unknown-placeable'));
  assert(result.diagnostics.some(x=>x.code==='malformed-value'));
  assert(result.diagnostics.some(x=>x.code==='invalid-layer'));
  assert.equal(result.runtime.instances.length,fixture.instances.length);
});

test('accepts only the current reference documents and rejects old fallbacks',()=>{
  assert.deepEqual(plain(api.validateReferenceTheme(theme)),[]);
  assert.deepEqual(plain(api.validateReferenceEditorMap(validMap,theme)),[]);
  assert.equal(api.prepareReferenceRuntime(theme,validMap).ok,true);
  for(const format of ['llmario-theme-v1','llmario-theme-pack-v1','llmario-map-v1','llmcart-toybox-recipe',undefined]){
    assert(api.validateReferenceTheme({...theme,format}).some(error=>error.includes('unsupported theme format')));
    assert(api.validateReferenceEditorMap({...validMap,format},theme).some(error=>error.includes('unsupported map format')));
  }
});

test('malformed documents return useful diagnostics without throwing',()=>{
  assert.match(api.parseReferenceDocument('{','theme').errors[0],/not valid JSON/);
  assert.match(api.validateReferenceTheme(null)[0],/root/);
  assert.match(api.validateReferenceEditorMap(null,theme)[0],/root/);
  assert.equal(api.compileReferenceRuntime({},{}).ok,false);
});

test('remains standalone and leaves the legacy oracle unchanged',()=>{
  assert.match(html,/Reference theme\/map required/);
  assert.match(html,/compileReferenceRuntime/);
  assert(!/\bfetch\s*\(|XMLHttpRequest|import\s*\(/.test(html));
  assert(!html.includes('DEMO_CART'));
  assert(!html.includes('ART_RESOURCES'));
  assert(!html.includes('llmcart-toybox-recipe'));
  assert(legacy.includes('DEMO_CART'),'legacy oracle remains intact');
});
