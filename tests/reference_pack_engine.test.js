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
const applicationSource=html.match(/<script>\s*([\s\S]*?)<\/script><\/body>/)[1];
const context={globalThis:{}};
vm.runInNewContext(boundarySource,context);
const api=context.globalThis.ReferencePackBoundary;
const plain=value=>JSON.parse(JSON.stringify(value));
const validMap={format:'llmario-reference-editor-map',mapVersion:1,theme:{id:theme.id,packVersion:theme.packVersion},instances:[],markers:{start:null,goal:null}};

function engineHarness(){
  const operations={fillRect:0,drawImage:0,drawCalls:[]};
  const ctx={setTransform(){},save(){},restore(){},translate(){},scale(){},rotate(){},fillRect(){operations.fillRect++},drawImage(...args){operations.drawImage++;operations.drawCalls.push(args)}};
  const elements={
    screen:{width:960,height:480,getContext:()=>ctx},stage:{getBoundingClientRect:()=>({width:960,height:480})},diagnostics:{textContent:'',className:''},empty:{hidden:false},
    themeButton:{},mapButton:{},fitButton:{},themeFile:{files:[],value:''},mapFile:{files:[],value:''}
  };
  class FakeImage{set src(value){this._src=value;this.onload?.()}get src(){return this._src}}
  const window={ReferencePackBoundary:api};
  const domContext={window,document:{getElementById:id=>elements[id]},Image:FakeImage,devicePixelRatio:1,requestAnimationFrame(){},addEventListener(){},Map,Set,Math,Promise,console};
  vm.runInNewContext(applicationSource,domContext);
  return{engine:window.ReferenceEngine,elements,operations};
}

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
  assert.deepEqual(plain(runtime.playerSpawn),{x:fixture.markers.start.x-17,y:fixture.markers.start.y-48});
  assert.equal(runtime.boundsSource,'derived-preview');
  assert([runtime.bounds.x,runtime.bounds.y,runtime.bounds.w,runtime.bounds.h].every(Number.isFinite));
  assert(runtime.bounds.w>0&&runtime.bounds.h>0);
  assert(result.diagnostics.some(x=>x.code==='derived-bounds'&&x.severity==='warning'));
});

test('compiles explicit solid and solidTop behavior surfaces from capabilities',()=>{
  const map={...validMap,instances:[
    {placeable:'ground',values:{'transform.x':80,'transform.y':160,'terrain.width':4,'terrain.height':2,'terrain.style':'overground'}},
    {placeable:'mushroomPlatform',values:{'transform.x':224,'transform.y':128,'extent.width':3,'extent.height':3}}
  ],markers:{start:{x:32,y:128},goal:{x:320,y:128}}};
  const runtime=api.compileReferenceRuntime(theme,map).runtime;
  assert.equal(runtime.surfaces.solid.length,1);
  assert.equal(runtime.surfaces.solidTop.length,1);
  assert.deepEqual(plain(runtime.surfaces.solid[0]),{...plain(runtime.instances[0].bounds),instanceIndex:0});
  assert.equal(runtime.surfaces.solidTop[0].y,runtime.instances[1].bounds.y);
  assert.equal(runtime.surfaces.solidTop[0].w,runtime.instances[1].bounds.w);
  assert.equal(runtime.markers.goal.x,320,'Level Goal remains marker data');
});

test('ported player behavior preserves oracle acceleration, jump cut, gravity, and dimensions',()=>{
  const runtime={playerSpawn:{x:100,y:252},bounds:{x:0,y:0,w:1000,h:500},surfaces:{solid:[{x:0,y:300,w:1000,h:200}],solidTop:[]}};
  const behavior=api.createPlayerBehavior(runtime),player=behavior.player;
  behavior.step();
  assert.deepEqual({w:player.w,h:player.h,onGround:player.onGround,y:player.y},{w:34,h:48,onGround:true,y:252});
  behavior.step({right:true});
  assert.equal(player.vx,.36);
  assert.equal(player.face,1);
  behavior.step({right:true,run:true});
  assert.equal(player.vx,.86);
  behavior.step({right:false,run:false,jump:true});
  assert.equal(player.vy,-10.63);
  assert.equal(player.onGround,false);
  assert.equal(player.animationState,'jump');
  behavior.step({jump:false});
  assert(Math.abs(player.vy-(-3.58))<1e-9,'released jump uses the oracle short-hop clamp before gravity');
});

