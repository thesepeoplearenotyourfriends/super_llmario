'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const vm=require('node:vm');

const editorHtml=fs.readFileSync('editor/reference_pack_editor.html','utf8');
const workbenchHtml=fs.readFileSync('editor/theme_pack_editor.html','utf8');
const engineHtml=fs.readFileSync('engine/reference_pack_engine.html','utf8');
const themeText=fs.readFileSync('themes/theme_marioai_reference_pack.llmtheme.txt','utf8'),theme=JSON.parse(themeText);
const unitsContext={globalThis:{},structuredClone};
vm.runInNewContext(editorHtml.match(/<script id="unitPacks">([\s\S]*?)<\/script>/)[1],unitsContext);
const units=unitsContext.globalThis.ReferencePackUnits;
const engineContext={globalThis:{}};
vm.runInNewContext(engineHtml.match(/<script id="referencePackBoundary">([\s\S]*?)<\/script>/)[1],engineContext);
const api=engineContext.globalThis.ReferencePackBoundary;
const plain=value=>JSON.parse(JSON.stringify(value));
const builtIns=theme.contract.engineVocabulary.capabilities;
const mapWith=(instances,t=theme)=>({format:api.REFERENCE_MAP_FORMAT,mapVersion:1,theme:{id:t.id,packVersion:t.packVersion},worldBounds:{x:0,y:0,w:640,h:320},instances,markers:{start:{x:40,y:300},goal:null}});
const fakeData=plan=>{plan.unit.atlases[plan.atlasId].data='iVBORw0KGgo=';return plan.unit};

