'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const editorHtml=fs.readFileSync('editor/reference_pack_editor.html','utf8');
const engineHtml=fs.readFileSync('engine/reference_pack_engine.html','utf8');
const theme=JSON.parse(fs.readFileSync('themes/theme_marioai_reference_pack.llmtheme.txt','utf8'));
const unitsContext={globalThis:{},structuredClone};
vm.runInNewContext(editorHtml.match(/<script id="unitPacks">([\s\S]*?)<\/script>/)[1],unitsContext);
const units=unitsContext.globalThis.ReferencePackUnits;
const boundary=engineHtml.match(/<script id="referencePackBoundary">([\s\S]*?)<\/script>/)[1],engineContext={globalThis:{}};
vm.runInNewContext(boundary,engineContext);
const api=engineContext.globalThis.ReferencePackBoundary;
const plain=value=>JSON.parse(JSON.stringify(value));
const builtIns=theme.contract.engineVocabulary.capabilities,engineGroups=theme.contract.engineVocabulary.parameterGroups;
const mapWith=(instances,t)=>({format:api.REFERENCE_MAP_FORMAT,mapVersion:1,theme:{id:t.id,packVersion:t.packVersion},worldBounds:{x:0,y:0,w:640,h:320},instances,markers:{start:{x:112,y:240},goal:null}});
const withData=plan=>{plan.unit.atlases[plan.atlasId].data='iVBORw0KGgo=';return plan.unit};