test('ported collision behavior lands on solidTop and rejects solid walls',()=>{
  const oneWay=api.createPlayerBehavior({playerSpawn:{x:110,y:120},bounds:{x:0,y:0,w:500,h:400},surfaces:{solid:[],solidTop:[{x:100,y:200,w:100,h:32}]}});
  oneWay.player.vy=11;
  for(let i=0;i<4&&!oneWay.player.onGround;i++)oneWay.step();
  assert.equal(oneWay.player.y,152);
  assert.equal(oneWay.player.onGround,true);

  const wall=api.createPlayerBehavior({playerSpawn:{x:100,y:252},bounds:{x:0,y:0,w:500,h:400},surfaces:{solid:[{x:0,y:300,w:500,h:100},{x:150,y:200,w:20,h:100}],solidTop:[]}});
  wall.step();
  wall.player.vx=4.6;
  for(let i=0;i<8;i++)wall.step({right:true,run:true});
  assert.equal(wall.player.x,116);
  assert.equal(wall.player.vx,0);
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

test('successful load hides the empty-state overlay',async()=>{
  assert.match(html,/#empty\[hidden\]\s*\{\s*display\s*:\s*none\s*;?\s*\}/);
  const {engine,elements}=engineHarness();
  await engine.loadReferenceTheme(theme);
  engine.loadReferenceEditorMap(fixture);
  assert(engine.state.runtime);
  assert(engine.state.behavior,'Mario Start creates the player behavior state');
  assert.deepEqual(plain(engine.state.behavior.player),{
    x:fixture.markers.start.x-17,y:fixture.markers.start.y-48,w:34,h:48,vx:0,vy:0,
    onGround:false,face:1,runCharge:0,pSpeed:false,tick:0,animationState:'idle'
  });
  const idle=theme.resources[theme.objects['player.small'].visuals.idle];
  assert.deepEqual(plain(engine.currentPlayerVisual()),{atlas:idle.image.atlas,sourceRect:idle.image.rect,offset:{x:0,y:0},display:idle.display});
  assert.equal(elements.empty.hidden,true);
});

test('player sprite preserves authored aspect ratio and bottom-center anchor',async()=>{
  const {engine,operations}=engineHarness();
  await engine.loadReferenceTheme(theme);
  engine.loadReferenceEditorMap(fixture);
  const player=engine.state.behavior.player,fit=engine.currentPlayerFit();
  assert.deepEqual(plain(fit),{
    originX:player.x+player.w/2,
    originY:player.y+player.h,
    dx:-17,dy:-34,w:34,h:34
  });
  assert.equal(fit.w/fit.h,1,'the authored 16×16 frame remains square');
  assert.notEqual(fit.h,player.h,'the visual is fitted inside, not stretched to, the collision box');
  assert(operations.drawCalls.some(args=>args.length===9&&args[5]===-17&&args[6]===-34&&args[7]===34&&args[8]===34),
    'canvas draw uses the fitted, foot-centered destination rectangle');
});

test('finite-bounds camera keeps the oracle follow target and smoothing',async()=>{
  const {engine}=engineHarness();
  await engine.loadReferenceTheme(theme);
  engine.state.runtime={bounds:{x:100,y:40,w:2000,h:600}};
  engine.state.behavior=api.createPlayerBehavior({playerSpawn:{x:1000,y:300},bounds:engine.state.runtime.bounds,surfaces:{solid:[],solidTop:[]}});
  engine.state.camera={x:0,y:0,zoom:1};
  engine.followPlayer();
  assert.equal(engine.state.camera.x,-63.2,'(player.x - 210) is clamped to bounds then eased by 0.08');
  assert(Number.isFinite(engine.state.camera.y));
});

test('player visual states use theme animations with established walk and run cadence',async()=>{
  const {engine}=engineHarness();
  await engine.loadReferenceTheme(theme);
  engine.loadReferenceEditorMap(fixture);
  const player=engine.state.behavior.player;
  player.animationState='walk';player.tick=0;
  assert.deepEqual(plain(engine.currentPlayerVisual().sourceRect),theme.resources[theme.animations['player.small.walk'].frames[0].resource].image.rect);
  player.tick=7;
  assert.deepEqual(plain(engine.currentPlayerVisual().sourceRect),theme.resources[theme.animations['player.small.walk'].frames[1].resource].image.rect);
  player.animationState='run';player.tick=5;
  assert.deepEqual(plain(engine.currentPlayerVisual().sourceRect),theme.resources[theme.animations['player.small.run'].frames[1].resource].image.rect);
  player.animationState='jump';player.face=-1;
  assert.deepEqual(plain(engine.currentPlayerVisual().sourceRect),theme.resources[theme.objects['player.small'].visuals.jump].image.rect);
});

test('invalid public map and theme loads clear an already rendered scene and retain diagnostics',async()=>{
  const {engine,elements,operations}=engineHarness();
  await engine.loadReferenceTheme(theme);
  engine.loadReferenceEditorMap(fixture);
  assert(engine.state.runtime);
  assert.equal(elements.empty.hidden,true);
  assert(operations.drawImage>0);

  operations.fillRect=operations.drawImage=0;
  const mapErrors=engine.loadReferenceEditorMap({...fixture,format:'old-map'});
  assert(mapErrors.length);
  assert.equal(engine.state.runtime,null);
  assert.equal(engine.state.map,null);
  assert.equal(elements.empty.hidden,false);
  assert.match(elements.diagnostics.textContent,/unsupported map format/);
  assert(operations.fillRect>0);
  assert.equal(operations.drawImage,0);

  engine.loadReferenceEditorMap(fixture);
  assert(engine.state.runtime);
  assert(engine.state.atlases.size>0);
  operations.fillRect=operations.drawImage=0;
  const themeErrors=await engine.loadReferenceTheme({...theme,format:'old-theme'});
  assert(themeErrors.length);
  assert.equal(engine.state.runtime,null);
  assert.equal(engine.state.theme,null);
  assert.equal(engine.state.atlases.size,0);
  assert.equal(elements.empty.hidden,false);
  assert.match(elements.diagnostics.textContent,/unsupported theme format/);
  assert(operations.fillRect>0);
  assert.equal(operations.drawImage,0);
});

test('file parse failures use the same scene invalidation path',async()=>{
  const {engine,elements,operations}=engineHarness();
  await engine.loadReferenceTheme(theme);
  engine.loadReferenceEditorMap(fixture);
  assert(engine.state.runtime);
  operations.fillRect=operations.drawImage=0;
  elements.mapFile.files=[{text:async()=>'{'}];
  await elements.mapFile.onchange();
  assert.equal(engine.state.runtime,null);
  assert.equal(engine.state.map,null);
  assert.equal(elements.empty.hidden,false);
  assert.match(elements.diagnostics.textContent,/map is not valid JSON/);
  assert(operations.fillRect>0);
  assert.equal(operations.drawImage,0);
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