test('the editor reuses the theme workbench ImportCore verbatim rather than a second copy of its own',()=>{
  const block=html=>html.match(/\/\* IMPORT_CORE_START[\s\S]*?\/\* IMPORT_CORE_END \*\//)[0];
  assert.equal(block(editorHtml),block(workbenchHtml));
  assert.deepEqual(plain(units.ImportCore.gridCells(40,20,{cellW:16,cellH:16})),[{id:'r0c0',row:0,column:0,x:0,y:0,w:16,h:16},{id:'r0c1',row:0,column:1,x:16,y:0,w:16,h:16}]);
});

test('every unit in the theme exports with exactly the art, groups and pack capabilities it needs',()=>{
  for(const id of Object.keys(theme.objects)){
    const plan=units.exportUnitPlan(theme,id,{builtIns}),unit=plan.unit;
    assert.equal(unit.format,'llmario-unit');assert.deepEqual(plain(unit.objects[id]),theme.objects[id],`${id} travels unchanged`);
    assert.deepEqual(Object.keys(unit.atlases),[plan.atlasId],`${id} carries one atlas of its own`);
    for(const [rid,resource] of Object.entries(unit.resources)){
      const r=resource.image.rect,source=theme.resources[rid].image.rect;
      assert.equal(resource.image.atlas,plan.atlasId);assert.deepEqual({w:r.w,h:r.h},{w:source.w,h:source.h},`${id}/${rid} keeps its pixel size`);
      assert(r.x>=0&&r.y>=0&&r.x+r.w<=plan.size.w&&r.y+r.h<=plan.size.h,`${id}/${rid} lies inside the cropped atlas`);
    }
    const sourceCells=new Set(Object.keys(unit.resources).map(rid=>{const i=theme.resources[rid].image;return`${i.atlas}|${i.rect.x},${i.rect.y},${i.rect.w},${i.rect.h}`}));
    assert.equal(plan.crops.length,sourceCells.size,`${id} crops each referenced cell once`);
    const cell=Math.max(...plan.crops.map(c=>c.draw.w))*Math.max(...plan.crops.map(c=>c.draw.h));assert(plan.size.w*plan.size.h<=cell*(plan.crops.length+Math.ceil(Math.sqrt(plan.crops.length))),`${id} atlas holds only its own cells`);
    const placeables=Object.entries(theme.placeables).filter(([,p])=>p.object===id).map(([pid])=>pid).sort();assert.deepEqual(Object.keys(unit.placeables).sort(),placeables);
    for(const placeable of Object.values(unit.placeables))for(const p of placeable.parameters)assert(unit.parameterSchemas[p.split('.')[0]],`${id} carries the ${p.split('.')[0]} group`);
    for(const name of Object.keys(unit.capabilities))assert(!builtIns.includes(name),'built-ins never travel as source');
  }
  const koopaPlan=units.exportUnitPlan(theme,'koopa.red',{builtIns}),koopa=koopaPlan.unit;assert(koopaPlan.size.w*koopaPlan.size.h<=64*128,'an enemy fits in a few cells');
  assert.deepEqual(Object.keys(koopa.parameterSchemas).sort(),['flight','transform','walker']);assert(koopa.animations['enemy.wing.flap'],'attachment art travels');assert.deepEqual(plain(koopa.capabilities),{});
  const orbit=units.exportUnitPlan(theme,'orbitPlatform',{builtIns}).unit;
  assert.deepEqual(Object.keys(orbit.capabilities),['orbit']);assert.equal(orbit.capabilities.orbit.source,theme.capabilities.orbit.source,'pack capability source travels as text');
  assert(orbit.constructions['construction.white-platform'],'construction art travels with its components');assert(orbit.parameterSchemas.orbit);
});

function without(t,objectId){
  // A theme that has never seen this unit: its object, placeables, and everything only it uses are gone.
  const next=plain(t),unit=units.exportUnitPlan(t,objectId,{builtIns}).unit,others=Object.entries(t.objects).filter(([id])=>id!==objectId).map(([id])=>units.unitArt(t,t.objects[id]));
  const keep=section=>new Set(others.flatMap(art=>art[section]));
  delete next.objects[objectId];for(const id of Object.keys(unit.placeables))delete next.placeables[id];
  for(const section of ['resources','animations','frameGroups','constructions']){const used=keep(section);for(const id of Object.keys(unit[section]))if(!used.has(id))delete next[section][id]}
  for(const name of Object.keys(unit.capabilities))delete next.capabilities[name];if(next.capabilities&&!Object.keys(next.capabilities).length)delete next.capabilities;
  return next;
}

test('import lists every incoming id as new or overwriting and changes nothing until applied',()=>{
  const unit=fakeData(units.exportUnitPlan(theme,'orbitPlatform',{builtIns})),target=without(theme,'orbitPlatform'),before=plain(target);
  const plan=units.planUnitImport(target,unit,{builtIns});
  assert.equal(plan.ok,true);
  const total=units.UNIT_SECTIONS.reduce((n,section)=>n+Object.keys(unit[section]||{}).length,0);assert.equal(plan.items.length,total,'every incoming id is listed');
  const by=key=>plan.items.find(item=>item.key===key);
  assert.equal(by('objects:orbitPlatform').action,'new');assert.equal(by('capabilities:orbit').action,'new');assert.equal(by('capabilities:orbit').source,unit.capabilities.orbit.source,'capability source is shown before import');
  assert.equal(by('parameterSchemas:transform').action,'same','an identical group is still listed');assert(by('parameterSchemas:transform').users>10);
  assert.equal(by('resources:bar.white.left_cap').action,'overwrite','shared art that now points at the unit atlas overwrites');
  assert.deepEqual(plain(target),before,'planning touches nothing');
  const {theme:next}=units.applyUnitImport(target,unit,{builtIns});assert.deepEqual(plain(target),before,'the original theme object is never mutated');
  assert.deepEqual(plain(next.objects.orbitPlatform),theme.objects.orbitPlatform);assert.deepEqual(plain(next.placeables.orbitPlatform),theme.placeables.orbitPlatform);assert.deepEqual(plain(next.capabilities.orbit),theme.capabilities.orbit);
  const runtime=api.compileReferenceRuntime(next,mapWith([{placeable:'orbitPlatform',values:{'transform.x':200,'transform.y':120,'extent.width':3,'orbit.radius':30}}],next));
  assert.equal(runtime.ok,true);assert.deepEqual(plain(runtime.diagnostics.filter(d=>d.severity==='error')),[]);
  assert(runtime.runtime.drawCommands.every(command=>command.atlas==='unit.orbitPlatform'),'the imported unit draws from its own atlas');
  const moving=api.createMovingPlatformBehavior(runtime.runtime);moving.step();assert.notEqual(moving.platforms[0].x,200,'and its pack capability runs');
});

test('overwriting a capability says how many units use it, and renames rewrite every reference',()=>{
  const unit=fakeData(units.exportUnitPlan(theme,'orbitPlatform',{builtIns}));
  const plan=units.planUnitImport(theme,unit,{builtIns}),orbit=plan.items.find(item=>item.key==='capabilities:orbit');
  assert.equal(orbit.action,'same');assert.equal(orbit.users,1,'one unit uses orbit today');
  const changed=plain(unit);changed.capabilities.orbit.source=changed.capabilities.orbit.source.replace('s.angle += s.rate','s.angle += 2 * s.rate');
  assert.equal(units.planUnitImport(theme,changed,{builtIns}).items.find(item=>item.key==='capabilities:orbit').action,'overwrite');
  const renames={'capabilities:orbit':'swirl','parameterSchemas:orbit':'swirl','objects:orbitPlatform':'swirlPlatform','placeables:orbitPlatform':'swirlPlatform','constructions:construction.white-platform':'swirl.platform','atlases:unit.orbitPlatform':'swirl.atlas','resources:bar.white.left_cap':'swirl.cap','resources:ladder.body':'swirl.body'};
  const renamed=units.planUnitImport(theme,changed,{builtIns,renames});assert.equal(renamed.ok,true);
  assert.equal(renamed.items.find(item=>item.key==='parameterSchemas:orbit').note,"rewrites 4 'orbit.' paths in orbit to 'swirl.'",'a group rename says what it rewrites in capability source');
  const koopa=fakeData(units.exportUnitPlan(theme,'koopa.red',{builtIns}));assert.match(units.planUnitImport(theme,koopa,{builtIns,renames:{'parameterSchemas:walker':'stroll'}}).items.find(item=>item.key==='parameterSchemas:walker').note,/built-in capabilities \(patrol, winged, stompable, armored, shell\) read their own group names/,'and warns when built-ins will not follow');
  for(const key of Object.keys(renames))assert.equal(renamed.items.find(item=>item.key===key).action,'new',`${key} renamed to a free id is new`);
  const next=units.applyUnitImport(theme,changed,{builtIns,renames}).theme;
  assert.deepEqual(plain(next.objects.orbitPlatform),theme.objects.orbitPlatform,'the existing unit is untouched');assert.equal(next.capabilities.orbit.source,theme.capabilities.orbit.source);
  const swirl=next.objects.swirlPlatform;assert.deepEqual(plain(swirl.capabilities),['swirl']);assert.equal(swirl.visuals.idle,'swirl.platform');
  assert.deepEqual(plain(next.constructions['swirl.platform'].components),{left:'swirl.cap',middle:'swirl.body',right:'swirl.cap'});
  assert.equal(next.resources['swirl.cap'].image.atlas,'swirl.atlas');
  assert.deepEqual(plain(next.placeables.swirlPlatform.parameters),['transform.x','transform.y','extent.width','swirl.radius','swirl.speed','swirl.direction']);assert.equal(next.placeables.swirlPlatform.object,'swirlPlatform');
  const registry=api.capabilityRegistryFor(next);assert.deepEqual(plain(registry.diagnostics),[]);assert(registry.registry.get('swirl'));
  const runtime=api.compileReferenceRuntime(next,mapWith([{placeable:'swirlPlatform',values:{'transform.x':200,'transform.y':120,'extent.width':3,'swirl.radius':30}}],next)).runtime,moving=api.createMovingPlatformBehavior(runtime);
  moving.step();assert(Math.abs(moving.platforms[0].state.angle-(-Math.PI/2+2*1/30))<1e-12,'the renamed capability runs its own source, reading its renamed parameters');
});

test('import refuses until problems are renamed away: built-in names, bad ids, clashes',()=>{
  const unit=fakeData(units.exportUnitPlan(theme,'orbitPlatform',{builtIns}));unit.capabilities.patrol=unit.capabilities.orbit;
  let plan=units.planUnitImport(theme,unit,{builtIns});assert.equal(plan.ok,false);assert.match(plan.items.find(item=>item.key==='capabilities:patrol').problem,/built-in/);
  assert.throws(()=>units.applyUnitImport(theme,unit,{builtIns}),/built-in/);
  plan=units.planUnitImport(theme,unit,{builtIns,renames:{'capabilities:patrol':'orbit'}});assert.match(plan.items.find(item=>item.key==='capabilities:patrol').problem,/also chosen/);
  plan=units.planUnitImport(theme,unit,{builtIns,renames:{'capabilities:patrol':'two words'}});assert.match(plan.items.find(item=>item.key==='capabilities:patrol').problem,/valid id/);
  plan=units.planUnitImport(theme,unit,{builtIns,renames:{'capabilities:patrol':'pace'}});assert.equal(plan.ok,true);
  assert.deepEqual(plain(units.validateUnit({format:'llmario-unit',objects:{a:{}},atlases:{x:{encoding:'base64'}},capabilities:{c:{}}})),['capability c carries no source text','atlas x carries no embedded image']);
});

test('authoring: copy a unit, point a state at new cells, choose its capabilities and parameter groups',()=>{
  let t=units.cloneUnit(theme,'goomba','goomba.blue','Blue Goomba');
  assert.deepEqual(plain(t.objects['goomba.blue']),theme.objects.goomba);assert.equal(t.placeables['goomba.blue'].label,'Blue Goomba');assert.equal(t.placeables['goomba.blue'].object,'goomba.blue');
  assert.throws(()=>units.cloneUnit(t,'goomba','goomba.blue'),/taken/);
  t=units.ImportCore.createAtlas(t,{atlasId:'sheet.blue',mediaType:'image/png',base64:'iVBORw0KGgo=',sourceName:'blue.png',width:64,height:32,settings:{cellW:16,cellH:32}}).theme;
  const cells=units.ImportCore.gridCells(64,32,{cellW:16,cellH:32}),made=units.ImportCore.createResources(t,'sheet.blue',cells,new Set(['r0c1','r0c2']),'goomba.blue.walk');t=made.theme;
  t=units.pointVisual(t,'goomba.blue','walk',made.resourceIds);
  assert.equal(t.objects['goomba.blue'].visuals.walk,'goomba.blue.walk');assert.deepEqual(plain(t.animations['goomba.blue.walk'].frames.map(f=>f.resource)),plain(made.resourceIds));assert.equal(theme.objects.goomba.visuals.walk,'enemy.goomba.walk','the template keeps its art');
  t=units.setUnitCapabilities(t,'goomba.blue',['patrol','winged','stompable'],['walker','flight']);
  assert.deepEqual(plain(t.objects['goomba.blue'].capabilities),['patrol','winged','stompable']);assert(t.placeables['goomba.blue'].parameters.includes('flight.hasWings'));
  const result=api.compileReferenceRuntime(t,mapWith([{placeable:'goomba.blue',values:{'transform.x':100,'transform.y':200,'flight.hasWings':true,'flight.flying':true}}],t));
  assert.equal(result.ok,true);assert.equal(result.runtime.drawCommands.find(c=>!c.attachment).atlas,'sheet.blue','the new unit draws its own cells');
  const flying=api.createActorBehavior(result.runtime);flying.step(null,null);assert.notEqual(flying.actors[0].y,200,'and gained wings it can fly with');
  const exported=units.exportUnitPlan(t,'goomba.blue',{builtIns});assert.deepEqual(plain(exported.crops.filter(c=>c.atlas==='sheet.blue').map(c=>c.source.x).sort()),[16,32],'its export crops only the cells it uses');
});

test('a pack splits back into exactly the theme and map it was made from',()=>{
  const demoText=fs.readFileSync('maps/demo.llmmap.txt','utf8'),pack=units.makePack(theme,JSON.parse(demoText)),split=units.splitPack(JSON.parse(units.serialize(pack)));
  assert.deepEqual(plain(split.errors),[]);assert.deepEqual(plain(split.theme),theme);assert.equal(units.serialize(split.map),demoText,'the map comes back byte for byte');
  assert.equal(units.serialize(split.theme),units.serialize(theme),'the theme comes back as the same document');
  const engineSplit=api.splitReferencePack(JSON.parse(units.serialize(pack)));assert.deepEqual(plain(engineSplit),plain(split),'engine and editor split alike');
  assert.equal(units.splitPack({format:'llmario-pack',theme:[],map:{}}).errors[0],'pack theme must be an object');assert.match(units.splitPack(theme).errors[0],/not a llmario-pack/);
});

test('the pack command line joins and splits files, byte for byte for canonical JSON',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'llmpack-')),file=name=>path.join(dir,name),themeCanonical=units.serialize(theme);
  fs.writeFileSync(file('theme.txt'),themeCanonical);
  for(const map of ['maps/demo.llmmap.txt','maps/breakout_caves.llmmap.txt','maps/updraft.llmmap.txt']){
    cp.execFileSync(process.execPath,['scripts/llmario_pack.js','join',file('theme.txt'),map,file('pack.txt')],{stdio:'pipe'});
    cp.execFileSync(process.execPath,['scripts/llmario_pack.js','split',file('pack.txt'),file('t.txt'),file('m.txt')],{stdio:'pipe'});
    assert.equal(fs.readFileSync(file('m.txt'),'utf8'),fs.readFileSync(map,'utf8'),`${map} round-trips byte for byte`);
    assert.equal(fs.readFileSync(file('t.txt'),'utf8'),themeCanonical);
  }
  assert.deepEqual(JSON.parse(themeText),JSON.parse(themeCanonical),'the shipped theme file is the same document');
  fs.rmSync(dir,{recursive:true,force:true});
});