test('the engine-owned parameter groups are exactly the groups the engine and its built-ins read',()=>{
  // Every quoted 'group.key' path in the engine, built-in capability source included, that names a declared parameter.
  const read=new Set;for(const [,group,key] of boundary.matchAll(/['"`]([A-Za-z]+)\.([A-Za-z]+)['"`]/g))if(theme.parameterSchemas[group]?.[key])read.add(group);
  for(const entry of Object.values(theme.objects))for(const trigger of entry.bumpTriggers||[])if(trigger.contentsParameter)read.add(trigger.contentsParameter.split('.')[0]);
  assert.deepEqual([...read].sort(),[...engineGroups].sort(),'the contract records the groups the code reads, no more and no less');
  const owned=Object.keys(theme.parameterSchemas).filter(group=>!engineGroups.includes(group)).sort();
  assert.deepEqual(owned,['backgroundFill','block','bush','dome','greyStone','hill','orbit','rockpile','solidBlock'],'art pickers and pack-capability groups belong to their units');
});

test('built-in groups are referenced, never carried, and import does not list them',()=>{
  const rotating=units.exportUnitPlan(theme,'rotatingBlock',{builtIns}).unit;
  assert.equal(rotating.parameterSchemas.transform,undefined,'re-exporting rotatingBlock carries no transform');assert.deepEqual(plain(rotating.parameterSchemas),{});
  for(const id of Object.keys(theme.objects)){const unit=units.exportUnitPlan(theme,id,{builtIns}).unit;for(const group of Object.keys(unit.parameterSchemas))assert(!engineGroups.includes(group),`${id} carries no engine group (${group})`)}
  assert.deepEqual(Object.keys(units.exportUnitPlan(theme,'bush',{builtIns}).unit.parameterSchemas),['bush'],'an art picker still travels with its unit');
  assert.deepEqual(Object.keys(units.exportUnitPlan(theme,'orbitPlatform',{builtIns}).unit.parameterSchemas),['orbit'],'and so does a pack capability group');
  const old=withData(units.exportUnitPlan(theme,'goomba',{builtIns}));old.parameterSchemas.transform={x:{type:'string'}};old.parameterSchemas.walker={};
  const plan=units.planUnitImport(theme,old,{builtIns});assert(!plan.items.some(item=>item.section==='parameterSchemas'),'engine groups in a unit file are not listed as new, same or overwrite');
  assert.equal(units.applyUnitImport(theme,old,{builtIns}).theme.parameterSchemas.transform.x.type,'number','and never replace the engine\'s');
});

test('bump triggers are registered capabilities; the engine dispatches no bump by type name',()=>{
  for(const name of ['temporarySpin','dispenseContents']){const definition=api.BUILTIN_CAPABILITIES.get(name);assert.equal(definition.kind,'contact');assert.equal(typeof definition.source,'string')}
  assert(!/['"](temporarySpin|dispenseContents)['"]/.test(boundary.replace(/const BUILTIN_CAPABILITY_SOURCES=[\s\S]*?\n\};/,'')),'outside the built-in table the engine never names a trigger type');
  const odd=plain(theme);odd.objects.questionBlock.bumpTriggers=[{type:'confetti'}];
  const result=api.compileReferenceRuntime(odd,mapWith([{placeable:'questionBlock',values:{'transform.x':112,'transform.y':200}}],odd));
  assert(result.diagnostics.some(item=>item.code==='unregistered-capability'&&item.capability==='confetti'),'an unregistered trigger type is reported');
  const players=api.createPlayerBehavior(result.runtime),blocks=api.createBlockBehavior(result.runtime,players);Object.assign(players.player,{x:100,y:202,vy:-8});players.resolvePlayer();
  assert.deepEqual(plain(blocks.step().triggers),[],'and does nothing: the block just bumps');
  const editorContext={structuredClone,globalThis:{}};vm.runInNewContext(editorHtml.match(/<script id="contractSemantics">([\s\S]*?)<\/script>/)[1],editorContext);
  assert.deepEqual(plain(editorContext.globalThis.ReferencePackSemantics.unregisteredCapabilities(odd)),[{object:'questionBlock',capability:'confetti'}],'the editor flags it too');
});

test('every built-in is source text, compiled through the pack door',()=>{
  for(const name of api.BUILTIN_CAPABILITIES.names()){
    const definition=api.BUILTIN_CAPABILITIES.get(name),hooks=['init','step','contact','collect'].filter(hook=>definition[hook]);
    if(!hooks.length){assert.equal(definition.source,null,`${name} is a flag`);continue}
    const compiled=api.compileCapabilitySource(definition.source);assert.deepEqual(plain(compiled.errors),[]);
    assert.deepEqual(['init','step','contact','collect'].filter(hook=>compiled.definition[hook]),hooks,`${name} source holds exactly its hooks`);
  }
});

test('renaming every id on import keeps the copy whole and separate: a renamed rotating block spins with its own frames',()=>{
  const unit=withData(units.exportUnitPlan(theme,'rotatingBlock',{builtIns})),renames={};
  for(const item of units.planUnitImport(theme,unit,{builtIns}).items)renames[item.key]=item.section==='capabilities'?`${item.id}Two`:`two.${item.id}`;
  const {theme:next,plan}=units.applyUnitImport(theme,unit,{builtIns,renames});assert(plan.items.every(item=>item.action==='new'),'every renamed id is new');
  const copy=next.objects['two.rotatingBlock'];
  assert.equal(next.placeables['two.rotatingBlock'].object,'two.rotatingBlock','placeable points at the renamed object');
  assert.equal(copy.visuals.idle,'two.block.rotating.frame_0');assert.equal(copy.visuals.spinning,'two.block.rotating.spin','visual ids follow');
  assert(next.animations['two.block.rotating.spin'].frames.every(frame=>frame.resource.startsWith('two.')),'animation frames follow');
  assert(Object.keys(unit.resources).every(id=>next.resources[`two.${id}`].image.atlas==='two.unit.rotatingBlock'),'resources point at the renamed atlas');
  assert.deepEqual(plain(next.objects.rotatingBlock),theme.objects.rotatingBlock,'the original is untouched');
  const result=api.compileReferenceRuntime(next,mapWith([{placeable:'two.rotatingBlock',values:{'transform.x':112,'transform.y':200}}],next));
  assert.equal(result.ok,true);const runtime=result.runtime,players=api.createPlayerBehavior(runtime),blocks=api.createBlockBehavior(runtime,players),authored=runtime.drawCommands[0];
  Object.assign(players.player,{x:100,y:202,vy:-8});players.resolvePlayer();const event=blocks.step();
  assert.equal(event.triggers[0].type,'temporarySpin');assert.equal(runtime.surfaces.solid[0].disabled,true,'it spins and opens');
  const frames=new Set;for(let i=0;i<40;i++){frames.add(blocks.commandAt(authored).resource);blocks.step()}
  assert(frames.size>1&&[...frames].every(id=>id.startsWith('two.')),'with its own frames');assert(blocks.commandAt(authored).atlas==='two.unit.rotatingBlock');
  const edited=plain(next);edited.resources['two.block.rotating.frame_0'].image.rect.x+=16;
  assert.deepEqual(edited.resources['block.rotating.frame_0'],theme.resources['block.rotating.frame_0'],'editing the copy\'s art leaves the original alone');
});

test('the editor checks capability source with the engine\'s own compiler, copied verbatim',()=>{
  const block=html=>html.match(/\/\* CAPABILITY_COMPILER_START[\s\S]*?\/\* CAPABILITY_COMPILER_END \*\//)[0];
  assert.equal(block(editorHtml),block(engineHtml));
  assert.match(units.checkCapabilitySource('({ step( })')[0],/does not evaluate/);
  assert.match(units.checkCapabilitySource('({ step: 3 })')[0],/must be a function/);
  assert.match(units.checkCapabilitySource('({ collect() {}, step() {} })')[0],/only collect/);
  assert.deepEqual(plain(units.checkCapabilitySource(theme.capabilities.orbit.source)),[]);
  assert.throws(()=>units.setCapabilitySource(theme,'drift',{source:'({ step(self) { self.x += } })'}),/does not evaluate/,'Apply refuses source that does not compile');
});

test('a built-in can be forked into a pack capability and run under its new name',()=>{
  const source=api.BUILTIN_CAPABILITIES.get('patrol').source,forked=units.setCapabilitySource(theme,'pace',{description:'Copy of patrol',source:source.replace('self.state.speed = Number.isFinite','self.state.speed = 2 * 0 + Number.isFinite')},{builtIns});
  assert.throws(()=>units.setCapabilitySource(theme,'patrol',{source},{builtIns}),/built in/,'the built-in itself stays read-only');
  const t=plain(forked);t.objects.goomba.capabilities=['pace','stompable'];
  const behavior=api.createActorBehavior(api.compileReferenceRuntime(t,mapWith([{placeable:'goomba',values:{'transform.x':200,'transform.y':200,'walker.direction':'right','walker.patrolRange':40}}],t)).runtime);
  behavior.step(null,null);assert.equal(behavior.actors[0].x,200.4,'the fork walks like the original');assert.equal(behavior.actors[0].state.range,40);
});

test('live reload can run init again on units using the edited capability',()=>{
  const runtime=api.compileReferenceRuntime(theme,mapWith([{placeable:'orbitPlatform',values:{'transform.x':200,'transform.y':120,'extent.width':3,'orbit.radius':40}}],theme)).runtime,moving=api.createMovingPlatformBehavior(runtime),[orbit]=moving.platforms;
  for(let i=0;i<10;i++)moving.step();const angle=orbit.state.angle,source=theme.capabilities.orbit.source.replace('angle: -Math.PI / 2','angle: 0, laps: 0');
  api.reloadPackCapability(runtime,'orbit',{source},moving.platforms);assert.equal(orbit.state.angle,angle,'by default state is kept');assert.equal(orbit.state.laps,undefined);
  const again=api.reloadPackCapability(runtime,'orbit',{source},moving.platforms,{reinit:true});assert.equal(again.units,1);assert.deepEqual({angle:orbit.state.angle,laps:orbit.state.laps},{angle:0,laps:0},'with reinit, init runs again in the new shape');
});