test('the engine loads a pack from either file button',async()=>{
  const packText=units.serialize(units.makePack(theme,JSON.parse(fs.readFileSync('maps/demo.llmmap.txt','utf8')))),frames=[],noop=()=>{};
  for(const button of ['themeFile','mapFile']){
    const elements={screen:{width:960,height:480,getContext:()=>new Proxy({},{get:()=>noop})},stage:{getBoundingClientRect:()=>({width:960,height:480})},diagnostics:{textContent:'',className:''},empty:{hidden:false},themeButton:{},mapButton:{},fitButton:{},coinCount:{value:'',textContent:''},livesCount:{value:'',textContent:''},themeFile:{files:[],value:''},mapFile:{files:[],value:''}};
    class FakeImage{set src(value){this._src=value;this.onload?.()}get src(){return this._src}}
    const window={ReferencePackBoundary:api};vm.runInNewContext(engineHtml.match(/<script>\s*([\s\S]*?)<\/script><\/body>/)[1],{window,document:{getElementById:id=>elements[id]},Image:FakeImage,devicePixelRatio:1,requestAnimationFrame(fn){frames.push(fn)},addEventListener:noop,Map,Set,Math,Promise,console});
    elements[button].files=[{text:async()=>packText}];await elements[button].onchange();
    const state=window.ReferenceEngine.state;assert(state.runtime,`${button} took the pack`);assert.equal(state.theme.id,theme.id);
    assert(state.platformBehavior.platforms.some(platform=>platform.instance.placeable==='orbitPlatform'),'the pack map plays with the pack theme');
  }
});
